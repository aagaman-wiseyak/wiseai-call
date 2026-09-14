"""Stateful, grounded orchestration for a single outbound-call turn.

The LLM interprets language; it never gets to execute an arbitrary transition.
This module validates its proposed route against the flow and keeps a route on
hold while a customer question is being resolved.
"""

import json
import logging
from typing import Any, Dict, List, Optional

from services.llm_service import llm_service

logger = logging.getLogger("turn_orchestrator")


def _script(node: Dict[str, Any]) -> str:
    data = node.get("data", {})
    return data.get("speechPrompt") or data.get("openingScript") or data.get("label", "")


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
    ) -> Dict[str, Any]:
        state = dict(conversation_state or {})
        pending_node_id = state.get("pending_next_node_id")
        knowledge_thread = state.get("knowledge_thread") or {}
        current_node_id = current_node.get("id")

        routes = []
        valid_route_ids = set()
        for edge in outgoing_branches:
            target_id = edge.get("target")
            if not target_id:
                continue
            target = next((node for node in all_nodes if node.get("id") == target_id), None)
            valid_route_ids.add(target_id)
            routes.append({
                "id": target_id,
                "condition": edge.get("data", {}).get("label") or edge.get("label") or "Next step",
                "step": target.get("data", {}).get("label", target_id) if target else target_id,
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

        system_prompt = (
            f"You are an intelligent outbound-call turn interpreter and flow decision engine. Return strict JSON only.\n{lang_instruction}"
            "CORE PRINCIPLES (NO HARDCODED INTENT RESTRICTIONS):\n"
            "Analyze what the customer said in conversational context, extract their genuine intent into 'extracted_intent' (freeform description), and decide the appropriate action:\n\n"
            "1. 'transition': Customer answered the question, made a choice, confirmed, or declined matching an ALLOWED_ROUTE.\n"
            "   - Propose 'selected_route_id' from ALLOWED_ROUTES.\n"
            "   - If the caller states they are NOT the intended contact (e.g. brother, receptionist, wrong number), "
            "     select an allowed third-party or exit route, and provide a polite, natural apology in 'answer' without addressing them as the lead.\n\n"
            "2. 'knowledge': Customer asks a question or raises a concern.\n"
            "   - Answer using ONLY APPROVED_KNOWLEDGE. Never invent facts.\n"
            "   - COMPOUND INPUTS: If the customer answers the step AND asks a question (e.g. 'Yes, but is there a contract?'), "
            "     select the route in 'selected_route_id', set has_question=true, set knowledge_action='answer_and_hold', and provide the spoken answer.\n"
            "   - If they ask a question before choosing a branch, set knowledge_action='answer_and_hold', selected_route_id=null, and provide the answer.\n\n"
            "3. KNOWLEDGE THREAD RESOLUTION (Customer is satisfied after an answer):\n"
            "   - If an OPEN_KNOWLEDGE_THREAD is active and the customer indicates satisfaction or understanding ('okay', 'sounds good', 'got it'):\n"
            "     * If HELD_ROUTE_ID is set (they had agreed before asking): set knowledge_action='continue_held_route' to advance along the held route.\n"
            "     * If HELD_ROUTE_ID is none (they asked before answering): set knowledge_action='ask_question_again', and in 'answer', politely re-ask the CURRENT_STEP question now that their inquiry is answered.\n\n"
            "4. 'repeat' / CLARIFICATION (Customer is confused or says 'I don't understand'):\n"
            "   - If customer says 'I don't understand', 'What do you mean?', or asks to repeat:\n"
            "   - In 'answer', explain the question with GREATER CLARITY. You may draw on APPROVED_KNOWLEDGE to clarify concepts, plan speeds, or terms so the customer easily understands.\n\n"
            f"{var_instruction}"
            f"CURRENT_STEP: {_script(current_node)}\n"
            f"ALLOWED_ROUTES: {json.dumps(routes)}\n"
            f"HELD_ROUTE_ID: {pending_node_id or 'none'}\n"
            f"OPEN_KNOWLEDGE_THREAD: {json.dumps(knowledge_thread)}\n"
            f"APPROVED_KNOWLEDGE: {json.dumps(handbook)}\n\n"
            "Return this JSON shape:\n"
            '{\n'
            '  "decision": "transition|repeat|knowledge",\n'
            '  "extracted_intent": "freeform summary of customer intent",\n'
            '  "selected_route_id": "allowed id or null",\n'
            '  "has_question": true,\n'
            '  "answer": "spoken response, clarification, or empty string",\n'
            '  "source_ids": ["approved item id"],\n'
            '  "knowledge_action": "answer_and_hold|continue_held_route|ask_question_again|no_knowledge",\n'
            '  "extracted_variable": {"name": "variable_name", "value": "extracted value"} or null,\n'
            '  "confidence": 0.0,\n'
            '  "reasoning": "short explanation"\n'
            '}'
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
        answer = str(result.get("answer") or "").strip()
        decision = result.get("decision", "transition" if proposed_route else "repeat")
        extracted_intent = str(result.get("extracted_intent") or result.get("caller_intent") or "").lower()
        extracted_var = result.get("extracted_variable")
        if not (isinstance(extracted_var, dict) and extracted_var.get("name") and extracted_var.get("value") is not None):
            extracted_var = None

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
        if has_question or action == "answer_and_hold" or (decision == "knowledge" and (answer or source_ids)):
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
                    else "I don’t have an approved answer for that detail. I can arrange for our team to follow up."
                )
            return {
                "next_node_id": current_node_id,
                "ai_response_text": answer,
                "intent_matched": "campaign_knowledge",
                "confidence": result.get("confidence", 0.0),
                "knowledge_invoked": True,
                "knowledge_topic": state["knowledge_thread"]["topic"],
                "knowledge_source_ids": source_ids,
                "extracted_variable": extracted_var,
                "reasoning": result.get("reasoning", "Answered campaign question and held the next route."),
                "conversation_state": state,
            }

        # 2. RESUME HELD ROUTE AFTER KNOWLEDGE RESOLUTION
        if action == "continue_held_route" and pending_node_id:
            state.pop("pending_next_node_id", None)
            state.pop("knowledge_thread", None)
            if "repeat_counts" in state and not state["repeat_counts"]:
                state.pop("repeat_counts", None)
            return {
                "next_node_id": pending_node_id,
                "ai_response_text": answer,
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

            if is_wrong_contact and not answer:
                answer = (
                    "माफ गर्नुहोस्, सम्पर्कमा केही भ्रम भयो। जानकारी दिनुभएकोमा धन्यवाद। शुभ दिन!"
                    if language == "nep"
                    else "Oh, apologies for the mix-up! Thank you for letting me know. Have a wonderful day!"
                )

            return {
                "next_node_id": proposed_route,
                "ai_response_text": answer,
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
            if not answer:
                if language == "nep":
                    answer = f"हजुर, मैले भन्न खोजेको: {current_script}"
                else:
                    answer = f"No problem, let me repeat: {current_script}"

            return {
                "next_node_id": current_node_id,
                "ai_response_text": answer,
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
