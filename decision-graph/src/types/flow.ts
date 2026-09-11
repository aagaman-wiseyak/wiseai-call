import { Node, Edge } from '@xyflow/react';

export type OutboundNodeType =
  | 'greeting'
  | 'question'
  | 'scenarioBranch'
  | 'knowledge'
  | 'action'
  | 'hangup';

export interface ExtractedVariable {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date';
  description: string;
}

export interface BranchCondition {
  id: string;
  label: string;
  description: string;
  intentKey: string;
  color?: string;
  targetHandle: string;
}

export interface NodeDataCommon {
  label: string;
  description?: string;
  isActive?: boolean;
  [key: string]: unknown;
}

export interface GreetingNodeData extends NodeDataCommon {
  openingScript: string;
  voiceStyle?: string;
  enableAmd?: boolean;
  voicemailScript?: string;
  gatekeeperHandling?: string;
}

export interface QuestionNodeData extends NodeDataCommon {
  speechPrompt: string;
  variableToExtract?: string;
  allowBargeIn: boolean;
  maxWaitSeconds: number;
  silencePrompt?: string;
}

export interface ScenarioBranchNodeData extends NodeDataCommon {
  evaluationCriteria: string;
  branches: BranchCondition[];
  fallbackNodeId?: string;
}

export interface KnowledgeNodeData extends NodeDataCommon {
  category?: string;
  objectionTopic: string;
  rebuttalScript: string;
  returnToPrevious: boolean;
  followUpPrompt?: string;
}

export interface ActionNodeData extends NodeDataCommon {
  actionType: 'calendar_booking' | 'send_sms' | 'crm_update' | 'live_transfer';
  actionConfig: {
    title?: string;
    details?: string;
    targetPhone?: string;
    crmTag?: string;
  };
}

export interface HangupNodeData extends NodeDataCommon {
  closingScript: string;
  disposition:
    | 'meeting_booked'
    | 'callback_scheduled'
    | 'information_sent'
    | 'disqualified_not_interested'
    | 'dnc_requested'
    | 'voicemail_left'
    | 'wrong_number';
  sendSummarySms: boolean;
}

export type OutboundNodeData =
  | ({ type: 'greeting' } & GreetingNodeData)
  | ({ type: 'question' } & QuestionNodeData)
  | ({ type: 'scenarioBranch' } & ScenarioBranchNodeData)
  | ({ type: 'knowledge' } & KnowledgeNodeData)
  | ({ type: 'action' } & ActionNodeData)
  | ({ type: 'hangup' } & HangupNodeData);

export type CustomFlowNode = Node<OutboundNodeData>;
export type CustomFlowEdge = Edge<{
  label?: string;
  intent?: string;
  isObjection?: boolean;
  isActive?: boolean;
}>;

export interface FAQItem {
  id: string;
  question: string;
  answer: string;
  keywords: string[];
}

export interface GlobalObjection {
  id: string;
  trigger: string;
  response: string;
  resumeFlow: boolean;
}

export type KnowledgeContentType =
  | 'product_offer'
  | 'policy'
  | 'process'
  | 'service'
  | 'troubleshooting'
  | 'compliance'
  | 'company_information'
  | 'escalation'
  | 'reference'
  | 'other';

export type KnowledgeItemStatus = 'draft' | 'approved' | 'archived';

/** A campaign-owned, auditable source of facts the agent may use. */
export interface KnowledgeItem {
  id: string;
  title: string;
  contentType: KnowledgeContentType;
  tags: string[];
  content: string;
  source: string;
  version: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  status: KnowledgeItemStatus;
}

export interface CampaignKnowledge {
  campaignId: string;
  campaignName: string;
  description: string;
  agentPersona: {
    name: string;
    role: string;
    company: string;
    tone: 'friendly_professional' | 'consultative' | 'empathetic' | 'authoritative';
    speakingRate: number; // 0.8 to 1.2
    voice: string;
  };
  leadProfile: {
    name: string;
    company: string;
    phone: string;
    email: string;
    attributes: Record<string, string>;
  };
  faqs: FAQItem[];
  globalObjections: GlobalObjection[];
  knowledgeItems: KnowledgeItem[];
  complianceNotice: string;
}

export interface SimulationMessage {
  id: string;
  speaker: 'agent' | 'lead' | 'system';
  text: string;
  timestamp: string;
  nodeId?: string;
  intentMatched?: string;
}

export interface CallSimulationState {
  status: 'idle' | 'ringing' | 'connected' | 'ended';
  activeNodeId: string | null;
  previousNodeId: string | null;
  transcript: SimulationMessage[];
  variables: Record<string, string | number | boolean>;
  disposition: string | null;
  callDurationSeconds: number;
  isAiSpeaking: boolean;
  audioTtsEnabled: boolean;
  activeEdgeId: string | null;
}
