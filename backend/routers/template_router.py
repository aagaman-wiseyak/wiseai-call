import logging
from typing import Any, Dict, Optional
from fastapi import APIRouter
from pydantic import BaseModel
from services.llm_service import llm_service
from services.graph_generator_service import graph_generator_service

logger = logging.getLogger("template_router")
router = APIRouter(prefix="/api/templates", tags=["Template Generation"])

class GenerateTemplateRequest(BaseModel):
    prompt: str

class GenerateFlowRequest(BaseModel):
    prompt: str
    campaign_context: Optional[Dict[str, Any]] = None

@router.post("/generate-flow")
async def generate_flow(req: GenerateFlowRequest):
    """
    Synthesizes a complete outbound decision tree entirely on the backend,
    grounded in campaign context and voice call conversational standards.
    """
    try:
        data = await graph_generator_service.generate_campaign_flow(
            prompt=req.prompt,
            campaign_context=req.campaign_context,
        )
        return data
    except Exception as e:
        logger.error(f"Flow generation error: {e}")
        return {"error": str(e), "status": "failed"}

@router.post("/generate")
async def generate_template(req: GenerateTemplateRequest):
    """
    Generates an outbound call decision graph from user prompt using WiseAI backend.
    """
    system_prompt = (
        "You are an expert Outbound AI Voice Architect and Conversational Flow Engineer. "
        "Your task is to generate a comprehensive, production-ready outbound call decision graph "
        "and campaign knowledge structure based on the provided campaign requirements.\n\n"
        "═══════════════════════════════════════════════════════════════════════════\n"
        "CONVERSATIONAL VOICE CALL PRINCIPLES:\n"
        "═══════════════════════════════════════════════════════════════════════════\n"
        "1. Real phone dialogue must be snappy, concise, and conversational (1 to 2 sentences, under 18 words per speech step).\n"
        "2. No lengthy corporate monologues or multi-part questions.\n"
        "3. Every prompt must sound like a natural human speaking over the phone, using contractions (e.g. 'I'm', 'we'll', 'you're').\n"
        "4. Qualify before pitching: ask a focused discovery question to extract prospect status.\n"
        "5. Objection handling must be empathetic and brief, returning smoothly to the pending decision.\n\n"
        "═══════════════════════════════════════════════════════════════════════════\n"
        "REQUIRED GRAPH STRUCTURE:\n"
        "═══════════════════════════════════════════════════════════════════════════\n"
        "The generated JSON must contain:\n"
        "- 'name': Campaign title\n"
        "- 'tagline': Brief campaign description\n"
        "- 'category': Industry category\n"
        "- 'knowledge': Full CampaignKnowledge object including agentPersona (name, role, company, tone), "
        "leadProfile (name, company, phone, email), faqs list, and globalObjections list\n"
        "- 'initialNodes': Array of CustomFlowNode objects (greeting, question, scenarioBranch, knowledge rebuttal, action, and hangups)\n"
        "- 'initialEdges': Array of CustomFlowEdge objects connecting source handles to target nodes\n\n"
        "Ensure all node IDs and edge source/target IDs are strictly valid, consistent, and fully connected."
    )
    user_prompt = (
        f"Generate a complete outbound voice decision graph for the following campaign:\n"
        f"\"{req.prompt}\"\n\n"
        "Output strictly valid JSON matching the system specification."
    )
    
    try:
        data = await llm_service.structured_completion(system_prompt, user_prompt)
        return data
    except Exception as e:
        logger.error(f"Template generation error: {e}")
        return {"error": str(e), "status": "failed"}
