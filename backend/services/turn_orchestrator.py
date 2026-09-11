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

        system_prompt = (
            f"You are an outbound-call turn interpreter. Return strict JSON only.\n{lang_instruction}"
            "You may propose a route ONLY from ALLOWED_ROUTES. A customer can both answer a question and ask a question in the same utterance. "
            "When they ask a question, preserve any proposed route as pending and answer before advancing.\n"
            "Use only APPROVED_KNOWLEDGE for an answer. Never make up pricing, policy, eligibility, or company facts. "
            "If the handbook cannot answer, say so briefly and offer the configured human/support follow-up; do not invent an answer.\n"
            "If a knowledge thread is open, resolve it only when the customer clearly indicates they are satisfied or asks to continue. "
            "A follow-up question keeps it open. A rejection/callback request can replace the held route if an allowed route matches.\n\n"
            f"CURRENT_STEP: {_script(current_node)}\n"
            f"ALLOWED_ROUTES: {json.dumps(routes)}\n"
            f"HELD_ROUTE_ID: {pending_node_id or 'none'}\n"
            f"OPEN_KNOWLEDGE_THREAD: {json.dumps(knowledge_thread)}\n"
            f"APPROVED_KNOWLEDGE: {json.dumps(handbook)}\n\n"
            "Return this JSON shape:\n"
            '{"selected_route_id": "allowed id or null", "has_question": true, '
            '"answer": "spoken answer or empty", "source_ids": ["approved item id"], '
            '"knowledge_action": "answer_and_hold|continue_held_route|no_knowledge", '
            '"topic": "short topic or null", "confidence": 0.0, "reasoning": "short"}'
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
                "next_node_id": None,
                "ai_response_text": fallback_speech,
                "intent_matched": "interpretation_unavailable",
                "confidence": 0.0,
                "knowledge_invoked": False,
                "knowledge_topic": None,
                "reasoning": "LLM interpretation failed; no transition was taken.",
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

        if has_question or action == "answer_and_hold":
            # A question always takes precedence over advancing. Keep a newly
            # detected route, otherwise retain the already held route.
            held_route = proposed_route or pending_node_id
            state["pending_next_node_id"] = held_route
            state["knowledge_thread"] = {
                "topic": result.get("topic") or "campaign question",
                "status": "awaiting_customer_confirmation",
                "source_ids": source_ids,
            }
            if not answer:
                answer = "I don’t have an approved answer for that detail. I can arrange for our team to follow up."
            return {
                "next_node_id": current_node.get("id"),
                "ai_response_text": answer,
                "intent_matched": "campaign_knowledge",
                "confidence": result.get("confidence", 0.0),
                "knowledge_invoked": True,
                "knowledge_topic": state["knowledge_thread"]["topic"],
                "knowledge_source_ids": source_ids,
                "reasoning": result.get("reasoning", "Answered campaign question and held the next route."),
                "conversation_state": state,
            }

        if action == "continue_held_route" and pending_node_id:
            state.pop("pending_next_node_id", None)
            state.pop("knowledge_thread", None)
            return {
                "next_node_id": pending_node_id,
                "ai_response_text": "",
                "intent_matched": "knowledge_resolved",
                "confidence": result.get("confidence", 0.0),
                "knowledge_invoked": False,
                "knowledge_topic": None,
                "reasoning": result.get("reasoning", "Customer resolved the question; resuming held route."),
                "conversation_state": state,
            }

        return {
            "next_node_id": proposed_route,
            "ai_response_text": "",
            "intent_matched": "routed" if proposed_route else "needs_clarification",
            "confidence": result.get("confidence", 0.0),
            "knowledge_invoked": False,
            "knowledge_topic": None,
            "reasoning": result.get("reasoning", "No valid transition selected."),
            "conversation_state": state,
        }


turn_orchestrator = TurnOrchestrator()
