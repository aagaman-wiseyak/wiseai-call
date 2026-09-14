import asyncio
import pytest

from schemas import CampaignKnowledgePayload
from services.campaign_store import CampaignStore
from services.turn_orchestrator import turn_orchestrator


def test_compound_affirmative_question_holds_route(monkeypatch):
    async def completion(*_args, **_kwargs):
        return {
            "selected_route_id": "q2",
            "has_question": True,
            "answer": "We use it only to confirm the renewal option available to your account.",
            "source_ids": ["policy-data-use"],
            "knowledge_action": "answer_and_hold",
            "topic": "why account details are needed",
            "confidence": 0.97,
            "reasoning": "Customer agreed and asked a question.",
        }

    monkeypatch.setattr("services.turn_orchestrator.llm_service.structured_completion", completion)
    result = asyncio.run(turn_orchestrator.process(
        user_text="Yes, but why do you need that?",
        current_node={"id": "q1", "data": {"speechPrompt": "May I confirm your details?"}},
        outgoing_branches=[{"id": "yes", "source": "q1", "target": "q2", "data": {"label": "Yes"}}],
        all_nodes=[{"id": "q1", "data": {}}, {"id": "q2", "data": {"label": "Usage discovery"}}],
        campaign_knowledge={"knowledgeItems": [{"id": "policy-data-use", "title": "Data use", "content": "Use account details only for renewal eligibility.", "status": "approved"}]},
        conversation_state={},
        conversation_history=[],
    ))

    assert result["next_node_id"] == "q1"
    assert result["knowledge_invoked"] is True
    assert result["conversation_state"]["pending_next_node_id"] == "q2"
    assert result["knowledge_source_ids"] == ["policy-data-use"]


def test_customer_confirmation_resumes_held_route(monkeypatch):
    async def completion(*_args, **_kwargs):
        return {
            "selected_route_id": "q2",
            "has_question": False,
            "answer": "",
            "source_ids": [],
            "knowledge_action": "continue_held_route",
            "topic": None,
            "confidence": 0.95,
            "reasoning": "Customer is ready to continue.",
        }

    monkeypatch.setattr("services.turn_orchestrator.llm_service.structured_completion", completion)
    result = asyncio.run(turn_orchestrator.process(
        user_text="Okay, go ahead.",
        current_node={"id": "q1", "data": {"speechPrompt": "May I confirm your details?"}},
        outgoing_branches=[{"id": "yes", "source": "q1", "target": "q2", "data": {"label": "Yes"}}],
        all_nodes=[{"id": "q1", "data": {}}, {"id": "q2", "data": {"label": "Usage discovery"}}],
        campaign_knowledge={"knowledgeItems": []},
        conversation_state={"pending_next_node_id": "q2", "knowledge_thread": {"status": "awaiting_customer_confirmation"}},
        conversation_history=[],
    ))

    assert result["next_node_id"] == "q2"
    assert result["conversation_state"] == {}


def test_approved_knowledge_requires_a_source():
    with pytest.raises(ValueError, match="requires both content and a source"):
        CampaignKnowledgePayload.model_validate({
            "knowledgeItems": [{
                "id": "price-sheet",
                "title": "Renewal price",
                "contentType": "product_offer",
                "tags": ["renewal", "billing"],
                "content": "Approved price",
                "source": "",
                "version": "1.0",
                "status": "approved",
            }]
        })


def test_campaign_and_call_state_are_tenant_scoped(tmp_path):
    store = CampaignStore(str(tmp_path / "campaigns.sqlite3"))
    store.save_campaign("tenant-a", "renewal", {"nodes": [{"id": "q1"}], "edges": [], "campaign_knowledge": {}})

    assert store.get_campaign("tenant-a", "renewal")["nodes"][0]["id"] == "q1"
    assert store.get_campaign("tenant-b", "renewal") is None

    store.save_call_state("tenant-a", "renewal", "call-1", {"pending_next_node_id": "q2"})
    assert store.get_call_state("tenant-a", "renewal", "call-1") == {"pending_next_node_id": "q2"}
    assert store.get_call_state("tenant-b", "renewal", "call-1") == {}


def test_repeat_question_increments_count(monkeypatch):
    async def completion(*_args, **_kwargs):
        return {
            "decision": "repeat",
            "selected_route_id": None,
            "has_question": False,
            "answer": "No problem! Let me repeat: Do you use the internet mainly for streaming?",
            "knowledge_action": "no_knowledge",
            "confidence": 0.95,
            "reasoning": "Customer asked to repeat the question.",
        }

    monkeypatch.setattr("services.turn_orchestrator.llm_service.structured_completion", completion)
    result = asyncio.run(turn_orchestrator.process(
        user_text="What did you say? Can you repeat?",
        current_node={"id": "q1", "data": {"speechPrompt": "Do you use the internet mainly for streaming?", "maxRepeats": 2}},
        outgoing_branches=[{"id": "yes", "source": "q1", "target": "q2", "data": {"label": "Yes"}}],
        all_nodes=[{"id": "q1", "data": {}}, {"id": "q2", "data": {}}],
        campaign_knowledge={"knowledgeItems": []},
        conversation_state={},
        conversation_history=[],
    ))

    assert result["next_node_id"] == "q1"
    assert result["intent_matched"] == "repeated_question"
    assert result["conversation_state"]["repeat_counts"]["q1"] == 1
    assert "streaming" in result["ai_response_text"]


def test_max_repeats_routes_to_fallback(monkeypatch):
    async def completion(*_args, **_kwargs):
        return {
            "decision": "repeat",
            "selected_route_id": None,
            "has_question": False,
            "answer": "",
            "knowledge_action": "no_knowledge",
            "confidence": 0.5,
            "reasoning": "Unclear answer.",
        }

    monkeypatch.setattr("services.turn_orchestrator.llm_service.structured_completion", completion)
    result = asyncio.run(turn_orchestrator.process(
        user_text="mumbled unhelpful sound",
        current_node={"id": "q1", "data": {"speechPrompt": "Confirm plan?", "maxRepeats": 2}},
        outgoing_branches=[
            {"id": "yes", "source": "q1", "target": "q2", "data": {"label": "Yes"}},
            {"id": "fallback", "source": "q1", "target": "hangup-node", "data": {"label": "Decline / Exit"}},
        ],
        all_nodes=[
            {"id": "q1", "data": {}},
            {"id": "q2", "data": {}},
            {"id": "hangup-node", "data": {"type": "hangup", "label": "Exit"}},
        ],
        campaign_knowledge={"knowledgeItems": []},
        # Node has already been repeated twice (maxRepeats: 2)
        conversation_state={"repeat_counts": {"q1": 2}},
        conversation_history=[],
    ))

    # Should route to fallback branch
    assert result["next_node_id"] == "hangup-node"
    assert result["intent_matched"] == "max_repeats_fallback"
    assert "repeat_counts" not in result["conversation_state"]


def test_variable_extraction_returned(monkeypatch):
    async def completion(*_args, **_kwargs):
        return {
            "decision": "transition",
            "selected_route_id": "q2",
            "has_question": False,
            "answer": "",
            "knowledge_action": "no_knowledge",
            "extracted_variable": {"name": "pain_score", "value": 7},
            "confidence": 0.98,
            "reasoning": "Customer indicated a pain level of 7.",
        }

    monkeypatch.setattr("services.turn_orchestrator.llm_service.structured_completion", completion)
    result = asyncio.run(turn_orchestrator.process(
        user_text="I'd say my pain is around a 7 today.",
        current_node={"id": "q1", "data": {"speechPrompt": "How is your pain from 1 to 10?", "variableToExtract": "pain_score"}},
        outgoing_branches=[{"id": "branch-severe", "source": "q1", "target": "q2", "data": {"label": "Severe (7+)"}}],
        all_nodes=[{"id": "q1", "data": {}}, {"id": "q2", "data": {}}],
        campaign_knowledge={"knowledgeItems": []},
        conversation_state={},
        conversation_history=[],
    ))

    assert result["next_node_id"] == "q2"
    assert result["extracted_variable"] == {"name": "pain_score", "value": 7}


def test_wrong_contact_intent_handling(monkeypatch):
    async def completion(*_args, **_kwargs):
        return {
            "decision": "transition",
            "caller_intent": "wrong_contact",
            "selected_route_id": "node-hangup-wrong-contact",
            "has_question": False,
            "answer": "Oh, apologies for the confusion! Thank you for letting me know. Have a wonderful day!",
            "knowledge_action": "no_knowledge",
            "extracted_variable": None,
            "confidence": 0.99,
            "reasoning": "Speaker explicitly stated he is the brother, not the lead.",
        }

    monkeypatch.setattr("services.turn_orchestrator.llm_service.structured_completion", completion)
    result = asyncio.run(turn_orchestrator.process(
        user_text="this isnt david miller. its his brother",
        current_node={"id": "node-greeting", "data": {"openingScript": "Hi David Miller, this is Maya..."}},
        outgoing_branches=[
            {"id": "e1", "source": "node-greeting", "target": "node-q2", "data": {"label": "Customer Available / Yes"}},
            {"id": "e2", "source": "node-greeting", "target": "node-hangup-wrong-contact", "data": {"label": "Wrong Person / Third Party / Not Available"}},
        ],
        all_nodes=[
            {"id": "node-greeting", "data": {}},
            {"id": "node-q2", "data": {}},
            {"id": "node-hangup-wrong-contact", "data": {"type": "hangup"}},
        ],
        campaign_knowledge={"knowledgeItems": []},
        conversation_state={},
        conversation_history=[],
    ))

    assert result["next_node_id"] == "node-hangup-wrong-contact"
    assert result["intent_matched"] == "wrong_contact"
    assert result["conversation_state"]["lead_name_suppressed"] is True
    assert "David Miller" not in result["ai_response_text"]
    assert "apologies" in result["ai_response_text"].lower()


def test_customer_satisfied_with_knowledge_reprompts_node_question(monkeypatch):
    async def completion(*_args, **_kwargs):
        return {
            "decision": "transition",
            "extracted_intent": "customer is satisfied with knowledge answer",
            "selected_route_id": None,
            "has_question": False,
            "answer": "Glad to clarify that! So coming back to your usage: Are you mainly browsing or streaming 4K video?",
            "knowledge_action": "ask_question_again",
            "extracted_variable": None,
            "confidence": 0.95,
            "reasoning": "Customer said 'okay I see', resolving the side question.",
        }

    monkeypatch.setattr("services.turn_orchestrator.llm_service.structured_completion", completion)
    result = asyncio.run(turn_orchestrator.process(
        user_text="Okay, I see.",
        current_node={"id": "node-q2", "data": {"speechPrompt": "Are you mainly browsing or streaming 4K video?"}},
        outgoing_branches=[
            {"id": "e1", "source": "node-q2", "target": "node-q3", "data": {"label": "Light"}},
            {"id": "e2", "source": "node-q2", "target": "node-q4", "data": {"label": "Heavy"}},
        ],
        all_nodes=[
            {"id": "node-q2", "data": {}},
            {"id": "node-q3", "data": {}},
            {"id": "node-q4", "data": {}},
        ],
        campaign_knowledge={"knowledgeItems": []},
        # Knowledge thread was open, but no route was held (pending_next_node_id is None)
        conversation_state={"knowledge_thread": {"topic": "router specs", "status": "awaiting_customer_confirmation"}},
        conversation_history=[],
    ))

    # Should stay on current node, clear knowledge thread, and reprompt with clarity
    assert result["next_node_id"] == "node-q2"
    assert result["intent_matched"] == "reprompt_after_knowledge"
    assert "knowledge_thread" not in result["conversation_state"]
    assert "streaming 4K video" in result["ai_response_text"]




