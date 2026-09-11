import logging
from typing import Dict, Any, Optional

logger = logging.getLogger("tts_service")

class TTSService:
    """
    Modular Text-To-Speech (TTS) service interface.
    Owns speech synthesis (supporting future Piper / Kokoro / ElevenLabs backend audio generation).
    """
    def __init__(self):
        self.default_voice = "natural-female"

    async def synthesize_speech(
        self,
        text: str,
        voice_id: Optional[str] = None,
        speed: float = 1.0,
    ) -> Dict[str, Any]:
        """
        Synthesizes audio buffer from text.
        """
        logger.info(f"Synthesizing speech for: '{text[:40]}...' at speed {speed}")
        return {
            "text": text,
            "voice_id": voice_id or self.default_voice,
            "audio_url": None, # client plays synthesized text or stream
            "format": "pcm_16000",
        }

tts_service = TTSService()
