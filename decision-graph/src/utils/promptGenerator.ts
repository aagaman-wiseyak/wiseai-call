import { CustomFlowNode, CustomFlowEdge, CampaignKnowledge } from '../types/flow';
import { getLayoutedElements } from './layout';

export interface GeneratedCampaign {
  id: string;
  name: string;
  tagline: string;
  category: string;
  knowledge: CampaignKnowledge;
  nodes: CustomFlowNode[];
  edges: CustomFlowEdge[];
}

export function generateCampaignFromPrompt(userPrompt: string): GeneratedCampaign {
  const promptLower = userPrompt.toLowerCase();
  const id = `campaign-${Date.now()}`;

  // Analyze domain
  let domain = 'Outbound Campaign';
  let agentName = 'Alex';
  let company = 'Apex Solutions';
  let leadName = 'Jordan Lee';
  let service = 'the scheduled consultation';

  if (promptLower.includes('dental') || promptLower.includes('dentist') || promptLower.includes('clinic')) {
    domain = 'Dental Care Follow-up';
    agentName = 'Claire';
    company = 'City Dental Specialists';
    leadName = 'Michael Green';
    service = 'bi-annual teeth cleaning & exam';
  } else if (promptLower.includes('insurance') || promptLower.includes('policy')) {
    domain = 'Insurance Renewal Outreach';
    agentName = 'David';
    company = 'Horizon Mutual';
    leadName = 'Sarah Jenkins';
    service = 'annual policy review';
  } else if (promptLower.includes('real estate') || promptLower.includes('property') || promptLower.includes('home')) {
    domain = 'Real Estate Seller Inquiry';
    agentName = 'Emma';
    company = 'Premier Properties';
    leadName = 'David Miller';
    service = 'home valuation report';
  } else if (promptLower.includes('saas') || promptLower.includes('software') || promptLower.includes('demo') || promptLower.includes('b2b')) {
    domain = 'B2B Software Demo Outreach';
    agentName = 'Marcus';
    company = 'CloudVibe Technologies';
    leadName = 'Samantha Reed';
    service = 'cloud workflow demonstration';
  }

  const campaignKnowledge: CampaignKnowledge = {
    campaignId: id,
    campaignName: `${domain} - AI Outreach`,
    description: `Automated outbound call flow generated from: "${userPrompt}"`,
    agentPersona: {
      name: agentName,
      role: 'Outreach Representative',
      company: company,
      tone: 'friendly_professional',
      speakingRate: 1.0,
      voice: 'en-US-Standard-C',
    },
    leadProfile: {
      name: leadName,
      company: 'Client Account',
      phone: '+1 (555) 234-5678',
      email: `${leadName.toLowerCase().replace(' ', '.')}@example.com`,
      attributes: {
        targetService: service,
      },
    },
    complianceNotice: 'This call is recorded for quality and training purposes.',
    globalObjections: [
      {
        id: 'obj-ai-check',
        trigger: 'Are you an AI or robot?',
        response: `I'm ${agentName}, an automated voice coordinator calling on behalf of ${company} to confirm your upcoming ${service}.`,
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
        id: 'faq-service',
        question: `How long does the ${service} take?`,
        answer: 'The appointment typically takes around 30 to 45 minutes.',
        keywords: ['how long', 'duration', 'time', 'length'],
      },
      {
        id: 'faq-location',
        question: 'Where are you located?',
        answer: 'Our main office is located downtown on 5th Avenue with complimentary parking available.',
        keywords: ['location', 'where', 'address', 'directions'],
      },
    ],
  };

  // Generate Nodes
  const rawNodes: CustomFlowNode[] = [
    {
      id: 'node-greeting',
      type: 'greeting',
      position: { x: 300, y: 50 },
      data: {
        type: 'greeting',
        label: 'Greeting & Contact Verification',
        openingScript: `Hello {{lead_name}}, this is ${agentName} calling from ${company} regarding your upcoming ${service}. Do you have a brief moment?`,
        voiceStyle: 'Professional & warm',
        enableAmd: true,
        voicemailScript: `Hello {{lead_name}}, this is ${agentName} from ${company}. Please give us a call back regarding your ${service}. Thank you!`,
      },
    },
    {
      id: 'node-vm-hangup',
      type: 'hangup',
      position: { x: 50, y: 260 },
      data: {
        type: 'hangup',
        label: 'Voicemail Left & Exit',
        closingScript: 'Leaving automated voicemail recording.',
        disposition: 'voicemail_left',
        sendSummarySms: true,
      },
    },
    {
      id: 'node-question-main',
      type: 'question',
      position: { x: 500, y: 260 },
      data: {
        type: 'question',
        label: 'Confirmation & Availability Check',
        speechPrompt: `Great! We have you slated for your ${service} next week. Does that time still work for your schedule, or would you prefer to explore alternative options?`,
        variableToExtract: 'schedule_status',
        allowBargeIn: true,
        maxWaitSeconds: 6,
      },
    },
    {
      id: 'node-scenario-router',
      type: 'scenarioBranch',
      position: { x: 500, y: 480 },
      data: {
        type: 'scenarioBranch',
        label: 'Response Scenario Router',
        evaluationCriteria: 'Classifies whether contact confirms, requests rescheduling, raises cost concern, or cancels',
        branches: [
          {
            id: 'b-confirm',
            label: 'Confirmed (Yes / Works for me)',
            description: 'Lead confirms appointment time',
            intentKey: 'confirm',
            color: '#10b981',
            targetHandle: 'h-confirm',
          },
          {
            id: 'b-reschedule',
            label: 'Reschedule (Need different day)',
            description: 'Lead needs another date or time',
            intentKey: 'reschedule',
            color: '#3b82f6',
            targetHandle: 'h-reschedule',
          },
          {
            id: 'b-cost',
            label: 'Cost / Pricing Concern',
            description: 'Lead asks about price or out-of-pocket costs',
            intentKey: 'cost_concern',
            color: '#f59e0b',
            targetHandle: 'h-cost',
          },
          {
            id: 'b-cancel',
            label: 'Cancel / Not Interested',
            description: 'Lead wants to cancel or opt out',
            intentKey: 'cancel',
            color: '#ef4444',
            targetHandle: 'h-cancel',
          },
        ],
      },
    },
    {
      id: 'node-rebuttal-cost',
      type: 'knowledge',
      position: { x: 100, y: 720 },
      data: {
        type: 'knowledge',
        label: 'Coverage & Price Clarification',
        objectionTopic: 'Appointment Cost & Coverage',
        rebuttalScript: `Most routine visits are covered at 100% under standard preventative care plans. We also provide transparent flat-rate pricing before any procedure. Does that help put your mind at ease?`,
        returnToPrevious: true,
      },
    },
    {
      id: 'node-action-confirm',
      type: 'action',
      position: { x: 450, y: 720 },
      data: {
        type: 'action',
        label: 'Lock Slot & Dispatch SMS',
        actionType: 'calendar_booking',
        actionConfig: {
          title: `Confirmed: ${service} for {{lead_name}}`,
          details: 'Calendar slot locked & SMS reminder queued',
          crmTag: 'appointment_confirmed',
        },
      },
    },
    {
      id: 'node-action-reschedule',
      type: 'action',
      position: { x: 800, y: 720 },
      data: {
        type: 'action',
        label: 'Send Reschedule Link via SMS',
        actionType: 'send_sms',
        actionConfig: {
          title: 'Rescheduling SMS Link Dispatched',
          details: 'Texted link to select alternative time slot',
          crmTag: 'reschedule_link_sent',
        },
      },
    },
    {
      id: 'node-hangup-success',
      type: 'hangup',
      position: { x: 450, y: 940 },
      data: {
        type: 'hangup',
        label: 'Confirmation Wrap-up',
        closingScript: `You're all confirmed, {{lead_name}}! We look forward to seeing you. Have a wonderful rest of your day!`,
        disposition: 'meeting_booked',
        sendSummarySms: true,
      },
    },
    {
      id: 'node-hangup-reschedule',
      type: 'hangup',
      position: { x: 800, y: 940 },
      data: {
        type: 'hangup',
        label: 'Reschedule SMS Sent & Close',
        closingScript: `I've sent a direct calendar link to {{phone}} so you can pick whatever time suits you best. Thanks and talk soon!`,
        disposition: 'callback_scheduled',
        sendSummarySms: true,
      },
    },
    {
      id: 'node-hangup-cancel',
      type: 'hangup',
      position: { x: 1150, y: 720 },
      data: {
        type: 'hangup',
        label: 'Cancellation & Opt-Out',
        closingScript: `I've noted that on your file and updated our records. Thank you for letting us know, and have a good day.`,
        disposition: 'disqualified_not_interested',
        sendSummarySms: false,
      },
    },
  ];

  const rawEdges: CustomFlowEdge[] = [
    {
      id: 'e-g-vm',
      source: 'node-greeting',
      sourceHandle: 'voicemail',
      target: 'node-vm-hangup',
      data: { label: 'Voicemail Detected' },
    },
    {
      id: 'e-g-human',
      source: 'node-greeting',
      sourceHandle: 'human',
      target: 'node-question-main',
      data: { label: 'Human Answered' },
    },
    {
      id: 'e-q-router',
      source: 'node-question-main',
      target: 'node-scenario-router',
      data: { label: 'Lead Responds' },
    },
    {
      id: 'e-r-confirm',
      source: 'node-scenario-router',
      sourceHandle: 'h-confirm',
      target: 'node-action-confirm',
      data: { label: 'Confirmed' },
    },
    {
      id: 'e-r-cost',
      source: 'node-scenario-router',
      sourceHandle: 'h-cost',
      target: 'node-rebuttal-cost',
      data: { label: 'Cost Concern', isObjection: true },
    },
    {
      id: 'e-rebuttal-confirm',
      source: 'node-rebuttal-cost',
      sourceHandle: 'rebuttal-accepted',
      target: 'node-action-confirm',
      data: { label: 'Reassurance Accepted' },
    },
    {
      id: 'e-r-resched',
      source: 'node-scenario-router',
      sourceHandle: 'h-reschedule',
      target: 'node-action-reschedule',
      data: { label: 'Needs Reschedule' },
    },
    {
      id: 'e-r-cancel',
      source: 'node-scenario-router',
      sourceHandle: 'h-cancel',
      target: 'node-hangup-cancel',
      data: { label: 'Cancelled' },
    },
    {
      id: 'e-act-conf-end',
      source: 'node-action-confirm',
      target: 'node-hangup-success',
      data: { label: 'Booking Complete' },
    },
    {
      id: 'e-act-resched-end',
      source: 'node-action-reschedule',
      target: 'node-hangup-reschedule',
      data: { label: 'SMS Delivered' },
    },
  ];

  // Auto-layout elements nicely
  const layouted = getLayoutedElements(rawNodes, rawEdges, 'TB');

  return {
    id,
    name: `${domain} Campaign`,
    tagline: `Prompt-generated: ${userPrompt.slice(0, 75)}...`,
    category: 'Custom Prompt Flow',
    knowledge: campaignKnowledge,
    nodes: layouted.nodes,
    edges: layouted.edges,
  };
}
