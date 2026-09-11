import logging
import httpx
import base64
from typing import Dict, Any, Optional
from config import settings

logger = logging.getLogger("tts_service")

class TTSService:
    """
    Text-To-Speech (TTS) service integrated with WiseAI endpoint:
    POST /tts/generate_from_text
    """
    def __init__(self):
        self.api_url = settings.TTS_API_URL
        self.timeout = settings.TTS_TIMEOUT
        self.default_voice = settings.TTS_DEFAULT_VOICE

    async def synthesize_speech(
        self,
        text: str,
        voice_id: Optional[str] = None,
        language: str = "en",
        speed: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Synthesizes audio via WiseAI TTS (/tts/generate_from_text).
        Returns base64 encoded audio ready for browser audio playback.
        """
        voice = voice_id or self.default_voice
        logger.info(f"Synthesizing speech via WiseAI TTS ({self.api_url}): voice={voice}, text='{text[:40]}...'")

        data = {
            "text": text,
            "language": language,
            "output_type": "audio",
            "reference_audio_id": voice,
            "audio_speed": speed,
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(self.api_url, data=data)
                response.raise_for_status()
                
                content_type = response.headers.get("content-type", "audio/wav")
                if "audio" in content_type or "octet-stream" in content_type:
                    audio_bytes = response.content
                    audio_b64 = base64.b64encode(audio_bytes).decode("utf-8")
                    return {
                        "text": text,
                        "voice_id": voice,
                        "status": "success",
                        "audio_base64": audio_b64,
                        "content_type": content_type,
                        "audio_size_bytes": len(audio_bytes),
                        "endpoint": self.api_url,
                    }
                else:
                    # JSON response (e.g. url or info)
                    res_json = response.json()
                    return {
                        "text": text,
                        "voice_id": voice,
                        "status": "success",
                        "audio_base64": None,
                        "content_type": content_type,
                        "endpoint": self.api_url,
                        "details": res_json,
                    }
        except Exception as e:
            logger.error(f"WiseAI TTS request failed: {e}")
            return {
                "text": text,
                "voice_id": voice,
                "status": "fallback",
                "error": str(e),
                "audio_base64": None,
                "endpoint": self.api_url,
            }

tts_service = TTSService()
