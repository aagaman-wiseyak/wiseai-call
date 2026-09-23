import json
import logging
from typing import Dict, Any, List, Optional
from services.llm_service import llm_service

logger = logging.getLogger("intent_router")

class IntentRouterService:
    def __init__(self):
        pass

    async def route_intent(
        self,
        user_text: str,
        current_node: Dict[str, Any],
        outgoing_branches: List[Dict[str, Any]],
        all_nodes: List[Dict[str, Any]],
        conversation_history: List[Dict[str, Any]],
    ) -> Dict[str, Any]:
        """
        Observes the customer's response, analyzes current step and outgoing branches,
        and uses the LLM to cleanly map to the next question or node (e.g., Q3 vs Q4, action, rebuttal, or hangup).
        """
        current_prompt = (
            current_node.get("data", {}).get("speechPrompt")
            or current_node.get("data", {}).get("openingScript")
            or current_node.get("data", {}).get("label")
        )

        branches_desc = []
        for idx, b in enumerate(outgoing_branches):
            target_id = b.get("target")
            target_node = next((n for n in all_nodes if n.get("id") == target_id), None)
            target_label = target_node.get("data", {}).get("label", target_id) if target_node else target_id
            target_type = target_node.get("data", {}).get("type", "step") if target_node else "step"
            
            branch_label = b.get("data", {}).get("label") or b.get("label") or f"Branch {idx+1}"
            branches_desc.append({
                "branch_index": idx,
                "edge_id": b.get("id"),
                "branch_condition": branch_label,
                "target_node_id": target_id,
                "target_node_label": target_label,
                "target_node_type": target_type,
            })

        system_prompt = (
            "You are an expert Outbound Conversational Voice AI Intent Classifier and Branch Routing Engine. "
            "Your objective is to analyze the customer's response within the conversational context and accurately select "
            "the single most appropriate outgoing decision branch/question to navigate to next.\n\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "BRANCH CLASSIFICATION & ROUTING RULES:\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "1. POSITIVE / CONFIRMATION:\n"
            "   - If customer expresses agreement, confirmation, or willingness to proceed (e.g. 'yes', 'sure', 'sounds good', 'let's do it', 'that works'), "
            "route to the positive/action branch.\n\n"
            "2. OBJECTIONS & FRICTION:\n"
            "   - If customer expresses concern regarding cost, contract, equipment, or value, prioritize the rebuttal or clarification branch.\n"
            "   - CONFLICT RESOLUTION: If customer shows mixed intent (e.g. 'I want it, but I cannot afford more than $30'), "
            "route to the objection/clarification branch FIRST so the concern is safely resolved before committing.\n\n"
            "3. BUSY / CALLBACK / RESCHEDULE:\n"
            "   - If customer mentions being occupied, driving, working, or asks to be contacted later, route to the callback or reschedule branch.\n\n"
            "4. DECLINE / OPT-OUT / NOT INTERESTED:\n"
            "   - If customer explicitly declines, rejects the proposal, or requests not to be called, route to the polite exit or DNC branch.\n\n"
            "5. QUALIFYING VARIABLE MATCH:\n"
            "   - If the current step asks a multiple-choice or preference question (e.g. plan tiers, scheduling preference), "
            "map the customer's answer to the corresponding branch condition.\n\n"
            f"CURRENT AGENT STEP:\n- ID: {current_node.get('id')}\n- Label: {current_node.get('data', {}).get('label')}\n- Spoken Prompt: \"{current_prompt}\"\n\n"
            f"AVAILABLE OUTGOING PATHS / NEXT STEPS:\n{json.dumps(branches_desc, indent=2)}\n\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "OUTPUT SPECIFICATION (STRICT JSON ONLY):\n"
            "═══════════════════════════════════════════════════════════════════════════\n"
            "{\n"
            "  \"selected_target_id\": \"<target_node_id from the chosen branch>\",\n"
            "  \"matched_branch_condition\": \"<label of chosen branch condition>\",\n"
            "  \"intent\": \"<precise intent identifier, e.g. 'affirmative', 'price_objection', 'busy_reschedule', 'disqualified_not_interested'>\",\n"
            "  \"confidence\": 0.0 to 1.0,\n"
            "  \"reasoning\": \"Detailed rationale explaining why the customer utterance mapped to this branch\"\n"
            "}"
        )

        history_snippets = []
        for h in conversation_history[-4:]:
            role = h.get("speaker", "unknown")
            text = h.get("text", "")
            history_snippets.append(f"{role.upper()}: {text}")
        dialogue_context = "\n".join(history_snippets)

        user_prompt = (
            f"RECENT DIALOGUE:\n{dialogue_context}\n\n"
            f"CUSTOMER JUST SAID: \"{user_text}\"\n\n"
            "Determine the next decision node ID now."
        )

        try:
            result = await llm_service.structured_completion(
                system_prompt=system_prompt,
                user_prompt=user_prompt
            )

            selected_id = result.get("selected_target_id")
            # Verify selected_id is a valid outgoing target
            valid_targets = [b["target_node_id"] for b in branches_desc]
            if selected_id not in valid_targets and valid_targets:
                logger.warning(f"LLM returned {selected_id} which is not in {valid_targets}. Defaulting to first.")
                selected_id = valid_targets[0]

            return {
                "next_node_id": selected_id,
                "matched_branch": result.get("matched_branch_condition"),
                "intent": result.get("intent", "routed_by_llm"),
                "confidence": result.get("confidence", 0.9),
                "reasoning": result.get("reasoning", "Matched by LLM intent router."),
            }
        except Exception as e:
            logger.error(f"Intent router error: {e}. Using fallback heuristic.")
            # Fallback heuristic
            lower = user_text.lower()
            if any(w in lower for w in ["yes", "sure", "definitely", "interested", "ok", "upgrade", "faster"]):
                chosen = next((b for b in branches_desc if "yes" in b["branch_condition"].lower() or "action" in b["target_node_type"]), branches_desc[0] if branches_desc else None)
            elif any(w in lower for w in ["no", "not interested", "cancel", "stop", "don't want"]):
                chosen = next((b for b in branches_desc if "no" in b["branch_condition"].lower() or "hangup" in b["target_node_type"] or "exit" in b["branch_condition"].lower()), branches_desc[0] if branches_desc else None)
            elif any(w in lower for w in ["expensive", "price", "cost", "too much", "cheap"]):
                chosen = next((b for b in branches_desc if "price" in b["branch_condition"].lower() or "knowledge" in b["target_node_type"]), branches_desc[0] if branches_desc else None)
            else:
                chosen = branches_desc[0] if branches_desc else None

            return {
                "next_node_id": chosen["target_node_id"] if chosen else None,
                "matched_branch": chosen["branch_condition"] if chosen else "Default fallback",
                "intent": "heuristic_fallback",
                "confidence": 0.7,
                "reasoning": "Fallback keyword mapping applied.",
            }

intent_router_service = IntentRouterService()
