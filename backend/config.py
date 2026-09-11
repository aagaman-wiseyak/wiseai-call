import os
from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    APP_NAME: str = "Outbound Voice Decision Tree API"
    HOST: str = "127.0.0.1"
    PORT: int = 8000
    
    # WiseAI LLM Endpoint
    LLM_API_URL: str = os.getenv(
        "LLM_API_URL",
        "https://dev-models.wiseai.wiseyak.com/v1/chat/completions"
    )
    LLM_TIMEOUT: float = 60.0
    ENABLE_THINKING: bool = False
    
    # CORS
    CORS_ORIGINS: list[str] = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:3000",
    ]

settings = Settings()
