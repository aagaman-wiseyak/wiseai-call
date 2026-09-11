import logging
import httpx
from typing import Dict, Any, Optional
from config import settings

logger = logging.getLogger("asr_service")

def normalize_asr_language(lang: Optional[str]) -> str:
    """
    Normalizes language to 'nep' or 'eng' per WiseAI ASR specification.
    """
    if not lang:
        return "eng"
    clean = lang.lower().strip()
    if clean in ["nep", "nepali", "ne"]:
        return "nep"
    if clean in ["eng", "english", "en"]:
        return "eng"
    return "eng"

class ASRService:
    """
    Automatic Speech Recognition (ASR) service integrated with WiseAI endpoint:
    POST /transcribe-from-stream
    Supports English ('eng') and Nepali ('nep').
    """
    def __init__(self):
        self.api_url = settings.ASR_API_URL
        self.fallback_url = getattr(settings, "ASR_FALLBACK_URL", None)
        self.timeout = settings.ASR_TIMEOUT
        self.default_language = getattr(settings, "ASR_LANGUAGE", "eng")

    async def transcribe_audio(
        self,
        audio_bytes: bytes,
        language: Optional[str] = None,
        filename: str = "audio.wav",
    ) -> Dict[str, Any]:
        """
        Transcribes audio bytes via WiseAI ASR (/transcribe-from-stream).
        Payload matches curl multipart/form-data specification:
        - bucket_name, filename, user_id, organization, scope, service, audio, language ('nep' or 'eng'), output_type, context_words
        """
        target_lang = normalize_asr_language(language or self.default_language)
        logger.info(f"Transcribing audio via WiseAI ASR ({self.api_url}): {len(audio_bytes)} bytes, lang={target_lang}")

        # Detect audio mime-type from filename extension
        fname = filename or "audio.wav"
        fname_lower = fname.lower()
        if fname_lower.endswith(".mp4"):
            content_type = "video/mp4"
        elif fname_lower.endswith(".webm"):
            content_type = "audio/webm"
        elif fname_lower.endswith(".mp3"):
            content_type = "audio/mpeg"
        elif fname_lower.endswith(".ogg"):
            content_type = "audio/ogg"
        else:
            content_type = "audio/wav"

        # Multipart files and form fields matching curl reference
        files = {
            "audio": (fname, audio_bytes, content_type)
        }
        data = {
            "bucket_name": "string",
            "filename": fname,
            "user_id": "string",
            "organization": "string",
            "scope": "string",
            "service": "string",
            "language": target_lang,
            "output_type": "text",
            "context_words": "string",
        }
        headers = {
            "accept": "application/json"
        }

        urls_to_try = [self.api_url]
        if self.fallback_url and self.fallback_url != self.api_url:
            urls_to_try.append(self.fallback_url)

        last_error = None
        for endpoint in urls_to_try:
            try:
                async with httpx.AsyncClient(timeout=self.timeout) as client:
                    response = await client.post(endpoint, data=data, files=files, headers=headers)
                    response.raise_for_status()

                    # Handle both JSON and raw text response formats safely
                    try:
                        res_data = response.json()
                    except Exception:
                        res_data = response.text

                    # Extract transcription text
                    transcribed_text = ""
                    if isinstance(res_data, dict):
                        transcribed_text = (
                            res_data.get("text")
                            or res_data.get("transcription")
                            or res_data.get("transcript")
                            or res_data.get("data")
                            or res_data.get("output")
                            or res_data.get("result")
                            or ""
                        )
                        if isinstance(transcribed_text, dict):
                            transcribed_text = (
                                transcribed_text.get("text")
                                or transcribed_text.get("transcription")
                                or transcribed_text.get("transcript")
                                or ""
                            )
                        transcribed_text = str(transcribed_text).strip()
                    elif isinstance(res_data, str):
                        transcribed_text = res_data.strip()

                    logger.info(f"WiseAI ASR transcription successful ({endpoint}): '{transcribed_text}'")
                    return {
                        "text": transcribed_text,
                        "language": target_lang,
                        "status": "success",
                        "endpoint": endpoint,
                        "details": res_data if isinstance(res_data, dict) else {"raw": res_data},
                    }
            except Exception as e:
                last_error = e
                logger.warning(f"WiseAI ASR request to {endpoint} failed: {e}")

        logger.error(f"All WiseAI ASR endpoints failed. Last error: {last_error}")
        return {
            "text": "",
            "language": target_lang,
            "status": "error",
            "error": str(last_error),
            "endpoint": self.api_url,
        }

asr_service = ASRService()

