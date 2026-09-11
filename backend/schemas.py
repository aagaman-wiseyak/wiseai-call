"""API contracts shared by campaign setup and live call orchestration."""

from datetime import date
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field, model_validator


class KnowledgeContentType(str, Enum):
    product_offer = "product_offer"
    policy = "policy"
    process = "process"
    service = "service"
    troubleshooting = "troubleshooting"
    compliance = "compliance"
    company_information = "company_information"
    escalation = "escalation"
    reference = "reference"
    other = "other"


class KnowledgeStatus(str, Enum):
    draft = "draft"
    approved = "approved"
    archived = "archived"


class KnowledgeItemPayload(BaseModel):
    """A versioned, campaign-owned item the agent can cite in a call."""

    id: str = Field(min_length=1, max_length=160)
    title: str = Field(min_length=1, max_length=240)
    contentType: KnowledgeContentType
    tags: List[str] = Field(default_factory=list, max_length=30)
    content: str = Field(max_length=12000)
    source: str = Field(max_length=500)
    version: str = Field(min_length=1, max_length=80)
    effectiveFrom: Optional[date] = None
    effectiveUntil: Optional[date] = None
    status: KnowledgeStatus

    @model_validator(mode="before")
    @classmethod
    def migrate_legacy_category(cls, value):
        if isinstance(value, dict) and "contentType" not in value and "category" in value:
            legacy = value["category"]
            mapping = {
                "plan": "product_offer", "pricing": "product_offer", "promotion": "product_offer",
                "fee": "policy", "equipment": "product_offer",
            }
            return {**value, "contentType": mapping.get(legacy, legacy), "tags": value.get("tags", [])}
        return value

    @model_validator(mode="after")
    def approved_item_has_a_traceable_fact(self):
        if self.status == KnowledgeStatus.approved:
            if not self.content.strip() or not self.source.strip():
                raise ValueError("Approved knowledge requires both content and a source.")
        if self.effectiveFrom and self.effectiveUntil and self.effectiveUntil < self.effectiveFrom:
            raise ValueError("effectiveUntil must not be earlier than effectiveFrom.")
        return self


class CampaignKnowledgePayload(BaseModel):
    """Transport representation; persistence belongs to the campaign service."""

    model_config = ConfigDict(extra="allow")  # supports legacy campaign fields during migration

    campaignId: Optional[str] = None
    campaignName: Optional[str] = None
    knowledgeItems: List[KnowledgeItemPayload] = Field(default_factory=list)
    # These support a safe migration from the existing editor. The live engine
    # only uses them if no handbook items have been provided.
    faqs: List[Dict[str, Any]] = Field(default_factory=list)
    globalObjections: List[Dict[str, Any]] = Field(default_factory=list)


class CampaignSavePayload(BaseModel):
    campaign_knowledge: CampaignKnowledgePayload
    nodes: List[Dict[str, Any]] = Field(default_factory=list)
    edges: List[Dict[str, Any]] = Field(default_factory=list)
