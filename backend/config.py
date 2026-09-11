import os
from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):
    APP_NAME: str = "Outbound Voice Decision Tree API"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    
    # WiseAI Base
    WISEAI_BASE_URL: str = "https://dev-models.wiseai.wiseyak.com"

    # WiseAI LLM Endpoint
    LLM_API_URL: str = "https://dev-models.wiseai.wiseyak.com/v1/chat/completions"
    LLM_TIMEOUT: float = 60.0
    ENABLE_THINKING: bool = False
    
    # WiseAI ASR Endpoint (/transcribe-from-stream)
    ASR_API_URL: str = "https://dev-asr.wiseai.wiseyak.com/transcribe-from-stream"
    ASR_FALLBACK_URL: str = "https://dev-models.wiseai.wiseyak.com/asr/transcribe-from-stream"
    ASR_TIMEOUT: float = 30.0
    ASR_LANGUAGE: str = "eng"

    # WiseAI TTS Endpoint (/generate_from_text)
    TTS_API_URL: str = "https://dev-tts.wiseai.wiseyak.com/generate_from_text"
    TTS_FALLBACK_URL: str = "https://dev-models.wiseai.wiseyak.com/tts/generate_from_text"
    TTS_TIMEOUT: float = 45.0
    TTS_DEFAULT_VOICE: str = "Prakash_0"
    TTS_MODEL: str = "omnivoice_tts"
    
    # Durable campaign and call-session store. Configure this to a managed
    # database-backed repository in deployment; SQLite is the local default.
    CAMPAIGN_STORE_PATH: str = os.path.join(os.path.dirname(__file__), "data", "campaigns.sqlite3")
    # PostgreSQL is used when supplied (the Docker compose service provides a
    # local URL). SQLite remains an explicit offline-development fallback.
    DATABASE_URL: str | None = None
    CAMPAIGN_STORE_BACKEND: str = "auto"  # auto | postgres | sqlite
    
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

    model_config = SettingsConfigDict(
        env_file=os.path.join(os.path.dirname(__file__), ".env"),
        env_file_encoding="utf-8",
        extra="ignore",
    )

settings = Settings()
