import logging
from fastapi import APIRouter, HTTPException, UploadFile, File, Form
from pydantic import BaseModel, Field
from typing import List, Dict, Any, Optional

from services.intent_router import intent_router_service
from services.knowledge_service import knowledge_service, DEFAULT_ISP_KNOWLEDGE
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
    reasoning: str
    action_payload: Optional[Dict[str, Any]] = None
    updated_variables: Dict[str, Any] = Field(default_factory=dict)
    audio_base64: Optional[str] = None

class TTSRequest(BaseModel):
    text: str
    voice_id: Optional[str] = None
    language: str = "eng"
    speed: float = 1.0

@router.post("/process-turn", response_model=ProcessTurnResponse)
async def process_turn(req: ProcessTurnRequest):
    """
    Processes user response:
    1. Checks if customer asks a campaign knowledge question (packages, Mbps tiers, discounts, routers).
    2. If knowledge question: answers it accurately using campaign knowledge and stays on current node.
    3. Runs LLM Intent Router: analyzes outgoing branches from current_node_id to determine next step (Q3 vs Q4, action, rebuttal, or hangup).
    4. Optionally synthesizes voice audio using WiseAI TTS.
    """
    current_node = next((n for n in req.nodes if n.get("id") == req.current_node_id), None)
    if not current_node:
        raise HTTPException(status_code=404, detail=f"Node {req.current_node_id} not found in graph")

    current_prompt = (
        current_node.get("data", {}).get("speechPrompt")
        or current_node.get("data", {}).get("openingScript")
        or current_node.get("data", {}).get("label", "")
    )

    # 1. Check if user is asking a campaign knowledge question (packages, Mbps, discounts, etc.)
    is_knowledge, answer_text, topic = await knowledge_service.check_and_answer_question(
        user_text=req.user_text,
        current_step_prompt=current_prompt,
        campaign_knowledge=req.campaign_knowledge,
        language=req.language,
    )

    if is_knowledge and answer_text:
        logger.info(f"Campaign knowledge query detected on topic '{topic}': {req.user_text}")
        audio_b64 = None
        if req.synthesize_audio:
            tts_res = await tts_service.synthesize_speech(answer_text, language=req.language)
            audio_b64 = tts_res.get("audio_base64")

        return ProcessTurnResponse(
            next_node_id=req.current_node_id,
            ai_response_text=answer_text,
            intent_matched=f"Campaign Knowledge: {topic}",
            confidence=0.96,
            knowledge_invoked=True,
            knowledge_topic=topic,
            reasoning=f"User inquired about {topic}. Answered directly from campaign catalog.",
            audio_base64=audio_b64,
            updated_variables=req.variables,
        )

    # 2. Extract outgoing branches departing from current_node_id
    outgoing = [e for e in req.edges if e.get("source") == req.current_node_id]

    if not outgoing:
        return ProcessTurnResponse(
            next_node_id=None,
            ai_response_text="Thank you so much for your time today. Have a wonderful day!",
            intent_matched="terminal_step",
            confidence=1.0,
            knowledge_invoked=False,
            reasoning="Current step has no further outgoing branches.",
            updated_variables=req.variables,
        )

    # 3. Use LLM Intent Router to map response to next question/node
    routing_result = await intent_router_service.route_intent(
        user_text=req.user_text,
        current_node=current_node,
        outgoing_branches=outgoing,
        all_nodes=req.nodes,
        conversation_history=req.conversation_history,
    )

    next_id = routing_result["next_node_id"]
    next_node = next((n for n in req.nodes if n.get("id") == next_id), None)

    ai_speech = ""
    action_data = None
    if next_node:
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
        intent_matched=routing_result.get("intent", "routed"),
        confidence=routing_result.get("confidence", 0.9),
        knowledge_invoked=False,
        reasoning=routing_result.get("reasoning", "Mapped by LLM intent router"),
        action_payload=action_data,
        audio_base64=audio_b64,
        updated_variables=req.variables,
    )

@router.get("/campaign-knowledge/isp")
async def get_isp_campaign_knowledge():
    """Returns the rich ISP Renewal campaign knowledge catalog."""
    return DEFAULT_ISP_KNOWLEDGE

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
