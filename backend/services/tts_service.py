import logging
import httpx
import base64
import re
from typing import Dict, Any, Optional
from config import settings

logger = logging.getLogger("tts_service")

def normalize_tts_language(lang: Optional[str], text: Optional[str] = None) -> str:
    """
    Normalizes language to 'nep' or 'eng' per WiseAI TTS specification.
    Also auto-detects Devanagari script if text is provided.
    """
    if lang:
        clean = lang.lower().strip()
        if clean in ["nep", "nepali", "ne"]:
            return "nep"
        if clean in ["eng", "english", "en"]:
            return "eng"

    # Auto-detect Devanagari characters if text is in Nepali
    if text and re.search(r"[\u0900-\u097F]", text):
        return "nep"

    return "eng"

class TTSService:
    """
    Text-To-Speech (TTS) service integrated with WiseAI endpoint:
    POST /generate_from_text (omnivoice_tts)
    Supports English ('eng') and Nepali ('nep').
    """
    def __init__(self):
        self.api_url = settings.TTS_API_URL
        self.fallback_url = getattr(settings, "TTS_FALLBACK_URL", None)
        self.timeout = settings.TTS_TIMEOUT
        self.default_voice = settings.TTS_DEFAULT_VOICE
        self.model = getattr(settings, "TTS_MODEL", "omnivoice_tts")

    async def synthesize_speech(
        self,
        text: str,
        voice_id: Optional[str] = None,
        language: str = "eng",
        speed: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Synthesizes audio via WiseAI TTS (/generate_from_text).
        Payload matches curl x-www-form-urlencoded specification:
        - bucket_name, target_sample_rate, filename, model, text, user_id, organization,
          service, reference_audio_id, language ('eng' or 'nep'), output_type, audio_speed
        """
        voice = voice_id or self.default_voice
        tts_lang = normalize_tts_language(language, text)
        logger.info(f"Synthesizing speech via WiseAI TTS ({self.api_url}): voice={voice}, lang={tts_lang}, text='{text[:45]}...'")

        # Form urlencoded payload matching curl reference
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

        # Try primary URL, then fallback URL if DNS or network error occurs
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
                        # JSON response
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

