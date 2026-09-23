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
            "You are an expert Outbound Campaign Knowledge and Factual Intelligence Engine. "
            "Your role is to inspect what the customer just said, detect if they are asking an informational "
            "or campaign-specific question, and provide an accurate, fact-grounded, spoken answer.\n\n"
            f"{lang_instruction}\n\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "DETECTION CRITERIA:\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "1. Informational questions include:\n"
            "   - Package details, speed tiers, hardware/router specs, pricing, contract terms, discounts.\n"
            "   - Appointment durations, locations, coverage, insurance, prerequisites.\n"
            "   - 'What is this regarding?', 'Who are you?', 'Is there a contract?', 'How much does it cost?'.\n"
            "2. Non-questions (set is_campaign_question = false):\n"
            "   - Direct answers to the agent's prompt (e.g. 'Yes', 'No', 'Tuesday works', 'I'm not interested').\n"
            "   - General pleasantries (e.g. 'Hello', 'Good morning').\n\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "ANSWER SYNTHESIS & VOICE CONSTRAINTS (ZERO HALLUCINATION):\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "1. GROUND TRUTH ONLY: Answer strictly using facts present in the CAMPAIGN KNOWLEDGE CONTEXT.\n"
            "2. MISSING FACTS: If the requested information is not in the knowledge context, politely state: "
            "'I want to make sure I give you the exact details, so I will have our coordinator text or confirm that for you.' Do not guess.\n"
            "3. SPOKEN BREVITY: Spoken answers must be strictly 1 to 2 sentences (under 30 words), conversational, and end with a smooth prompt redirecting back to the agent's question.\n\n"
            f"CAMPAIGN KNOWLEDGE CONTEXT:\n{json.dumps(knowledge_context, indent=2, ensure_ascii=False)}\n\n"
            f"CURRENT STEP PROMPT AGENT SPOKE:\n\"{current_step_prompt}\"\n\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "OUTPUT SPECIFICATION (STRICT JSON ONLY):\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "{\n"
            "  \"is_campaign_question\": true/false,\n"
            "  \"topic\": \"Specific inquiry topic (e.g. 'pricing_contract', 'hardware_specs', 'rescheduling') or 'none'\",\n"
            "  \"answer\": \"Short, spoken voice answer strictly under 30 words grounded in facts, or empty string if not a question\",\n"
            "  \"confidence\": 0.0 to 1.0,\n"
            "  \"reasoning\": \"Brief explanation of whether an inquiry was detected and how knowledge was matched\"\n"
            "}"
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
