import logging
import httpx
import base64
import re
import json
import struct
import io
import wave
import time
import asyncio
from typing import Dict, Any, Optional, AsyncGenerator, Tuple
from config import settings

logger = logging.getLogger("tts_service")

try:
    import websockets
except ImportError:
    websockets = None

def normalize_tts_language(lang: Optional[str], text: Optional[str] = None) -> str:
    """
    Normalizes language to 'nep' or 'eng' per WiseAI HTTP TTS specification.
    Also auto-detects Devanagari script if text is provided.
    """
    if lang:
        clean = lang.lower().strip()
        if clean in ["nep", "nepali", "ne"]:
            return "nep"
        if clean in ["eng", "english", "en"]:
            return "eng"

    if text and re.search(r"[\u0900-\u097F]", text):
        return "nep"

    return "eng"

def normalize_omnivoice_language(lang: Optional[str], text: Optional[str] = None) -> str:
    """
    Normalizes language to 'nepali', 'english', or 'maithili'
    per OmniVoice Flow-Matching streaming specification.
    """
    if lang:
        clean = lang.lower().strip()
        if clean in ["nep", "nepali", "ne"]:
            return "nepali"
        if clean in ["eng", "english", "en"]:
            return "english"
        if clean in ["mai", "maithili"]:
            return "maithili"

    if text and re.search(r"[\u0900-\u097F]", text):
        return "nepali"

    return "english"

def ensure_int16_pcm(data: bytes) -> bytes:
    """
    Ensures binary audio chunk is 16-bit PCM (int16 LE).
    If incoming chunk is 32-bit float PCM, converts it to 16-bit PCM.
    """
    if not data:
        return b""
    if len(data) % 4 == 0:
        try:
            # Check if values fit float32 normalized audio range [-1.5, 1.5]
            first_val = struct.unpack_from("<f", data, 0)[0]
            if -1.5 <= first_val <= 1.5:
                count = len(data) // 4
                floats = struct.unpack(f"<{count}f", data)
                if all(-2.0 <= f <= 2.0 for f in floats[:min(count, 16)]):
                    int16_samples = [max(-32768, min(32767, int(f * 32767.0))) for f in floats]
                    return struct.pack(f"<{count}h", *int16_samples)
        except Exception:
            pass
    return data

def pcm_to_wav_bytes(pcm_data: bytes, sample_rate: int = 24000, channels: int = 1, sample_width: int = 2) -> bytes:
    """
    Wraps raw 16-bit PCM audio in standard RIFF WAVE container.
    """
    buf = io.BytesIO()
    with wave.open(buf, "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(sample_rate)
        wf.writeframes(pcm_data)
    return buf.getvalue()

class TTSService:
    """
    Text-To-Speech (TTS) service integrated with WiseAI OmniVoice:
    - Persistent WebSocket Streaming: wss://.../stream_from_text (Ultra-low latency chunks)
    - HTTP Fallback: POST /generate_from_text (Full audio generation)
    Supports English ('english'/'eng'), Nepali ('nepali'/'nep'), and Maithili ('maithili').
    Default voice: Pratikshya
    """
    def __init__(self):
        self.api_url = settings.TTS_API_URL
        self.fallback_url = getattr(settings, "TTS_FALLBACK_URL", None)
        self.ws_url = getattr(settings, "TTS_WS_URL", "wss://dev-tts.wiseai.wiseyak.com/stream_from_text")
        self.streaming_enabled = getattr(settings, "TTS_STREAMING_ENABLED", True)
        self.timeout = settings.TTS_TIMEOUT
        self.default_voice = getattr(settings, "TTS_DEFAULT_VOICE", "Pratikshya")
        self.model = getattr(settings, "TTS_MODEL", "omnivoice_tts")
        self._ws = None
        self._lock = asyncio.Lock()

    async def _get_or_create_ws(self):
        """
        Reuses an existing open WebSocket connection to eliminate TLS/handshake latency (~1.2s saving),
        or connects if not already established.
        """
        if self._ws is not None:
            is_open = False
            if hasattr(self._ws, "closed") and not self._ws.closed:
                is_open = True
            elif hasattr(self._ws, "state") and self._ws.state.name == "OPEN":
                is_open = True
            if is_open:
                return self._ws
            self._ws = None

        logger.info(f"Establishing persistent OmniVoice WebSocket connection ({self.ws_url})...")
        self._ws = await websockets.connect(
            self.ws_url,
            open_timeout=8.0,
            ping_interval=20,
            ping_timeout=20,
            max_size=10 * 1024 * 1024,
        )
        return self._ws

    async def warm_connection(self):
        """Pre-warms the WebSocket connection in background so first call has zero handshake latency."""
        try:
            async with self._lock:
                await self._get_or_create_ws()
                logger.info("OmniVoice WebSocket connection pre-warmed successfully.")
        except Exception as e:
            logger.warning(f"Could not pre-warm OmniVoice WebSocket connection: {e}")

    async def stream_speech_pcm(
        self,
        text: str,
        voice_id: Optional[str] = None,
        language: str = "eng",
        speed: float = 1.0,
    ) -> AsyncGenerator[Tuple[bytes, int], None]:
        """
        Connects to OmniVoice WebSocket (/stream_from_text) and yields PCM audio chunks in real time:
        Yields (chunk_bytes: bytes, sample_rate: int)
        Payload specification:
        - text, language ('english'/'nepali'/'maithili'), model, reference_audio_id,
          audio_speed, num_step (4), initial_codec_chunk_frames (1), cfg_strength (1.0)
        """
        voice = voice_id or self.default_voice
        stream_lang = normalize_omnivoice_language(language, text)
        sample_rate = 24000

        payload = {
            "text": text,
            "language": stream_lang,
            "model": self.model,
            "reference_audio_id": voice,
            "audio_speed": float(speed if speed else 1.0),
            "num_step": 4,
            "initial_codec_chunk_frames": 1,
            "cfg_strength": 1.0,
        }

        ws_succeeded = False
        if websockets and self.streaming_enabled:
            async with self._lock:
                start_time = time.perf_counter()
                first_chunk_time = None
                last_chunk_time = None
                chunk_count = 0
                total_pcm_bytes = 0

                try:
                    t_conn_start = time.perf_counter()
                    ws = await self._get_or_create_ws()
                    conn_duration = time.perf_counter() - t_conn_start

                    if conn_duration > 0.08:
                        logger.info(f"Connected to OmniVoice in {conn_duration:.4f}s")
                    else:
                        logger.info("Reusing warm OmniVoice WebSocket connection (0ms TLS/TCP delay)")

                    t_send = time.perf_counter()
                    await ws.send(json.dumps(payload))
                    logger.info(f"OmniVoice payload sent (voice={voice}, lang={stream_lang}), awaiting real-time chunks...")

                    async for message in ws:
                        now = time.perf_counter()
                        if isinstance(message, str):
                            try:
                                meta = json.loads(message)
                                if "sample_rate" in meta:
                                    sample_rate = int(meta["sample_rate"])
                                if meta.get("status") == "complete" or meta.get("type") == "done":
                                    logger.info("OmniVoice stream completion signal received.")
                                    break
                                if meta.get("error"):
                                    logger.error(f"OmniVoice WebSocket reported error: {meta.get('error')}")
                                    break
                            except Exception as parse_err:
                                logger.warning(f"Error parsing text message from OmniVoice WS: {parse_err}")
                        elif isinstance(message, bytes):
                            ws_succeeded = True
                            chunk_count += 1
                            pcm_chunk = ensure_int16_pcm(message)
                            total_pcm_bytes += len(pcm_chunk)

                            num_samples = len(pcm_chunk) // 2
                            chunk_ms = (num_samples / sample_rate) * 1000 if sample_rate > 0 else 0

                            if first_chunk_time is None:
                                first_chunk_time = now
                                model_ttft = first_chunk_time - t_send
                                total_ttft = first_chunk_time - start_time
                                logger.info(
                                    f"Chunk {chunk_count}: {len(pcm_chunk)} bytes ({chunk_ms:.1f}ms audio) | "
                                    f"Model TTFT: {model_ttft:.4f}s (Total TTFT: {total_ttft:.4f}s)"
                                )
                            else:
                                inter_chunk = now - last_chunk_time
                                logger.info(
                                    f"Chunk {chunk_count}: {len(pcm_chunk)} bytes ({chunk_ms:.1f}ms audio) | "
                                    f"Inter-chunk: {inter_chunk:.4f}s"
                                )

                            last_chunk_time = now
                            yield pcm_chunk, sample_rate

                    total_elapsed = time.perf_counter() - start_time
                    audio_duration = (total_pcm_bytes // 2) / sample_rate if sample_rate > 0 else 0.0
                    rtf = total_elapsed / audio_duration if audio_duration > 0 else 0.0
                    model_ttft_val = (first_chunk_time - t_send) if first_chunk_time else 0.0

                    logger.info(
                        f"OmniVoice Stream Summary: {chunk_count} chunks | "
                        f"Model TTFT: {model_ttft_val:.4f}s | Audio Duration: {audio_duration:.2f}s | "
                        f"Total Stream Time: {total_elapsed:.4f}s | RTF: {rtf:.2f}x"
                    )

                except Exception as ws_err:
                    logger.warning(f"OmniVoice WebSocket error on {self.ws_url}: {ws_err}")
                    try:
                        if self._ws:
                            await self._ws.close()
                    except Exception:
                        pass
                    self._ws = None

        # Fallback to HTTP if WebSocket was disabled, unreachable, or produced no chunks
        if not ws_succeeded:
            logger.info("Falling back to HTTP synthesize_speech for audio delivery...")
            http_result = await self.synthesize_speech(text, voice_id=voice, language=language, speed=speed)
            if http_result.get("audio_base64"):
                try:
                    raw_audio = base64.b64decode(http_result["audio_base64"])
                    if raw_audio.startswith(b"RIFF") and len(raw_audio) > 44:
                        pcm_body = raw_audio[44:]
                        chunk_size = 4800
                        for i in range(0, len(pcm_body), chunk_size):
                            yield pcm_body[i:i + chunk_size], sample_rate
                    else:
                        yield raw_audio, sample_rate
                except Exception as decode_err:
                    logger.error(f"Error yielding HTTP fallback audio: {decode_err}")

    async def synthesize_speech(
        self,
        text: str,
        voice_id: Optional[str] = None,
        language: str = "eng",
        speed: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Synthesizes complete audio via WiseAI TTS (/generate_from_text).
        Payload matches curl x-www-form-urlencoded specification:
        - bucket_name, target_sample_rate, filename, model, text, user_id, organization,
          service, reference_audio_id, language ('eng' or 'nep'), output_type, audio_speed
        """
        voice = voice_id or self.default_voice
        tts_lang = normalize_tts_language(language, text)
        logger.info(f"Synthesizing speech via WiseAI TTS HTTP ({self.api_url}): voice={voice}, lang={tts_lang}, text='{text[:45]}...'")

        payload = {
            "bucket_name": "string",
            "target_sample_rate": "0",
            "filename": "string",
            "model": self.model,
            "text": text,
            "user_id": "string",
            "organization": "string",
            "service": "string",
            "reference_audio_id": voice,
            "language": tts_lang,
            "output_type": "audio",
            "audio_speed": str(speed if speed else 1),
        }

        headers = {
            "accept": "application/json",
            "Content-Type": "application/x-www-form-urlencoded",
        }

        urls_to_try = [self.api_url]
        if self.fallback_url and self.fallback_url != self.api_url:
            urls_to_try.append(self.fallback_url)

        last_error = None
        for endpoint in urls_to_try:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(endpoint, data=payload, headers=headers)
                    response.raise_for_status()

                    content_type = response.headers.get("content-type", "audio/wav")
                    if "audio" in content_type or "octet-stream" in content_type:
                        audio_bytes = response.content
                        audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                        return {
                            "text": text,
                            "voice_id": voice,
                            "language": tts_lang,
                            "status": "success",
                            "audio_base64": audio_b64,
                            "content_type": content_type,
                            "audio_size_bytes": len(audio_bytes),
                            "endpoint": endpoint,
                        }
                    else:
                        res_json = response.json()
                        audio_b64 = res_json.get("audio_base64") or res_json.get("audio") or res_json.get("data")
                        return {
                            "text": text,
                            "voice_id": voice,
                            "language": tts_lang,
                            "status": "success",
                            "audio_base64": audio_b64,
                            "audio_url": res_json.get("url"),
                            "content_type": content_type,
                            "endpoint": endpoint,
                            "details": res_json,
                        }
            except Exception as e:
                last_error = e
                logger.warning(f"WiseAI TTS request to {endpoint} failed: {e}")

        logger.error(f"All WiseAI TTS endpoints failed. Last error: {last_error}")
        return {
            "text": text,
            "voice_id": voice,
            "language": tts_lang,
            "status": "fallback",
            "error": str(last_error),
            "audio_base64": None,
            "endpoint": self.api_url,
        }

tts_service = TTSService()
