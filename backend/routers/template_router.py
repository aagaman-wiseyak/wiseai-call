import logging
from fastapi import APIRouter
from pydantic import BaseModel
from services.llm_service import llm_service

logger = logging.getLogger("template_router")
router = APIRouter(prefix="/api/templates", tags=["Template Generation"])

class GenerateTemplateRequest(BaseModel):
    prompt: str

@router.post("/generate")
async def generate_template(req: GenerateTemplateRequest):
    """
    Generates an outbound call decision graph from user prompt using WiseAI backend.
    """
    system_prompt = (
        "You are an expert Outbound AI Voice Architect. Generate an outbound call decision tree "
        "as valid JSON with initialNodes, initialEdges, and campaignKnowledge (agentPersona, leadProfile, faqs, globalObjections)."
    )
    user_prompt = f"Create an outbound decision flow for: '{req.prompt}'"
    
    try:
        data = await llm_service.structured_completion(system_prompt, user_prompt)
        return data
    except Exception as e:
        logger.error(f"Template generation error: {e}")
        return {"error": str(e), "status": "failed"}
