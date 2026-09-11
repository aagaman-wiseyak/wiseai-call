import logging
import httpx
from typing import Dict, Any, Optional
from config import settings

logger = logging.getLogger("asr_service")

class ASRService:
    """
    Automatic Speech Recognition (ASR) service integrated with WiseAI endpoint:
    POST /asr/transcribe-from-stream
    """
    def __init__(self):
        self.api_url = settings.ASR_API_URL
        self.timeout = settings.ASR_TIMEOUT
        self.default_language = settings.ASR_LANGUAGE

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        language: Optional[str] = None,
        filename: str = "audio.wav",
    ) -> Dict[str, Any]:
        """
        Transcribes audio bytes via WiseAI ASR (/asr/transcribe-from-stream).
        """
        lang = language or self.default_language
        logger.info(f"Transcribing audio via WiseAI ASR ({self.api_url}): {len(audio_bytes)} bytes, lang={lang}")

        files = {
            "audio": (filename, audio_bytes, "audio/wav")
        }
        data = {
            "language": lang,
            "output_type": "text"
        }

        try:
            async with httpx.AsyncClient(timeout=self.timeout) as client:
                response = await client.post(self.api_url, data=data, files=files)
                response.raise_for_status()
                res_data = response.json()
                
                # res_data format: {"text": "...", "language": "en", "processing_applied": [...]}
                return {
                    "text": res_data.get("text", "").strip(),
                    "language": res_data.get("language", lang),
                    "status": "success",
                    "endpoint": self.api_url,
                    "details": res_data,
                }
        except Exception as e:
            logger.error(f"WiseAI ASR request failed: {e}")
            return {
                "text": "",
                "language": lang,
                "status": "error",
                "error": str(e),
                "endpoint": self.api_url,
            }

asr_service = ASRService()
