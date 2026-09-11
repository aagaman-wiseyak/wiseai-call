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
        language: str = "eng",
    ) -> Tuple[bool, Optional[str], Optional[str]]:
        """
        Determines if user utterance is asking an informational/campaign question (speeds, packages, discounts, hardware, etc.).
        If yes, generates an accurate answer grounded in the campaign knowledge,
        and returns (is_question=True, answer_text, topic_summary).
        Supports Nepali ('nep') and English ('eng').
        """
        knowledge_context = campaign_knowledge or DEFAULT_ISP_KNOWLEDGE
        is_nepali = language.lower().strip() in ["nep", "nepali", "ne"]
        lang_instruction = (
            "LANGUAGE REQUIREMENT: Respond strictly in natural, conversational Nepali (नेपाली भाषामा). Keep it under 40 words."
            if is_nepali
            else "LANGUAGE REQUIREMENT: Respond in natural English under 40 words."
        )

        system_prompt = (
            "You are an AI assistant for an Outbound Call Campaign Knowledge Engine.\n"
            "Analyze the customer's response to see if they are asking an informational question, "
            "inquiring about campaign details, packages, pricing, qualifications, services, or raising a specific domain objection.\n\n"
            f"{lang_instruction}\n\n"
            f"CAMPAIGN KNOWLEDGE CONTEXT:\n{json.dumps(knowledge_context, indent=2, ensure_ascii=False)}\n\n"
            "CURRENT STEP PROMPT AGENT SPOKE:\n"
            f"\"{current_step_prompt}\"\n\n"
            "OUTPUT FORMAT (STRICT JSON ONLY):\n"
            "{\n"
            "  \"is_campaign_question\": true/false,\n"
            "  \"topic\": \"<string inquiry topic or 'none'>\",\n"
            "  \"answer\": \"Concise, friendly answer spoken as the agent (under 40 words) strictly using the provided campaign facts, ending with a natural prompt back to the pending decision.\",\n"
            "  \"confidence\": 0.0 to 1.0\n"
            "}\n"
            "If the customer is just answering the question directly (e.g. 'Yes', 'No', or providing their answer) without asking for information, set is_campaign_question to false."
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
            lower = user_text.lower()
            
            # Dynamic fallback: search campaign FAQs
            if campaign_knowledge and "faqs" in campaign_knowledge:
                for faq in campaign_knowledge.get("faqs", []):
                    keywords = [k.lower() for k in faq.get("keywords", [])]
                    q_words = [w.lower() for w in faq.get("question", "").split() if len(w) > 3]
                    if any(k in lower for k in keywords) or any(w in lower for w in q_words):
                        return True, faq.get("answer"), faq.get("id", "faq_match")
            
            # Dynamic fallback: search campaign global objections
            if campaign_knowledge and "globalObjections" in campaign_knowledge:
                for obj in campaign_knowledge.get("globalObjections", []):
                    trigger = obj.get("trigger", "").lower().replace("?", "").replace("!", "")
                    if trigger and trigger in lower:
                        return True, obj.get("response"), "global_objection"

            return False, None, None

knowledge_service = CampaignKnowledgeService()
