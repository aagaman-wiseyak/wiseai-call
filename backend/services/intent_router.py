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
            "You are an expert Outbound Voice AI Intent Classifier and Call Flow Router.\n"
            "Your job is to observe what the customer just said in response to the agent, "
            "and accurately select which outgoing decision branch/question to navigate to next.\n\n"
            f"CURRENT AGENT STEP:\n- ID: {current_node.get('id')}\n- Label: {current_node.get('data', {}).get('label')}\n- Spoken Prompt: \"{current_prompt}\"\n\n"
            f"AVAILABLE OUTGOING PATHS / NEXT STEPS:\n{json.dumps(branches_desc, indent=2)}\n\n"
            "TASK INSTRUCTIONS:\n"
            "1. Read the customer's response carefully.\n"
            "2. Map the customer's intent to the most appropriate branch condition.\n"
            "   - E.g. If customer indicates standard/light usage, map to the branch for Q3 (Basic 100 Mbps).\n"
            "   - E.g. If customer indicates multiple users, 4K streaming, or fast speeds, map to Q4 (300/1000 Mbps tier).\n"
            "   - E.g. If customer objects on cost/price, map to Price Objection Rebuttal.\n"
            "   - E.g. If customer agrees/confirms, map to the Action / Booking step.\n"
            "   - E.g. If customer declines or rejects, map to Not Interested / Exit.\n"
            "3. Return strict JSON with the selected target node ID and confidence.\n\n"
            "OUTPUT FORMAT (STRICT JSON ONLY):\n"
            "{\n"
            "  \"selected_target_id\": \"<target_node_id from the chosen branch>\",\n"
            "  \"matched_branch_condition\": \"<label of chosen branch condition>\",\n"
            "  \"intent\": \"<short identifier, e.g. 'upgrade_heavy_usage', 'stay_basic', 'price_objection', 'affirmative', 'negative'>\",\n"
            "  \"confidence\": 0.0 to 1.0,\n"
            "  \"reasoning\": \"Brief explanation of why this target was selected based on user's words.\"\n"
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
