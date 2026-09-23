import asyncio
import pytest
from services.graph_generator_service import graph_generator_service


def test_generate_campaign_flow_structures_graph(monkeypatch):
    async def mock_completion(*_args, **_kwargs):
        return {
            "campaignName": "Fiber Upgrade 2026",
            "tagline": "Speed boost for residential clients",
            "category": "Telecom & ISP",
            "agentPersona": {
                "name": "Maya",
                "role": "Speed Advisor",
                "company": "Apex Fiber",
                "tone": "friendly_professional",
            },
            "leadProfile": {
                "name": "Jordan Smith",
                "company": "Home Account",
                "phone": "+1 (555) 123-4567",
            },
            "greetingScript": "Hi Jordan, this is Maya with Apex Fiber. Got a quick second?",
            "questionScript": "We have high-speed upgrades in your area. Want to check your eligibility?",
            "variableToExtract": "upgrade_interest",
            "scenarioBranches": [
                {"label": "Yes / Interested", "intentKey": "positive", "color": "#10b981", "desc": "Wants upgrade"},
                {"label": "Price Concern", "intentKey": "cost_concern", "color": "#f59e0b", "desc": "Worried about cost"},
                {"label": "Busy / Callback", "intentKey": "busy_reschedule", "color": "#3b82f6", "desc": "Call back later"},
                {"label": "Not Interested", "intentKey": "not_interested", "color": "#ef4444", "desc": "Decline"},
            ],
            "objectionTopic": "Price & Promo Rate",
            "rebuttalScript": "Totally get it! We locked in a 20% discount for existing subscribers.",
            "actionTitle": "Lock VIP Rate & Send Link",
            "actionType": "send_sms",
            "successClosing": "All set, Jordan! Link texted. Have a great day.",
            "callbackClosing": "No problem, texted you the link. Talk soon!",
            "optOutClosing": "Understood, removing your number now. Goodbye.",
        }

    monkeypatch.setattr("services.graph_generator_service.llm_service.structured_completion", mock_completion)

    result = asyncio.run(
        graph_generator_service.generate_campaign_flow(
            prompt="Offer fiber speed upgrade",
            campaign_context={
                "campaignName": "Fiber Upgrade 2026",
                "agentPersona": {"company": "Apex Fiber"},
            },
        )
    )

    assert result["name"] == "Fiber Upgrade 2026"
    assert len(result["nodes"]) == 9
    assert len(result["edges"]) == 9

    node_types = [n["type"] for n in result["nodes"]]
    assert "greeting" in node_types
    assert "question" in node_types
    assert "scenarioBranch" in node_types
    assert "knowledge" in node_types
    assert "action" in node_types
    assert "hangup" in node_types

    greeting_node = next(n for n in result["nodes"] if n["id"] == "node-greeting")
    assert "Maya" in greeting_node["data"]["openingScript"]
