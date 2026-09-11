import json
import logging
from typing import Dict, Any, Optional, Tuple
from services.llm_service import llm_service

logger = logging.getLogger("knowledge_service")

# Default rich ISP renewal knowledge base
DEFAULT_ISP_KNOWLEDGE = {
    "campaign_name": "Fiber Internet Renewal & Speed Boost Campaign",
    "packages": [
        {
            "name": "Fiber Basic 100",
            "speed_mbps": 100,
            "monthly_price": "$29.99/mo",
            "regular_price": "$39.99/mo",
            "best_for": "1-2 users, email, browsing, and standard HD streaming",
            "included_equipment": "Dual-Band Wi-Fi 5 Gateway",
            "renewal_discount": "10% off for 6-month commitment",
        },
        {
            "name": "Fiber Ultra 300 (Most Popular)",
            "speed_mbps": 300,
            "monthly_price": "$49.99/mo",
            "regular_price": "$64.99/mo",
            "best_for": "3-5 users, simultaneous 4K streaming, remote Zoom work, and gaming",
            "included_equipment": "Next-Gen Wi-Fi 6 Smart Router (Zero rental fee)",
            "renewal_discount": "20% off annual renewal + 3 months free streaming OTT bundle",
        },
        {
            "name": "Fiber Gigabit Pro 1000",
            "speed_mbps": 1000,
            "monthly_price": "$79.99/mo",
            "regular_price": "$99.99/mo",
            "best_for": "Power users, smart homes, multiple gamers, large file uploads",
            "included_equipment": "Tri-Band Wi-Fi 6E Mesh system with 2 pods included",
            "renewal_discount": "25% off annual renewal + free professional mesh installation + 1 year free cloud security",
        },
    ],
    "equipment_rules": [
        "All renewals on 300 Mbps or 1000 Mbps receive a complimentary Wi-Fi 6 router upgrade shipped free within 48 hours.",
        "Existing modems are fully compatible, self-installation kit arrives with plug-and-play instructions.",
    ],
    "discount_rules": [
        "Annual Contract: 20% discount on 300 Mbps and 25% discount on 1 Gbps.",
        "Auto-Pay: Additional $5/month billing discount on any plan.",
        "Free streaming OTT package for 3 months on 300 Mbps or 1 Gbps plans.",
    ],
    "support_faqs": [
        {"q": "Is there a contract?", "a": "We offer both month-to-month and discounted 12-month renewal agreements with locked-in rate guarantees."},
        {"q": "How fast is installation?", "a": "Speed upgrades happen automatically over the network within 15 minutes of renewal. Router hardware arrives in 2 business days."},
    ]
}

class CampaignKnowledgeService:
    def __init__(self):
        pass

    async def check_and_answer_question(
        self,
        user_text: str,
        current_step_prompt: str,
        campaign_knowledge: Optional[Dict[str, Any]] = None,
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Determines if user utterance is asking an informational/campaign question (speeds, packages, discounts, hardware, etc.).
        If yes, generates an accurate answer grounded in the campaign knowledge,
        and returns (is_question=True, answer_text, topic_summary).
        """
        # Merge campaign knowledge with ISP defaults if relevant
        knowledge_context = campaign_knowledge or DEFAULT_ISP_KNOWLEDGE

        system_prompt = (
            "You are an AI assistant for an Outbound Call Campaign Knowledge Engine.\n"
            "Analyze the customer's response to see if they are asking an informational question, "
            "inquiring about campaign details (e.g. packages, speeds, Mbps, pricing, discounts, router/modem, contract terms), "
            "or raising a specific knowledge objection.\n\n"
            f"CAMPAIGN KNOWLEDGE CONTEXT:\n{json.dumps(knowledge_context, indent=2)}\n\n"
            "CURRENT STEP PROMPT AGENT SPOKE:\n"
            f"\"{current_step_prompt}\"\n\n"
            "OUTPUT FORMAT (STRICT JSON ONLY):\n"
            "{\n"
            "  \"is_campaign_question\": true/false,\n"
            "  \"topic\": \"packages_and_pricing\" | \"discounts\" | \"equipment_router\" | \"contract\" | \"general_inquiry\" | \"none\",\n"
            "  \"answer\": \"Concise, friendly answer spoken as the agent (under 40 words) strictly using the provided campaign facts, ending with a natural prompt back to the pending decision.\",\n"
            "  \"confidence\": 0.0 to 1.0\n"
            "}\n"
            "If the customer is just answering the question directly (e.g. 'Yes', 'No', 'I use 300 Mbps', 'I want the cheaper one') without asking for information, set is_campaign_question to false."
        )

        try:
            result = await llm_service.structured_completion(
                system_prompt=system_prompt,
                user_prompt=f"Customer said: \"{user_text}\""
            )

            is_question = bool(result.get("is_campaign_question", False))
            if is_question and result.get("answer"):
                return True, result.get("answer"), result.get("topic")
            return False, None, None
        except Exception as e:
            logger.warning(f"Knowledge check fallback on error: {e}")
            # Fallback simple keyword match
            lower = user_text.lower()
            if any(k in lower for k in ["what package", "what speed", "how much mbps", "what discount", "router", "plans do you have", "options"]):
                ans = (
                    "We have Fiber 100 Mbps at $29.99, Ultra 300 Mbps at $49.99 with a free Wi-Fi 6 router, "
                    "and 1 Gbps at $79.99 with up to 25% annual renewal discount! Which speed tier fits your household best?"
                )
                return True, ans, "packages_and_pricing"
            return False, None, None

knowledge_service = CampaignKnowledgeService()
