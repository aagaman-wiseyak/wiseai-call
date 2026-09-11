import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Form, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from services.turn_orchestrator import turn_orchestrator
from services.tts_service import tts_service
from services.asr_service import asr_service

logger = logging.getLogger("call_router")
router = APIRouter(prefix="/api/call", tags=["Call Session & Voice Routing"])

class ProcessTurnRequest(BaseModel):
    user_text: str
    current_node_id: str
    nodes: List[Dict[str, Any]]
    edges: List[Dict[str, Any]]
    campaign_knowledge: Optional[Dict[str, Any]] = None
    conversation_history: List[Dict[str, Any]] = Field(default_factory=list)
    # This state is persisted by the call-session service in production. It is
    # echoed for the current client while persistence is being introduced.
    conversation_state: Dict[str, Any] = Field(default_factory=dict)
    variables: Dict[str, Any] = Field(default_factory=dict)
    synthesize_audio: bool = False
    language: str = "eng"

class ProcessTurnResponse(BaseModel):
    next_node_id: Optional[str]
    ai_response_text: str
    intent_matched: str
    confidence: float
    knowledge_invoked: bool
    knowledge_topic: Optional[str] = None
    knowledge_source_ids: List[str] = Field(default_factory=list)
    reasoning: str
    action_payload: Optional[Dict[str, Any]] = None
    updated_variables: Dict[str, Any] = Field(default_factory=dict)
    conversation_state: Dict[str, Any] = Field(default_factory=dict)
    audio_base64: Optional[str] = None

class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    language: str = "eng"
    speed: float = 1.0

@router.post("/process-turn", response_model=ProcessTurnResponse)
async def process_turn(req: ProcessTurnRequest):
    """
    Interpret and execute one customer turn.

    Compound answers such as “yes, but why?” hold the valid affirmative route,
    answer only from campaign-approved knowledge, and resume the held route
    only after the customer indicates that the question is resolved.
    """
    current_node = next((n for n in req.nodes if n.get("id") == req.current_node_id), None)
    if not current_node:
        raise HTTPException(status_code=404, detail=f"Node {req.current_node_id} not found in graph")

    # Outgoing paths are the sole set of transitions the model may propose.
    outgoing = [e for e in req.edges if e.get("source") == req.current_node_id]
    routing_result = await turn_orchestrator.process(
        user_text=req.user_text,
        current_node=current_node,
        outgoing_branches=outgoing,
        all_nodes=req.nodes,
        campaign_knowledge=req.campaign_knowledge,
        conversation_state=req.conversation_state,
        conversation_history=req.conversation_history,
        language=req.language,
    )

    next_id = routing_result.get("next_node_id")
    next_node = next((n for n in req.nodes if n.get("id") == next_id), None)

    ai_speech = ""
    action_data = None
    # Knowledge answers are already composed by the grounded orchestrator.
    if routing_result.get("knowledge_invoked"):
        ai_speech = routing_result.get("ai_response_text", "")
    elif next_node:
        ntype = next_node.get("data", {}).get("type")
        if ntype == "question":
            ai_speech = next_node.get("data", {}).get("speechPrompt", "")
        elif ntype == "knowledge":
            ai_speech = next_node.get("data", {}).get("rebuttalScript", "")
        elif ntype == "action":
            action_data = next_node.get("data", {}).get("actionConfig", {})
            ai_speech = f"Perfect! I am locking in your {next_node.get('data', {}).get('label', 'selected plan')} and sending your confirmation link right away."
        elif ntype == "hangup":
            ai_speech = next_node.get("data", {}).get("closingScript", "Thank you for your time. Goodbye!")
        else:
            ai_speech = next_node.get("data", {}).get("label", "")

    for k, v in req.variables.items():
        ai_speech = ai_speech.replace(f"{{{{{k}}}}}", str(v))

    audio_b64 = None
    if req.synthesize_audio and ai_speech:
        tts_res = await tts_service.synthesize_speech(ai_speech, language=req.language)
        audio_b64 = tts_res.get("audio_base64")

    return ProcessTurnResponse(
        next_node_id=next_id,
        ai_response_text=ai_speech,
        intent_matched=routing_result.get("intent_matched", "routed"),
        confidence=routing_result.get("confidence", 0.0),
        knowledge_invoked=routing_result.get("knowledge_invoked", False),
        knowledge_topic=routing_result.get("knowledge_topic"),
        knowledge_source_ids=routing_result.get("knowledge_source_ids", []),
        reasoning=routing_result.get("reasoning", "Mapped by LLM intent router"),
        action_payload=action_data,
        audio_base64=audio_b64,
        updated_variables=req.variables,
        conversation_state=routing_result.get("conversation_state", req.conversation_state),
    )

@router.get("/campaign-knowledge/isp")
async def get_isp_campaign_knowledge():
    """Deprecated: campaign knowledge must be supplied by the campaign store."""
    raise HTTPException(status_code=410, detail="Campaign knowledge is campaign-scoped and no longer served as a global default.")

@router.post("/tts")
async def synthesize_speech(req: TTSRequest):
    """
    Synthesizes speech using WiseAI TTS:
    POST /generate_from_text (omnivoice_tts)
    Supports English ('eng') and Nepali ('nep').
    """
    return await tts_service.synthesize_speech(
        text=req.text,
        voice_id=req.voice_id,
        language=req.language,
        speed=req.speed,
    )

@router.websocket("/ws-tts")
async def websocket_tts_stream(websocket: WebSocket):
    """
    Real-time bidirectional WebSocket TTS stream powered by OmniVoice.
    Client sends JSON:
        {"text": "...", "voice_id": "Prakash_0", "language": "english", "speed": 1.0}
    Server streams:
        1. JSON: {"type": "start", "sample_rate": 24000, "format": "pcm_s16le"}
        2. Binary: 16-bit PCM raw audio chunks
        3. JSON: {"type": "done", "sample_rate": 24000}
    """
    await websocket.accept()
    try:
        data = await websocket.receive_json()
        text = data.get("text", "")
        voice_id = data.get("voice_id")
        language = data.get("language", "eng")
        speed = float(data.get("speed", 1.0))

        if not text or not text.strip():
            await websocket.send_json({"type": "done", "status": "empty_text"})
            await websocket.close()
            return

        first_chunk = True
        sample_rate_recorded = 24000

        async for pcm_chunk, sample_rate in tts_service.stream_speech_pcm(
            text=text,
            voice_id=voice_id,
            language=language,
            speed=speed,
        ):
            sample_rate_recorded = sample_rate
            if first_chunk:
                await websocket.send_json({
                    "type": "start",
                    "sample_rate": sample_rate,
                    "format": "pcm_s16le",
                    "channels": 1,
                })
                first_chunk = False

            if pcm_chunk:
                await websocket.send_bytes(pcm_chunk)

        await websocket.send_json({"type": "done", "sample_rate": sample_rate_recorded})
    except WebSocketDisconnect:
        logger.debug("TTS WebSocket client disconnected.")
    except Exception as e:
        logger.error(f"Error in TTS WebSocket streaming: {e}")
        try:
            await websocket.send_json({"type": "error", "error": str(e)})
        except Exception:
            pass
    finally:
        try:
            await websocket.close()
        except Exception:
            pass

@router.post("/tts-stream")
async def stream_speech_http(req: TTSRequest):
    """
    Streams raw 16-bit PCM audio chunks over chunked HTTP transfer.
    """
    async def pcm_generator():
        async for chunk, _ in tts_service.stream_speech_pcm(
            text=req.text,
            voice_id=req.voice_id,
            language=req.language,
            speed=req.speed,
        ):
            if chunk:
                yield chunk

    return StreamingResponse(
        pcm_generator(),
        media_type="application/octet-stream",
        headers={
            "X-Sample-Rate": "24000",
            "X-Audio-Format": "pcm_s16le",
            "X-Channels": "1",
        },
    )

@router.post("/asr")
async def transcribe_speech(
    file: UploadFile = File(...),
    language: Optional[str] = Form("eng"),
):
    """
    Transcribes audio using WiseAI ASR:
    POST /transcribe-from-stream
    Supports English ('eng') and Nepali ('nep').
    """
    audio_bytes = await file.read()
    return await asr_service.transcribe_audio(
        audio_bytes=audio_bytes,
        language=language,
        filename=file.filename or "audio.wav",
    )
