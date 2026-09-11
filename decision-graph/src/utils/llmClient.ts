import { CustomFlowNode, CustomFlowEdge, CampaignKnowledge } from '../types/flow';
import { getLayoutedElements } from './layout';
import { GeneratedCampaign } from './promptGenerator';

// Primary endpoint through Vite proxy to avoid browser CORS preflight restrictions,
// with direct URL fallback.
const LLM_PROXY_URL = '/api/llm';
const LLM_DIRECT_URL = 'https://dev-models.wiseai.wiseyak.com/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Execute LLM completion against WiseAI endpoint:
 * https://dev-models.wiseai.wiseyak.com/v1/chat/completions
 */
export async function callLlm(messages: ChatMessage[]): Promise<string> {
  const payload = {
    messages,
    stream: false,
    chat_template_kwargs: {
      enable_thinking: false,
    },
  };

  try {
    const response = await fetch(LLM_PROXY_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Proxy call failed with status: ${response.status}`);
    }

    const data = await response.json();
    return data.choices?.[0]?.message?.content || '';
  } catch (proxyErr) {
    console.warn('Proxy request failed, trying direct endpoint:', proxyErr);
    // Fallback to direct URL
    const fallbackResponse = await fetch(LLM_DIRECT_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!fallbackResponse.ok) {
      throw new Error(`LLM endpoint responded with status: ${fallbackResponse.status}`);
    }

    const data = await fallbackResponse.json();
    return data.choices?.[0]?.message?.content || '';
  }
}

/**
 * Use LLM to analyze user prompt and synthesize a complete outbound decision tree
 */
export async function generateDecisionGraphWithLlm(userPrompt: string): Promise<GeneratedCampaign> {
  const systemPrompt = `You are an expert Voice Campaign Architect.
Given a user's description of an outbound AI phone call campaign, generate a comprehensive structured outbound call decision tree.

The outbound call must NOT be a linear survey. It must include:
1. Greeting & AMD (Answering Machine Detection): opening statement and voicemail drop.
2. Discovery / Qualifying Question with variable to extract.
3. Scenario Router with multiple branches (Positive interest, Budget/cost objection, Timing/busy callback, Not interested / DNC).
4. Campaign Knowledge / Objection Rebuttal node with return-to-previous-flow logic.
5. Action node (Calendar booking, dispatch SMS, or live transfer).
6. Hangup nodes for success, voicemail, callback, and polite exit.

Output ONLY valid JSON inside a \`\`\`json markdown codeblock with this exact structure:
{
  "campaignName": "string",
  "tagline": "string",
  "category": "string",
  "agentPersona": {
    "name": "string",
    "role": "string",
    "company": "string",
    "tone": "consultative | friendly_professional | empathetic"
  },
  "leadProfile": {
    "name": "string",
    "company": "string",
    "phone": "+1 (555) 000-0000"
  },
  "greetingScript": "string with {{lead_name}} and {{company}}",
  "voicemailScript": "string",
  "questionScript": "string",
  "variableToExtract": "string (e.g. appointment_time, budget)",
  "scenarioBranches": [
    { "label": "Positive / Interested", "intentKey": "positive", "color": "#10b981", "desc": "string" },
    { "label": "Price / Budget Objection", "intentKey": "cost_concern", "color": "#f59e0b", "desc": "string" },
    { "label": "Busy / Callback", "intentKey": "busy_reschedule", "color": "#3b82f6", "desc": "string" },
    { "label": "Not Interested / DNC", "intentKey": "not_interested", "color": "#ef4444", "desc": "string" }
  ],
  "objectionTopic": "string",
  "rebuttalScript": "string",
  "actionTitle": "string",
  "actionType": "calendar_booking | send_sms | live_transfer",
  "successClosing": "string",
  "callbackClosing": "string",
  "optOutClosing": "string"
}`;

  const messages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: `Generate an outbound AI decision tree for this campaign: "${userPrompt}"` },
  ];

  const llmResponse = await callLlm(messages);

  // Extract JSON from markdown or raw text
  let parsed: any = null;
  const jsonMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)\s*```/);
  const jsonString = jsonMatch ? jsonMatch[1] : llmResponse;

  try {
    parsed = JSON.parse(jsonString);
  } catch (err) {
    console.error('Failed to parse LLM JSON response:', err, llmResponse);
    throw new Error('LLM response was not valid JSON');
  }

  const campaignId = `campaign-${Date.now()}`;
  const agentName = parsed.agentPersona?.name && !parsed.agentPersona.name.includes('{{') ? parsed.agentPersona.name : 'Sarah';
  const company = parsed.agentPersona?.company && !parsed.agentPersona.company.includes('{{') ? parsed.agentPersona.company : 'BrightCare Solutions';
  const leadName = parsed.leadProfile?.name && !parsed.leadProfile.name.includes('{{') ? parsed.leadProfile.name : 'Jordan Miller';

  const knowledge: CampaignKnowledge = {
    campaignId,
    campaignName: parsed.campaignName || `${userPrompt.slice(0, 32)} Campaign`,
    description: parsed.tagline || userPrompt,
    agentPersona: {
      name: agentName,
      role: parsed.agentPersona?.role || 'Patient Care Coordinator',
      company: company,
      tone: parsed.agentPersona?.tone || 'friendly_professional',
      speakingRate: 1.0,
      voice: 'en-US-Standard-C',
    },
    leadProfile: {
      name: leadName,
      company: parsed.leadProfile?.company && !parsed.leadProfile.company.includes('{{') ? parsed.leadProfile.company : 'Individual Account',
      phone: parsed.leadProfile?.phone && !parsed.leadProfile.phone.includes('{{') ? parsed.leadProfile.phone : '+1 (555) 382-9011',
      email: `${leadName.toLowerCase().replace(/\s+/g, '.')}@example.com`,
      attributes: {},
    },
    complianceNotice: 'This call is recorded for quality assurance.',
    globalObjections: [
      {
        id: 'obj-ai',
        trigger: 'Are you an AI or robot?',
        response: `I'm ${agentName}, an automated voice coordinator calling from ${company}.`,
        resumeFlow: true,
      },
      {
        id: 'obj-busy',
        trigger: 'I am busy right now',
        response: 'Completely understand! I will send over a quick text with a direct link so you can respond at your convenience.',
        resumeFlow: false,
      },
    ],
    faqs: [
      {
        id: 'faq-gen-1',
        question: 'What is this regarding?',
        answer: parsed.tagline || `Following up regarding ${company} services.`,
        keywords: ['what', 'why', 'regarding', 'who'],
      },
    ],
  };

  const rawBranches = parsed.scenarioBranches || [
    { label: 'Positive / Confirmed', intentKey: 'positive', color: '#10b981', desc: 'Accepts proposal' },
    { label: 'Objection / Price', intentKey: 'cost_concern', color: '#f59e0b', desc: 'Raises cost concern' },
    { label: 'Busy / Callback', intentKey: 'busy_reschedule', color: '#3b82f6', desc: 'Needs call back later' },
    { label: 'Not Interested', intentKey: 'not_interested', color: '#ef4444', desc: 'Politely rejects' },
  ];

  const formattedBranches = rawBranches.map((b: any, idx: number) => ({
    id: `branch-llm-${idx}`,
    label: b.label || `Scenario ${idx + 1}`,
    description: b.desc || '',
    intentKey: b.intentKey || 'custom',
    color: b.color || '#18181b',
    targetHandle: `handle-llm-${idx}`,
  }));

  const rawNodes: CustomFlowNode[] = [
    {
      id: 'node-greeting',
      type: 'greeting',
      position: { x: 300, y: 50 },
      data: {
        type: 'greeting',
        label: `${company} Greeting & AMD`,
        openingScript: parsed.greetingScript || `Hello {{lead_name}}, this is ${agentName} with ${company}.`,
        voiceStyle: 'Professional',
        enableAmd: true,
        voicemailScript: parsed.voicemailScript || `Hello {{lead_name}}, calling from ${company}. Please return our call.`,
      },
    },
    {
      id: 'node-vm-hangup',
      type: 'hangup',
      position: { x: 50, y: 280 },
      data: {
        type: 'hangup',
        label: 'Voicemail Left & Exit',
        closingScript: parsed.voicemailScript || 'Voicemail dropped and recorded.',
        disposition: 'voicemail_left',
        sendSummarySms: true,
      },
    },
    {
      id: 'node-question',
      type: 'question',
      position: { x: 550, y: 280 },
      data: {
        type: 'question',
        label: `Question: ${parsed.variableToExtract || 'Availability Check'}`,
        speechPrompt: parsed.questionScript || 'Does this sound like something you would like to schedule?',
        variableToExtract: parsed.variableToExtract || 'appointment_preference',
        allowBargeIn: true,
        maxWaitSeconds: 6,
      },
    },
    {
      id: 'node-router',
      type: 'scenarioBranch',
      position: { x: 550, y: 500 },
      data: {
        type: 'scenarioBranch',
        label: 'Lead Intent Router',
        evaluationCriteria: 'Classifies whether lead is interested, objects on cost, is busy, or opts out',
        branches: formattedBranches,
      },
    },
    {
      id: 'node-rebuttal',
      type: 'knowledge',
      position: { x: 150, y: 750 },
      data: {
        type: 'knowledge',
        label: `Rebuttal: ${parsed.objectionTopic || 'Price & Coverage'}`,
        objectionTopic: parsed.objectionTopic || 'Price / Cost Concern',
        rebuttalScript: parsed.rebuttalScript || 'Completely understand! We offer flexible coverage and zero-interest payment options.',
        returnToPrevious: true,
      },
    },
    {
      id: 'node-action-main',
      type: 'action',
      position: { x: 550, y: 750 },
      data: {
        type: 'action',
        label: parsed.actionTitle || 'Schedule & Lock Slot',
        actionType: parsed.actionType || 'calendar_booking',
        actionConfig: {
          title: parsed.actionTitle || 'Appointment Confirmation for {{lead_name}}',
          crmTag: 'lead_qualified_action_taken',
        },
      },
    },
    {
      id: 'node-action-callback',
      type: 'action',
      position: { x: 950, y: 750 },
      data: {
        type: 'action',
        label: 'Send Scheduling Link (SMS)',
        actionType: 'send_sms',
        actionConfig: {
          title: 'Direct SMS link sent to {{phone}}',
          crmTag: 'callback_requested_sms_sent',
        },
      },
    },
    {
      id: 'node-hangup-success',
      type: 'hangup',
      position: { x: 550, y: 980 },
      data: {
        type: 'hangup',
        label: 'Confirmed & Close',
        closingScript: parsed.successClosing || "You're all set, {{lead_name}}! Thanks for your time and have a wonderful day!",
        disposition: 'meeting_booked',
        sendSummarySms: true,
      },
    },
    {
      id: 'node-hangup-callback',
      type: 'hangup',
      position: { x: 950, y: 980 },
      data: {
        type: 'hangup',
        label: 'Callback Scheduled',
        closingScript: parsed.callbackClosing || 'Just texted you the link. Look forward to connecting soon!',
        disposition: 'callback_scheduled',
        sendSummarySms: true,
      },
    },
    {
      id: 'node-hangup-optout',
      type: 'hangup',
      position: { x: 1300, y: 750 },
      data: {
        type: 'hangup',
        label: 'Opt-Out Exit',
        closingScript: parsed.optOutClosing || 'Understood. I have removed your number from our contact list. Goodbye.',
        disposition: 'disqualified_not_interested',
        sendSummarySms: false,
      },
    },
  ];

  const rawEdges: CustomFlowEdge[] = [
    {
      id: 'edge-g-vm',
      source: 'node-greeting',
      sourceHandle: 'voicemail',
      target: 'node-vm-hangup',
      data: { label: 'Voicemail' },
    },
    {
      id: 'edge-g-human',
      source: 'node-greeting',
      sourceHandle: 'human',
      target: 'node-question',
      data: { label: 'Human Answered' },
    },
    {
      id: 'edge-q-router',
      source: 'node-question',
      target: 'node-router',
      data: { label: 'Lead Speaks' },
    },
    {
      id: 'edge-r-pos',
      source: 'node-router',
      sourceHandle: formattedBranches[0].targetHandle,
      target: 'node-action-main',
      data: { label: formattedBranches[0].label },
    },
    {
      id: 'edge-r-reb',
      source: 'node-router',
      sourceHandle: formattedBranches[1].targetHandle,
      target: 'node-rebuttal',
      data: { label: formattedBranches[1].label, isObjection: true },
    },
    {
      id: 'edge-reb-pos',
      source: 'node-rebuttal',
      sourceHandle: 'rebuttal-accepted',
      target: 'node-action-main',
      data: { label: 'Rebuttal Accepted' },
    },
    {
      id: 'edge-r-busy',
      source: 'node-router',
      sourceHandle: formattedBranches[2].targetHandle,
      target: 'node-action-callback',
      data: { label: formattedBranches[2].label },
    },
    {
      id: 'edge-r-dnc',
      source: 'node-router',
      sourceHandle: formattedBranches[3].targetHandle,
      target: 'node-hangup-optout',
      data: { label: formattedBranches[3].label },
    },
    {
      id: 'edge-act-end',
      source: 'node-action-main',
      target: 'node-hangup-success',
      data: { label: 'Action Complete' },
    },
    {
      id: 'edge-cb-end',
      source: 'node-action-callback',
      target: 'node-hangup-callback',
      data: { label: 'SMS Sent' },
    },
  ];

  const layouted = getLayoutedElements(rawNodes, rawEdges, 'TB');

  return {
    id: campaignId,
    name: parsed.campaignName || 'AI Generated Campaign',
    tagline: parsed.tagline || userPrompt,
    category: parsed.category || 'AI Voice Outreach',
    knowledge,
    nodes: layouted.nodes,
    edges: layouted.edges,
  };
}
