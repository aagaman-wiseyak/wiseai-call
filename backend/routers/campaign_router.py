from typing import Dict, Any

from fastapi import APIRouter, Header, HTTPException

from schemas import CampaignSavePayload
from services.campaign_store import campaign_store

router = APIRouter(prefix="/api/campaigns", tags=["Campaigns"])


def require_tenant_id(x_tenant_id: str = Header(..., alias="X-Tenant-ID")) -> str:
    tenant_id = x_tenant_id.strip()
    if not tenant_id:
        raise HTTPException(status_code=400, detail="X-Tenant-ID must not be empty")
    return tenant_id


@router.put("/{campaign_id}")
async def save_campaign(campaign_id: str, payload: CampaignSavePayload, x_tenant_id: str = Header(..., alias="X-Tenant-ID")):
    tenant_id = require_tenant_id(x_tenant_id)
    knowledge = payload.campaign_knowledge.model_dump(mode="json")
    if knowledge.get("campaignId") and knowledge["campaignId"] != campaign_id:
        raise HTTPException(status_code=409, detail="Campaign ID in the handbook does not match the URL.")
    knowledge["campaignId"] = campaign_id
    saved = campaign_store.save_campaign(tenant_id, campaign_id, {
        "campaign_knowledge": knowledge,
        "nodes": payload.nodes,
        "edges": payload.edges,
    })
    return {"campaign_id": campaign_id, **saved}


@router.get("/{campaign_id}")
async def get_campaign(campaign_id: str, x_tenant_id: str = Header(..., alias="X-Tenant-ID")) -> Dict[str, Any]:
    campaign = campaign_store.get_campaign(require_tenant_id(x_tenant_id), campaign_id)
    if not campaign:
        raise HTTPException(status_code=404, detail="Campaign not found for this tenant.")
    return campaign
