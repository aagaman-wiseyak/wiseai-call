import { CampaignKnowledge } from '../types/flow';
import { getLayoutedElements } from './layout';
import { GeneratedCampaign, generateCampaignFromPrompt } from './promptGenerator';

const GENERATE_FLOW_URL = '/api/templates/generate-flow';
const LLM_PROXY_URL = '/api/llm';
const LLM_DIRECT_URL = 'https://dev-models.wiseai.wiseyak.com/v1/chat/completions';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/**
 * Execute completion via backend proxy (or fallback).
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
 * Request full decision tree synthesis from the backend Voice Campaign Architect.
 * Prompts, zero-hallucination rules, and graph synthesis live securely on the backend.
 */
export async function generateDecisionGraphWithLlm(
  userPrompt: string,
  campaignContext?: CampaignKnowledge,
): Promise<GeneratedCampaign> {
  const payload = {
    prompt: userPrompt,
    campaign_context: campaignContext,
  };

  try {
    const response = await fetch(GENERATE_FLOW_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Flow generation service responded with status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error || !data.nodes || !data.edges) {
      throw new Error(data.error || 'Backend did not return valid graph nodes and edges.');
    }

    // Apply visual auto-layout to nodes and edges returned from the backend
    const layouted = getLayoutedElements(data.nodes, data.edges, 'TB');

    return {
      id: data.id || `campaign-${Date.now()}`,
      name: data.name || data.knowledge?.campaignName || 'AI Generated Campaign',
      tagline: data.tagline || data.knowledge?.description || userPrompt,
      category: data.category || 'AI Voice Outreach',
      knowledge: data.knowledge,
      nodes: layouted.nodes,
      edges: layouted.edges,
    };
  } catch (err) {
    console.warn('Backend flow generation failed, falling back to local synthesizer:', err);
    // Offline / fallback generator
    return generateCampaignFromPrompt(userPrompt);
  }
}
