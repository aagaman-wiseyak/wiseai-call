"""Browser-safe proxy for campaign-drafting LLM requests."""

from typing import Dict, List

from fastapi import APIRouter
from pydantic import BaseModel, Field

from services.llm_service import llm_service

router = APIRouter(prefix="/api/llm", tags=["LLM Proxy"])


class LlmProxyRequest(BaseModel):
    messages: List[Dict[str, str]] = Field(min_length=1)


@router.post("")
async def complete(request: LlmProxyRequest):
    """Return the OpenAI-compatible subset consumed by the React client."""
    content = await llm_service.chat_completion(request.messages)
    return {"choices": [{"message": {"content": content}}]}
