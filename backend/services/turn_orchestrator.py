"""Stateful, grounded orchestration for a single outbound-call turn.

The LLM interprets language; it never gets to execute an arbitrary transition.
This module validates its proposed route against the flow and keeps a route on
hold while a customer question is being resolved.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from services.llm_service import llm_service

import re

logger = logging.getLogger("turn_orchestrator")


def sanitize_ai_speech(text: Optional[str]) -> str:
    """Strip stray markdown code fences, JSON artifacts, or trailing punctuation."""
    if not text:
        return ""
    t = str(text).strip()
    if t.startswith("```"):
        t = re.sub(r"^```[a-zA-Z]*\s*", "", t)
        t = re.sub(r"\s*```$", "", t).strip()
    # If the text contains no word or Nepali characters, it is purely bracket/punctuation artifact
    if not re.search(r"[\w\u0900-\u097F]", t):
        return ""
    # Strip stray dangling outer brackets if whole string is wrapped
    if (t.startswith("[") and t.endswith("]")) or (t.startswith("{") and t.endswith("}")):
        inner = t[1:-1].strip()
        if inner and not inner.startswith('"') and not inner.startswith('{'):
            t = inner
    return t.strip()


def _script(node: Dict[str, Any]) -> str:
    data = node.get("data", {})
    return data.get("speechPrompt") or data.get("openingScript") or data.get("label", "")


def _extract_last_question(speech: Optional[str]) -> str:
    """Extracts the final question from a node speech prompt to re-prompt caller."""
    if not speech:
        return ""
    cleaned = " ".join(str(speech).replace("\n", " ").split())
    sentences = [s.strip() for s in re.split(r"(?<=[.?!])\s+", cleaned) if s.strip()]
    question_sentences = [s for s in sentences if s.endswith("?")]
    if question_sentences:
        return question_sentences[-1]
    return sentences[-1] if sentences else ""


def _knowledge_items(campaign_knowledge: Optional[Dict[str, Any]]) -> List[Dict[str, str]]:
    """Normalise approved knowledge without inventing or supplementing facts.

    ``knowledgeItems`` is the new campaign handbook format. The FAQ/objection
    mapping is deliberately a migration adapter for the existing UI payload,
    not a product-specific default catalogue.
    """
    if not campaign_knowledge:
        return []

    items: List[Dict[str, str]] = []
    for item in campaign_knowledge.get("knowledgeItems", []):
        if item.get("status", "approved") != "approved":
            continue
        if item.get("id") and item.get("content"):
            items.append({
                "id": str(item["id"]),
                "title": str(item.get("title", "Campaign information")),
                "content": str(item["content"]),
            })

    # Backwards-compatible migration only. New campaigns should send
    # knowledgeItems with source/version metadata.
    if not items:
        for faq in campaign_knowledge.get("faqs", []):
            if faq.get("id") and faq.get("answer"):
                items.append({
                    "id": str(faq["id"]),
                    "title": str(faq.get("question", "Campaign FAQ")),
                    "content": str(faq["answer"]),
                })
        for objection in campaign_knowledge.get("globalObjections", []):
            if objection.get("id") and objection.get("response"):
                items.append({
                    "id": str(objection["id"]),
                    "title": str(objection.get("trigger", "Customer concern")),
                    "content": str(objection["response"]),
                })
    return items


class TurnOrchestrator:
    async def process(
        self,
        *,
        user_text: str,
        current_node: Dict[str, Any],
        outgoing_branches: List[Dict[str, Any]],
        all_nodes: List[Dict[str, Any]],
        campaign_knowledge: Optional[Dict[str, Any]],
        conversation_state: Optional[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
        language: str = "eng",
        all_edges: Optional[List[Dict[str, Any]]] = None,
    ) -> Dict[str, Any]:
        state = dict(conversation_state or {})
        pending_node_id = state.get("pending_next_node_id")
        knowledge_thread = state.get("knowledge_thread") or {}
        current_node_id = current_node.get("id")

        routes = []
        valid_route_ids = set()
        router_mapping = {}  # router_id -> list of child target_ids

        # Build candidate routes, auto-expanding scenarioBranch decision nodes
        edges_pool = all_edges or outgoing_branches
        for edge in outgoing_branches:
            target_id = edge.get("target")
            if not target_id:
                continue
            target = next((node for node in all_nodes if node.get("id") == target_id), None)
            if not target:
                continue

            target_type = target.get("data", {}).get("type")
            if target_type == "scenarioBranch":
                # Expand downstream branches from this router node
                downstream_edges = [e for e in edges_pool if e.get("source") == target_id]
                valid_route_ids.add(target_id)
                router_mapping[target_id] = []
                for de in downstream_edges:
                    dt_id = de.get("target")
                    dt_node = next((node for node in all_nodes if node.get("id") == dt_id), None)
                    d_cond = de.get("data", {}).get("label") or de.get("label") or "Branch Option"
                    if dt_id:
                        valid_route_ids.add(dt_id)
                        router_mapping[target_id].append(dt_id)
                        routes.append({
                            "id": dt_id,
                            "condition": d_cond,
                            "step": dt_node.get("data", {}).get("label", dt_id) if dt_node else dt_id,
                            "via_router": target_id,
                        })
            else:
                valid_route_ids.add(target_id)
                routes.append({
                    "id": target_id,
                    "condition": edge.get("data", {}).get("label") or edge.get("label") or "Next step",
                    "step": target.get("data", {}).get("label", target_id),
                })

        handbook = _knowledge_items(campaign_knowledge)
        history = [
            {"speaker": entry.get("speaker", "unknown"), "text": entry.get("text", "")}
            for entry in conversation_history[-6:]
        ]
        lang_instruction = (
            "LANGUAGE REQUIREMENT: You MUST formulate all answers and speech in natural Nepali (नेपाली भाषामा).\n"
            if language == "nep"
            else "LANGUAGE REQUIREMENT: Respond in natural conversational English.\n"
        )

        variable_name = current_node.get("data", {}).get("variableToExtract")
        var_instruction = ""
        if variable_name:
            var_instruction = (
                f"VARIABLE EXTRACTION:\n"
                f"The CURRENT_STEP expects an extracted variable named '{variable_name}'. "
                f"If the customer's response specifies or implies a value for '{variable_name}' (e.g. a rating, budget, timeframe, or category), "
                f"extract the normalized value into 'extracted_variable': {{\"name\": \"{variable_name}\", \"value\": <extracted_value>}}.\n"
                f"If the customer did not specify a value for '{variable_name}', set 'extracted_variable': null.\n\n"
            )

        agent_persona = (campaign_knowledge or {}).get("agentPersona") or {}
        lead_profile = (campaign_knowledge or {}).get("leadProfile") or {}
        campaign_identity = {
            "agent_name": agent_persona.get("name") or "Alex",
            "company": agent_persona.get("company") or "Company Representative",
            "role": agent_persona.get("role") or "Advisor",
            "lead_name": lead_profile.get("name") or "",
        }

        system_prompt = (
            "You are an expert real-time outbound call turn interpreter and conversational decision engine. "
            "Your objective is to accurately interpret the customer's spoken utterance, evaluate conversational context, "
            "select the optimal decision graph path, and provide strictly factual, voice-optimized spoken responses.\n\n"
            f"{lang_instruction}\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "CORE SPEECH & CONVERSATIONAL INTERPRETATION PRINCIPLES:\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "1. SPEECH DISFLUENCIES & ASR RESILIENCE:\n"
            "   - Real callers use filler words ('uh', 'um', 'like', 'well', 'you see'), hesitation pauses, and self-corrections.\n"
            "   - If caller corrects themselves (e.g., 'Tuesday... actually wait, Wednesday morning is better'), always prioritize their final affirmed intent.\n"
            "   - Tolerate common automatic speech recognition (ASR) phonetic distortions.\n\n"
            "2. DECISION ACTIONS:\n"
            "   a) 'transition': Customer answered the question, made a choice, agreed, objected, or asked for more details when an inquiry route exists in ALLOWED_ROUTES.\n"
            "      - Propose the appropriate 'selected_route_id' from ALLOWED_ROUTES.\n"
            "      - If an ALLOWED_ROUTE explicitly covers inquiry/details (e.g. 'Tell Me More', 'What Channels?', 'Learn More'), select that route under 'transition'!\n"
            "      - VOICE PHONE REALITY: The caller CANNOT see a screen. NEVER output vague filler like 'Let me show you the options' or 'Let me see what fits'.\n"
            "      - For 'answer', provide either a brief natural acknowledgment (e.g. 'Got it!' or 'Perfect!'), or leave empty so the target step's concrete plan options and prices are delivered directly.\n"
            "      - If caller is NOT the intended contact (e.g. receptionist, spouse, wrong number), choose the exit or third-party route, and provide a polite, natural spoken apology in 'answer'.\n\n"
            "   b) 'knowledge': Customer asks an informational question or raises a campaign-related concern NOT covered by an explicit branch in ALLOWED_ROUTES.\n"
            "      - CHECK APPROVED_KNOWLEDGE:\n"
            "        * If found in APPROVED_KNOWLEDGE, CAMPAIGN_IDENTITY, or RECENT_DIALOGUE: answer accurately and factually.\n"
            "        * If NOT found in APPROVED_KNOWLEDGE (e.g. unlisted student discount, student offer, senior discount, special promo):\n"
            "          - State clearly that you checked and confirmed we do not currently have that offer or discount available.\n"
            "          - FORBIDDEN PHRASES: NEVER say 'I can check that for you', 'Let me look into that', 'One moment please', or 'Hold on'. You are on a live phone call and cannot put the caller on hold!\n"
            "          - ALWAYS immediately follow up with a question re-anchoring to CURRENT_STEP or HELD_ROUTE! (e.g. 'I checked our plans, and we don't have a student discount available right now. Would you like to proceed with the Ultra plan, or look at a budget option?')\n"
            "      - VOICE BREVITY RULE: The spoken 'answer' MUST be concise (under 30 words), direct, and end with a follow-up question so the customer knows what to respond to.\n"
            "      - COMPOUND INPUTS: If customer answers the step AND asks a question (e.g. 'Yes that sounds good, but how much is it after 6 months?' or 'Sure, but who are you with again?'):\n"
            "        * Propose the appropriate route in 'selected_route_id'.\n"
            "        * Set has_question=true.\n"
            "        * Set knowledge_action='answer_and_hold'.\n"
            "        * Provide the concise spoken factual answer and follow-up in 'answer'.\n"
            "      - PURE INQUIRY WITHOUT MATCHING ROUTE: If customer asks for details before deciding and NO ALLOWED_ROUTE matches their inquiry, set selected_route_id=null, set knowledge_action='answer_and_hold', and answer the question with a follow-up.\n\n"
            "   c) KNOWLEDGE THREAD RESOLUTION & PERSISTENT CHECKS:\n"
            "      - If caller persists or asks to check again ('please check and let me know', 'can you check?'):\n"
            "        * Affirm clearly that you verified our active system and confirmed there is no such discount or offer available at this time.\n"
            "        * Re-prompt the CURRENT_STEP question (or HELD_ROUTE) to ask whether they would like to proceed with our available plans.\n"
            "      - When an OPEN_KNOWLEDGE_THREAD is active and caller expresses understanding or makes a choice ('okay', 'I see', 'sounds fair', 'got it', 'proceed', 'internet only'):\n"
            "        * If caller made a choice matching an ALLOWED_ROUTE (e.g. 'internet only' or 'add tv'): set decision='transition', select that route ID, and set knowledge_action='continue_held_route'.\n"
            "        * If HELD_ROUTE_ID is set: set knowledge_action='continue_held_route' to proceed.\n"
            "        * If HELD_ROUTE_ID is none: set knowledge_action='ask_question_again', and in 'answer', politely re-ask the CURRENT_STEP question.\n\n"
            "   d) 'repeat' / CLARIFICATION:\n"
            "      - If customer expresses confusion ('what?', 'pardon?', 'I don't understand', 'what is this regarding?'):\n"
            "      - Provide an empathetic, clear 1-sentence re-explanation in 'answer' drawing on APPROVED_KNOWLEDGE.\n\n"
            f"{var_instruction}"
            f"CURRENT_STEP: {_script(current_node)}\n"
            f"ALLOWED_ROUTES: {json.dumps(routes)}\n"
            f"HELD_ROUTE_ID: {pending_node_id or 'none'}\n"
            f"OPEN_KNOWLEDGE_THREAD: {json.dumps(knowledge_thread)}\n"
            f"CAMPAIGN_IDENTITY: {json.dumps(campaign_identity)}\n"
            f"APPROVED_KNOWLEDGE: {json.dumps(handbook)}\n\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "RETURN STRICT JSON ONLY:\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "{\n"
            '  "decision": "transition|repeat|knowledge",\n'
            '  "extracted_intent": "Precise, freeform summary of customer\'s spoken intent",\n'
            '  "selected_route_id": "Allowed route ID from ALLOWED_ROUTES or null",\n'
            '  "has_question": true/false,\n'
            '  "answer": "Concise spoken response/clarification under 25 words, or empty string",\n'
            '  "source_ids": ["IDs of approved knowledge items cited"],\n'
            '  "knowledge_action": "answer_and_hold|continue_held_route|ask_question_again|no_knowledge",\n'
            '  "extracted_variable": {"name": "variable_name", "value": "normalized_value"} or null,\n'
            '  "confidence": 0.0 to 1.0,\n'
            '  "reasoning": "Concise justification for the routing and decision"\n'
            "}"
        )
        user_prompt = f"RECENT_DIALOGUE: {json.dumps(history)}\nCUSTOMER: {user_text}"

        try:
            result = await llm_service.structured_completion(system_prompt, user_prompt)
        except Exception as error:
            logger.exception("Turn interpretation failed")
            fallback_speech = (
                "माफ गर्नुहोस्, मैले बुझ्न सकिन। कृपया फेरि भन्नुहुन्छ कि?"
                if language == "nep"
                else "I’m sorry, I couldn’t process that just now. Could you please repeat it?"
            )
            return {
                "next_node_id": current_node_id,
                "ai_response_text": fallback_speech,
                "intent_matched": "interpretation_unavailable",
                "confidence": 0.0,
                "knowledge_invoked": False,
                "knowledge_topic": None,
                "reasoning": "LLM interpretation failed; stayed on current node.",
                "conversation_state": state,
            }

        proposed_route = result.get("selected_route_id")
        # A held route belongs to the previous step, so it is separately
        # permitted only while resolving that exact knowledge thread.
        if proposed_route not in valid_route_ids and proposed_route != pending_node_id:
            proposed_route = None

        approved_ids = {item["id"] for item in handbook}
        source_ids = [source_id for source_id in result.get("source_ids", []) if source_id in approved_ids]
        action = result.get("knowledge_action", "no_knowledge")
        has_question = bool(result.get("has_question"))
        answer = sanitize_ai_speech(result.get("answer"))
        decision = result.get("decision", "transition" if proposed_route else "repeat")
        extracted_intent = str(result.get("extracted_intent") or result.get("caller_intent") or "").lower()
        extracted_var = result.get("extracted_variable")
        if not (isinstance(extracted_var, dict) and extracted_var.get("name") and extracted_var.get("value") is not None):
            extracted_var = None

        # Auto-resolve scenarioBranch: if proposed_route is a router node, traverse to its child
        proposed_node = next((n for n in all_nodes if n.get("id") == proposed_route), None)
        if proposed_node and proposed_node.get("data", {}).get("type") == "scenarioBranch":
            child_edges = [e for e in edges_pool if e.get("source") == proposed_route]
            if child_edges:
                matched_child = None
                for ce in child_edges:
                    clabel = (ce.get("data", {}).get("label") or ce.get("label") or "").lower()
                    if ("objection" in clabel or "concern" in clabel or "price" in clabel or "cost" in clabel) and any(w in extracted_intent for w in ["cost", "price", "expensive", "concern", "doubt", "plan"]):
                        matched_child = ce.get("target")
                        break
                    elif ("busy" in clabel or "callback" in clabel or "later" in clabel) and any(w in extracted_intent for w in ["busy", "later", "driving", "meeting", "call back"]):
                        matched_child = ce.get("target")
                        break
                    elif ("exit" in clabel or "opt" in clabel or "not" in clabel or "dnc" in clabel) and any(w in extracted_intent for w in ["not interested", "no", "remove", "cancel", "dnc"]):
                        matched_child = ce.get("target")
                        break
                    elif any(w in clabel for w in ["yes", "interested", "accept", "positive", "heavy", "light"]) and any(w in extracted_intent for w in ["yes", "sure", "heavy", "light", "interested", "ok"]):
                        matched_child = ce.get("target")
                        break
                if not matched_child:
                    matched_child = child_edges[0].get("target")
                proposed_route = matched_child

        # Check if caller stated they are not the intended contact
        is_wrong_contact = (
            "wrong" in extracted_intent
            or "brother" in extracted_intent
            or ("not " in extracted_intent and "lead" in extracted_intent)
            or "third_party" in extracted_intent
            or result.get("caller_intent") == "wrong_contact"
        )
        if is_wrong_contact:
            state["lead_name_suppressed"] = True

        # 1. KNOWLEDGE QUESTION OR ANSWER_AND_HOLD
        if action == "answer_and_hold" or (decision == "knowledge" and (answer or source_ids)) or (has_question and not proposed_route):
            held_route = proposed_route or pending_node_id
            state["pending_next_node_id"] = held_route
            state["knowledge_thread"] = {
                "topic": result.get("extracted_intent") or "campaign question",
                "status": "awaiting_customer_confirmation",
                "source_ids": source_ids,
            }
            if not answer:
                answer = (
                    "माफ गर्नुहोस्, यस सम्बन्धी आधिकारिक जानकारी मसँग छैन। म हाम्रो टोलीसँग बुझेर खबर गराउन सक्छु।"
                    if language == "nep"
                    else "I checked our current catalogue, and we don't have that specific offer or discount available right now."
                )
            clean_speech = sanitize_ai_speech(answer)

            # Strip any forbidden "hold on / let me check / one moment" promises
            hold_patterns = [
                r"one moment[,\s]*please\.?",
                r"one moment\.?",
                r"let me check (if|that|for you|what|whether)[a-zA-Z\s]*\.?",
                r"i('ll| will| can) (look into|check) that[a-zA-Z\s]*\.?",
                r"hold on[,\s]*please\.?",
            ]
            for hp in hold_patterns:
                clean_speech = re.sub(hp, "I checked our current offers and we don't have that discount available right now.", clean_speech, flags=re.IGNORECASE).strip()

            # Ensure the AI always asks a follow-up question so the customer isn't left hanging
            if not any(clean_speech.strip().endswith(p) for p in ["?", "हो?", "छ त?", "हुन्न र?"]):
                q_node = next((n for n in all_nodes if n.get("id") == held_route), None) if held_route else current_node
                q_text = _extract_last_question(q_node.get("data", {}).get("speechPrompt", "") if q_node else "")
                if q_text:
                    clean_speech = f"{clean_speech.rstrip('. ')}. {q_text}"
                else:
                    clean_speech = f"{clean_speech.rstrip('. ')}. Would you like to proceed with our current renewal options?"

            return {
                "next_node_id": current_node_id,
                "ai_response_text": sanitize_ai_speech(clean_speech),
                "intent_matched": "campaign_knowledge",
                "confidence": result.get("confidence", 0.0),
                "knowledge_invoked": True,
                "knowledge_topic": state["knowledge_thread"]["topic"],
                "knowledge_source_ids": source_ids,
                "extracted_variable": extracted_var,
                "reasoning": result.get("reasoning", "Answered campaign question and held the next route."),
                "conversation_state": state,
            }

        # 2. RESUME HELD ROUTE AFTER KNOWLEDGE RESOLUTION OR ROUTE TRANSITION
        if proposed_route and decision == "transition":
            state.pop("pending_next_node_id", None)
            state.pop("knowledge_thread", None)
            # Falls through directly to Section 4: transition to proposed_route!
        elif (action == "continue_held_route" or (decision == "transition" and pending_node_id)) and pending_node_id:
            held_id = pending_node_id
            state.pop("pending_next_node_id", None)
            state.pop("knowledge_thread", None)
            if "repeat_counts" in state and not state["repeat_counts"]:
                state.pop("repeat_counts", None)

            clean_answer = sanitize_ai_speech(answer)
            if not clean_answer:
                resumed_node = next((n for n in all_nodes if n.get("id") == held_id), None)
                if resumed_node:
                    rtype = resumed_node.get("data", {}).get("type")
                    if rtype == "question":
                        clean_answer = resumed_node.get("data", {}).get("speechPrompt", "")
                    elif rtype == "action":
                        clean_answer = f"Great, let's proceed! Locking in your {resumed_node.get('data', {}).get('label', 'selected plan')} right now."
                    elif rtype == "hangup":
                        clean_answer = resumed_node.get("data", {}).get("closingScript", "Thank you! Have a great day.")

            return {
                "next_node_id": held_id,
                "ai_response_text": clean_answer,
                "intent_matched": "knowledge_resolved",
                "confidence": result.get("confidence", 0.0),
                "knowledge_invoked": False,
                "knowledge_topic": None,
                "extracted_variable": extracted_var,
                "reasoning": result.get("reasoning", "Customer resolved the question; resuming held route."),
                "conversation_state": state,
            }

        # 3. CUSTOMER SATISFIED AFTER KNOWLEDGE BUT NO ROUTE WAS HELD: RE-ASK QUESTION
        if action == "ask_question_again" or (action == "continue_held_route" and not pending_node_id):
            state.pop("pending_next_node_id", None)
            state.pop("knowledge_thread", None)
            if "repeat_counts" in state and not state["repeat_counts"]:
                state.pop("repeat_counts", None)

            current_script = _script(current_node)
            if not answer:
                if language == "nep":
                    answer = f"बुझ्नुभयो? अब कृपया भन्नुहोस्: {current_script}"
                else:
                    answer = f"Glad to help with that! Coming back to our question: {current_script}"

            return {
                "next_node_id": current_node_id,
                "ai_response_text": answer,
                "intent_matched": "reprompt_after_knowledge",
                "confidence": result.get("confidence", 0.0),
                "knowledge_invoked": False,
                "knowledge_topic": None,
                "extracted_variable": extracted_var,
                "reasoning": "Customer satisfied with knowledge answer; re-asking current question.",
                "conversation_state": state,
            }

        # 4. SUCCESSFUL TRANSITION TO NEXT NODE
        if proposed_route and decision != "repeat":
            repeat_counts = state.get("repeat_counts", {})
            if current_node_id and current_node_id in repeat_counts:
                del repeat_counts[current_node_id]
            if repeat_counts:
                state["repeat_counts"] = repeat_counts
            else:
                state.pop("repeat_counts", None)

            clean_answer = sanitize_ai_speech(answer)
            target_node = next((n for n in all_nodes if n.get("id") == proposed_route), None)
            target_script = _script(target_node) if target_node else ""

            if is_wrong_contact and not clean_answer:
                clean_answer = (
                    "माफ गर्नुहोस्, सम्पर्कमा केही भ्रम भयो। जानकारी दिनुभएकोमा धन्यवाद। शुभ दिन!"
                    if language == "nep"
                    else "Oh, apologies for the mix-up! Thank you for letting me know. Have a wonderful day!"
                )
            elif target_script:
                is_just_filler = any(phrase in clean_answer.lower() for phrase in [
                    "let me show", "let's see", "option in mind", "best options for",
                    "fits your", "recommend our", "look into that", "options available"
                ]) and not any(kw in clean_answer.lower() for kw in ["mbps", "rs", "rupee", "price", "pack", "?"])

                if is_just_filler or not clean_answer:
                    prefix = "Got it! " if any(w in clean_answer.lower() for w in ["got it", "understand", "thanks", "perfect"]) else ""
                    clean_answer = f"{prefix}{target_script}"
                elif "?" not in clean_answer and "?" in target_script:
                    clean_answer = f"{clean_answer.rstrip('.!')}. {target_script}"

            return {
                "next_node_id": proposed_route,
                "ai_response_text": clean_answer,
                "intent_matched": "wrong_contact" if is_wrong_contact else (result.get("extracted_intent") or "routed"),
                "confidence": result.get("confidence", 0.0),
                "knowledge_invoked": False,
                "knowledge_topic": None,
                "extracted_variable": extracted_var,
                "reasoning": result.get("reasoning", "Mapped by LLM intent router."),
                "conversation_state": state,
            }

        # 4. REPEAT / CLARIFY WITH PER-QUESTION POLICY
        max_repeats = int(current_node.get("data", {}).get("maxRepeats") or 2)
        repeat_counts = state.setdefault("repeat_counts", {})
        current_repeats = repeat_counts.get(current_node_id, 0)

        if current_repeats < max_repeats:
            repeat_counts[current_node_id] = current_repeats + 1
            state["repeat_counts"] = repeat_counts

            current_script = _script(current_node)
            clean_answer = sanitize_ai_speech(answer)
            if not clean_answer:
                if language == "nep":
                    clean_answer = f"हजुर, मैले भन्न खोजेको: {current_script}"
                else:
                    clean_answer = f"No problem, let me repeat: {current_script}"

            return {
                "next_node_id": current_node_id,
                "ai_response_text": clean_answer,
                "intent_matched": "repeated_question",
                "confidence": result.get("confidence", 0.0),
                "knowledge_invoked": False,
                "knowledge_topic": None,
                "extracted_variable": extracted_var,
                "reasoning": f"Repeated question ({current_repeats + 1}/{max_repeats}).",
                "conversation_state": state,
            }

        # MAX REPEATS REACHED: TAKE FALLBACK BRANCH OR POLITE EXIT
        repeat_counts.pop(current_node_id, None)
        if not repeat_counts:
            state.pop("repeat_counts", None)

        fallback_branch = None
        for edge in outgoing_branches:
            target_id = edge.get("target")
            target = next((n for n in all_nodes if n.get("id") == target_id), None)
            target_type = target.get("data", {}).get("type") if target else ""
            edge_label = (edge.get("data", {}).get("label") or edge.get("label") or "").lower()
            if target_type == "hangup" or any(w in edge_label for w in ["exit", "busy", "decline", "fallback"]):
                fallback_branch = target_id
                break

        if fallback_branch:
            return {
                "next_node_id": fallback_branch,
                "ai_response_text": (
                    "माफ गर्नुहोस्, सम्पर्कमा केही कठिनाइ भयो। म आवश्यक विवरण सन्देशमार्फत पठाइदिनेछु। धन्यवाद!"
                    if language == "nep"
                    else "I apologize, it seems we're having a little trouble connecting. I'll send you the details directly so you have them. Have a great day!"
                ),
                "intent_matched": "max_repeats_fallback",
                "confidence": 1.0,
                "knowledge_invoked": False,
                "knowledge_topic": None,
                "reasoning": f"Max repeats ({max_repeats}) reached. Routed to fallback node {fallback_branch}.",
                "conversation_state": state,
            }

        return {
            "next_node_id": None,
            "ai_response_text": (
                "मैले तपाईंको आवाज राम्रोसँग सुन्न सकिन। म पछि फेरि सम्पर्क गर्नेछु। धन्यवाद!"
                if language == "nep"
                else "I'm having a little trouble hearing you clearly. Let me have our team follow up with you directly. Thank you!"
            ),
            "intent_matched": "max_repeats_exceeded",
            "confidence": 1.0,
            "knowledge_invoked": False,
            "knowledge_topic": None,
            "reasoning": f"Max repeats ({max_repeats}) reached without explicit fallback edge.",
            "conversation_state": state,
        }



turn_orchestrator = TurnOrchestrator()

