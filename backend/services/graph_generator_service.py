import json
import logging
import time
from typing import Any, Dict, List, Optional
from services.llm_service import llm_service

logger = logging.getLogger("graph_generator_service")

ALLOWED_CANVAS_NODE_TYPES = {
    "greeting",
    "question",
    "scenarioBranch",
    "knowledge",
    "action",
    "hangup",
}

SYSTEM_PROMPT = """You are an elite Voice Campaign Architect and Outbound Conversational AI Specialist.
Your mission is to synthesize a high-converting, deeply personalized, structured outbound call decision graph tailored precisely to the user's campaign goals, persona, and factual knowledge base.

═══════════════════════════════════════════════════════════════════════════
SECTION 1: VOICE CALL ARCHITECTURE & SPOKEN DIALOGUE STANDARDS (CRITICAL)
═══════════════════════════════════════════════════════════════════════════
Phone conversations differ fundamentally from text chat or email:
1. EXTREME BREVITY: Spoken attention spans are short. System/AI messages MUST be strictly 1 to 2 short sentences (typically 8 to 18 words total). Never exceed 20 words in any single speech turn.
2. NATURAL HUMAN CADENCE: Use conversational contractions (e.g. "I'm", "we've", "you're", "don't"). Avoid robotic jargon, corporate corporate-speak, or lengthy explanations.
3. SINGLE ACTION PER TURN: Ask exactly ONE clear, unambiguous question per speech turn. Never bundle multiple questions together.
4. MICRO-ACKNOWLEDGEMENTS: Rebuttals and transitions should begin with natural verbal handoffs (e.g. "Totally understand", "Got it", "Fair enough", "Makes complete sense").
5. IMMEDIATE VALUE HOOK: The greeting must immediately verify the recipient, introduce the caller, and request permission in under 15 words.

═══════════════════════════════════════════════════════════════════════════
SECTION 2: TRUTH & KNOWLEDGE GROUNDING (ZERO HALLUCINATION)
═══════════════════════════════════════════════════════════════════════════
1. Use the provided CAMPAIGN CONTEXT and APPROVED KNOWLEDGE as the absolute ground truth.
2. DO NOT invent fictitious pricing, discount percentages, contract terms, or guarantee claims not found in the approved knowledge.
3. If approved knowledge is minimal or absent, craft conversational flows that focus on qualifying interest and routing specific factual inquiries to a human coordinator, live transfer, or SMS resource link.

═══════════════════════════════════════════════════════════════════════════
SECTION 3: MANDATORY GRAPH STRUCTURE & ALLOWED CANVAS BLOCKS
═══════════════════════════════════════════════════════════════════════════
Your generated decision graph MUST map strictly and ONLY to the 6 allowed canvas node types:
1. GREETING ('greeting' / Opening Greeting): Short, personalized opening using {{lead_name}} and {{company}}. Confirms contact and states purpose in 1 sentence.
2. QUESTION ('question' / Spoken Question): Single, targeted qualifying question extracting a named variable.
3. SCENARIO INTENT ROUTER ('scenarioBranch' / Scenario Router): A multi-way branch classifying the customer's response into 4 distinct conversational paths:
   - Branch A [Positive / Interested]: Confirms interest or agrees to proceed.
   - Branch B [Specific Objection / Concern]: Common friction point tailored to this campaign (e.g. price, timing, trust, or current provider).
   - Branch C [Busy / Callback Needed]: Caller is driving, in a meeting, or asks to talk later.
   - Branch D [Not Interested / Opt-Out]: Definite rejection or request to be removed from the calling list.
4. CAMPAIGN REBUTTAL ('knowledge' / Campaign Rebuttal): Short 2-part spoken response (1 sentence acknowledgement + 1 sentence value reassurance) with return-to-flow logic.
5. AUTOMATED ACTION ('action' / Automated Action): The target conversion action (calendar booking, SMS dispatch, or live transfer) with realistic payload tags.
6. CALL EXIT ('hangup' / Call Exit): Dedicated exit steps with punchy 1-sentence closings:
   - Success Exit: Warm confirmation and polite goodbye.
   - Callback Exit: Confirmation of texted link / scheduled callback.
   - Opt-Out Exit: Respectful, frictionless acknowledgment of DNC request.

NEVER generate or invent any node types outside of these 6 allowed canvas types.

═══════════════════════════════════════════════════════════════════════════
SECTION 4: OUTPUT SPECIFICATION
═══════════════════════════════════════════════════════════════════════════
Return ONLY a valid JSON object wrapped in a single ```json markdown block matching this schema:
{
  "campaignName": "Clear, professional campaign title",
  "tagline": "Concise summary of campaign objective and target audience",
  "category": "Domain vertical (e.g. Telecom & ISP, Healthcare, Financial Services, Real Estate, SaaS)",
  "agentPersona": {
    "name": "Natural representative first name",
    "role": "Specific professional title (e.g. Senior Account Advisor, Patient Care Coordinator)",
    "company": "Company name",
    "tone": "friendly_professional | consultative | empathetic | authoritative"
  },
  "leadProfile": {
    "name": "Representative prospect full name",
    "company": "Lead account or organization name",
    "phone": "+1 (555) 000-0000"
  },
  "greetingScript": "Very short 1-sentence spoken line with {{lead_name}} and {{company}} (e.g. 'Hi {{lead_name}}, this is Sarah with {{company}}. Got a quick second?')",
  "questionScript": "Crisp, single conversational qualifying question under 18 words",
  "variableToExtract": "Identifier for the key variable to extract (e.g. renewal_decision, appointment_slot, budget_range, speed_issue)",
  "scenarioBranches": [
    {
      "label": "Human-readable label for positive branch",
      "intentKey": "positive",
      "color": "#10b981",
      "desc": "Clear evaluation criteria for positive acceptance"
    },
    {
      "label": "Human-readable label for campaign-specific objection",
      "intentKey": "cost_concern",
      "color": "#f59e0b",
      "desc": "Criteria identifying the primary objection or hesitation"
    },
    {
      "label": "Human-readable label for busy/callback branch",
      "intentKey": "busy_reschedule",
      "color": "#3b82f6",
      "desc": "Criteria for caller being occupied or needing later contact"
    },
    {
      "label": "Human-readable label for not interested branch",
      "intentKey": "not_interested",
      "color": "#ef4444",
      "desc": "Criteria for clear refusal or DNC request"
    }
  ],
  "objectionTopic": "Specific topic being addressed (e.g. Monthly Pricing, Hardware Delivery, Contract Flexibility)",
  "rebuttalScript": "Natural 1-2 sentence spoken rebuttal (acknowledgment + concise alternative/clarification)",
  "actionTitle": "Action step label (e.g. Confirm VIP Renewal & Dispatch Hardware, Schedule 1-on-1 Consultation)",
  "actionType": "calendar_booking | send_sms | live_transfer",
  "successClosing": "Punchy 1-sentence positive closing (e.g. 'All set, {{lead_name}}! Thanks and have a wonderful day.')",
  "callbackClosing": "Short 1-sentence callback closing (e.g. 'No problem at all, just texted you the direct link. Talk soon!')",
  "optOutClosing": "Polite 1-sentence opt-out closing (e.g. 'Understood. I will remove your number from our list right away. Goodbye.')"
}"""


class GraphGeneratorService:
    async def generate_campaign_flow(
        self,
        prompt: str,
        campaign_context: Optional[Dict[str, Any]] = None,
    ) -> Dict[str, Any]:
        """
        Executes LLM flow synthesis entirely on the backend, returning formatted nodes, edges,
        and knowledge for Decision Studio.
        """
        context = campaign_context or {}
        requirements_prompt = context.get("requirementsPrompt") or prompt

        user_prompt = (
            f"Create a tailored outbound AI decision tree for this campaign.\n\n"
            f"CAMPAIGN REQUIREMENTS & FLOW GOALS:\n\"{requirements_prompt}\"\n\n"
            f"CAMPAIGN CONTEXT:\n{json.dumps(context, indent=2)}"
        )

        logger.info(f"Generating decision flow for prompt: '{requirements_prompt[:60]}...'")
        parsed = await llm_service.structured_completion(SYSTEM_PROMPT, user_prompt)

        campaign_id = f"campaign-{int(time.time() * 1000)}"
        agent_persona_data = parsed.get("agentPersona", {})
        lead_profile_data = parsed.get("leadProfile", {})

        agent_name = agent_persona_data.get("name") or "Sarah"
        company = agent_persona_data.get("company") or context.get("agentPersona", {}).get("company") or "BrightCare Solutions"
        lead_name = lead_profile_data.get("name") or "Jordan Miller"

        knowledge = {
            "campaignId": campaign_id,
            "campaignName": parsed.get("campaignName") or context.get("campaignName") or f"{prompt[:32]} Campaign",
            "description": parsed.get("tagline") or context.get("description") or prompt,
            "requirementsPrompt": requirements_prompt,
            "agentPersona": {
                "name": agent_name,
                "role": agent_persona_data.get("role") or "Outreach Specialist",
                "company": company,
                "tone": agent_persona_data.get("tone") or context.get("agentPersona", {}).get("tone") or "friendly_professional",
                "speakingRate": 1.0,
                "voice": "en-US-Standard-C",
            },
            "leadProfile": {
                "name": lead_name,
                "company": lead_profile_data.get("company") or "Client Account",
                "phone": lead_profile_data.get("phone") or "+1 (555) 382-9011",
                "email": f"{lead_name.lower().replace(' ', '.')}@example.com",
                "attributes": {},
            },
            "complianceNotice": "This call is recorded for quality assurance.",
            "globalObjections": [
                {
                    "id": "obj-ai",
                    "trigger": "Are you an AI or robot?",
                    "response": f"I'm {agent_name}, an automated voice coordinator calling from {company}.",
                    "resumeFlow": True,
                },
                {
                    "id": "obj-busy",
                    "trigger": "I am busy right now",
                    "response": "Completely understand! I will send over a quick text with a direct link so you can respond at your convenience.",
                    "resumeFlow": False,
                },
            ],
            "faqs": [
                {
                    "id": "faq-gen-1",
                    "question": "What is this regarding?",
                    "answer": parsed.get("tagline") or f"Following up regarding {company} services.",
                    "keywords": ["what", "why", "regarding", "who"],
                }
            ],
            "knowledgeItems": context.get("knowledgeItems", []),
        }

        raw_branches = parsed.get("scenarioBranches") or [
            {"label": "Positive / Confirmed", "intentKey": "positive", "color": "#10b981", "desc": "Accepts proposal"},
            {"label": "Objection / Price", "intentKey": "cost_concern", "color": "#f59e0b", "desc": "Raises cost concern"},
            {"label": "Busy / Callback", "intentKey": "busy_reschedule", "color": "#3b82f6", "desc": "Needs call back later"},
            {"label": "Not Interested", "intentKey": "not_interested", "color": "#ef4444", "desc": "Politely rejects"},
        ]

        formatted_branches = [
            {
                "id": f"branch-llm-{idx}",
                "label": b.get("label", f"Scenario {idx + 1}"),
                "description": b.get("desc", ""),
                "intentKey": b.get("intentKey", "custom"),
                "color": b.get("color", "#18181b"),
                "targetHandle": f"handle-llm-{idx}",
            }
            for idx, b in enumerate(raw_branches)
        ]

        nodes = [
            {
                "id": "node-greeting",
                "type": "greeting",
                "position": {"x": 300, "y": 50},
                "data": {
                    "type": "greeting",
                    "label": f"{company} Greeting",
                    "openingScript": parsed.get("greetingScript") or f"Hi {{{{lead_name}}}}, this is {agent_name} with {company}. Got a quick minute?",
                    "voiceStyle": "Professional",
                },
            },
            {
                "id": "node-question",
                "type": "question",
                "position": {"x": 550, "y": 280},
                "data": {
                    "type": "question",
                    "label": f"Question: {parsed.get('variableToExtract') or 'Availability Check'}",
                    "speechPrompt": parsed.get("questionScript") or "Does that sound like something you would like to explore?",
                    "variableToExtract": parsed.get("variableToExtract") or "appointment_preference",
                    "allowBargeIn": True,
                    "maxWaitSeconds": 6,
                },
            },
            {
                "id": "node-router",
                "type": "scenarioBranch",
                "position": {"x": 550, "y": 500},
                "data": {
                    "type": "scenarioBranch",
                    "label": "Lead Intent Router",
                    "evaluationCriteria": "Classifies whether lead is interested, objects on cost, is busy, or opts out",
                    "branches": formatted_branches,
                },
            },
            {
                "id": "node-rebuttal",
                "type": "knowledge",
                "position": {"x": 150, "y": 750},
                "data": {
                    "type": "knowledge",
                    "label": f"Rebuttal: {parsed.get('objectionTopic') or 'Price & Coverage'}",
                    "objectionTopic": parsed.get("objectionTopic") or "Price / Cost Concern",
                    "rebuttalScript": parsed.get("rebuttalScript") or "Completely understand. We also offer flexible options that fit any budget.",
                    "returnToPrevious": True,
                },
            },
            {
                "id": "node-action-main",
                "type": "action",
                "position": {"x": 550, "y": 750},
                "data": {
                    "type": "action",
                    "label": parsed.get("actionTitle") or "Schedule & Lock Slot",
                    "actionType": parsed.get("actionType") or "calendar_booking",
                    "actionConfig": {
                        "title": parsed.get("actionTitle") or "Appointment Confirmation for {{lead_name}}",
                        "crmTag": "lead_qualified_action_taken",
                    },
                },
            },
            {
                "id": "node-action-callback",
                "type": "action",
                "position": {"x": 950, "y": 750},
                "data": {
                    "type": "action",
                    "label": "Send Scheduling Link (SMS)",
                    "actionType": "send_sms",
                    "actionConfig": {
                        "title": "Direct SMS link sent to {{phone}}",
                        "crmTag": "callback_requested_sms_sent",
                    },
                },
            },
            {
                "id": "node-hangup-success",
                "type": "hangup",
                "position": {"x": 550, "y": 980},
                "data": {
                    "type": "hangup",
                    "label": "Confirmed & Close",
                    "closingScript": parsed.get("successClosing") or "All set, {{lead_name}}! Thanks and have a great day.",
                    "disposition": "meeting_booked",
                    "sendSummarySms": True,
                },
            },
            {
                "id": "node-hangup-callback",
                "type": "hangup",
                "position": {"x": 950, "y": 980},
                "data": {
                    "type": "hangup",
                    "label": "Callback Scheduled",
                    "closingScript": parsed.get("callbackClosing") or "No problem, just texted you the link. Talk soon!",
                    "disposition": "callback_scheduled",
                    "sendSummarySms": True,
                },
            },
            {
                "id": "node-hangup-optout",
                "type": "hangup",
                "position": {"x": 1300, "y": 750},
                "data": {
                    "type": "hangup",
                    "label": "Opt-Out Exit",
                    "closingScript": parsed.get("optOutClosing") or "Understood. I will remove your number. Have a good day.",
                    "disposition": "disqualified_not_interested",
                    "sendSummarySms": False,
                },
            },
        ]

        b0_handle = formatted_branches[0]["targetHandle"] if len(formatted_branches) > 0 else "handle-llm-0"
        b0_label = formatted_branches[0]["label"] if len(formatted_branches) > 0 else "Interested"
        b0_color = formatted_branches[0].get("color", "#10b981") if len(formatted_branches) > 0 else "#10b981"

        b1_handle = formatted_branches[1]["targetHandle"] if len(formatted_branches) > 1 else "handle-llm-1"
        b1_label = formatted_branches[1]["label"] if len(formatted_branches) > 1 else "Objection"
        b1_color = formatted_branches[1].get("color", "#f59e0b") if len(formatted_branches) > 1 else "#f59e0b"

        b2_handle = formatted_branches[2]["targetHandle"] if len(formatted_branches) > 2 else "handle-llm-2"
        b2_label = formatted_branches[2]["label"] if len(formatted_branches) > 2 else "Busy"
        b2_color = formatted_branches[2].get("color", "#3b82f6") if len(formatted_branches) > 2 else "#3b82f6"

        b3_handle = formatted_branches[3]["targetHandle"] if len(formatted_branches) > 3 else "handle-llm-3"
        b3_label = formatted_branches[3]["label"] if len(formatted_branches) > 3 else "Not Interested"
        b3_color = formatted_branches[3].get("color", "#ef4444") if len(formatted_branches) > 3 else "#ef4444"

        edges = [
            {
                "id": "edge-g-human",
                "source": "node-greeting",
                "sourceHandle": "human",
                "target": "node-question",
                "data": {"label": "Human Answered", "color": "#10b981"},
            },
            {
                "id": "edge-q-router",
                "source": "node-question",
                "target": "node-router",
                "data": {"label": "Lead Speaks", "color": "#6366f1"},
            },
            {
                "id": "edge-r-pos",
                "source": "node-router",
                "sourceHandle": b0_handle,
                "target": "node-action-main",
                "data": {"label": b0_label, "color": b0_color},
            },
            {
                "id": "edge-r-reb",
                "source": "node-router",
                "sourceHandle": b1_handle,
                "target": "node-rebuttal",
                "data": {"label": b1_label, "isObjection": True, "color": b1_color},
            },
            {
                "id": "edge-r-busy",
                "source": "node-router",
                "sourceHandle": b2_handle,
                "target": "node-action-callback",
                "data": {"label": b2_label, "color": b2_color},
            },
            {
                "id": "edge-r-dnc",
                "source": "node-router",
                "sourceHandle": b3_handle,
                "target": "node-hangup-optout",
                "data": {"label": b3_label, "color": b3_color},
            },
            {
                "id": "edge-act-end",
                "source": "node-action-main",
                "target": "node-hangup-success",
                "data": {"label": "Action Complete", "color": b0_color},
            },
            {
                "id": "edge-reb-pos",
                "source": "node-rebuttal",
                "sourceHandle": "rebuttal-accepted",
                "target": "node-action-main",
                "data": {"label": "Rebuttal Accepted", "isReturn": True, "color": b0_color},
            },
            {
                "id": "edge-cb-end",
                "source": "node-action-callback",
                "target": "node-hangup-callback",
                "data": {"label": "SMS Sent", "color": b2_color},
            },
        ]

        # Enforce that every synthesized node matches allowed canvas node types
        for n in nodes:
            ntype = n.get("type")
            if ntype not in ALLOWED_CANVAS_NODE_TYPES:
                logger.error("Generated graph contains disallowed node type: %s", ntype)
                raise ValueError(
                    f"Disallowed canvas node type '{ntype}'. Allowed types: {sorted(list(ALLOWED_CANVAS_NODE_TYPES))}"
                )

        return {
            "id": campaign_id,
            "name": parsed.get("campaignName") or context.get("campaignName") or "AI Generated Campaign",
            "tagline": parsed.get("tagline") or context.get("description") or prompt,
            "category": parsed.get("category") or "AI Voice Outreach",
            "knowledge": knowledge,
            "nodes": nodes,
            "edges": edges,
        }


graph_generator_service = GraphGeneratorService()
