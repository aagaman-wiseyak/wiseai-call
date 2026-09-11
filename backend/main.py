from contextlib import asynccontextmanager
import asyncio
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from config import settings
from services.tts_service import tts_service
from routers.call_router import router as call_router
from routers.template_router import router as template_router
from routers.campaign_router import router as campaign_router
from routers.llm_router import router as llm_router

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Pre-warm OmniVoice WebSocket connection in background
    asyncio.create_task(tts_service.warm_connection())
    yield

app = FastAPI(
    title=settings.APP_NAME,
    description="FastAPI backend owning LLM intent router, ISP campaign knowledge lookup, and voice services for outbound decision trees.",
    version="1.0.0",
    lifespan=lifespan,
)

# Setup CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
app.include_router(call_router)
app.include_router(template_router)
app.include_router(campaign_router)
app.include_router(llm_router)

@app.get("/api/health")
async def health():
    return {
        "status": "online",
        "service": settings.APP_NAME,
        "llm_endpoint": settings.LLM_API_URL,
        "thinking_enabled": settings.ENABLE_THINKING,
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host=settings.HOST, port=settings.PORT, reload=True)
