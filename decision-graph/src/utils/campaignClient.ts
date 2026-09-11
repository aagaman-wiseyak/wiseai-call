import { CampaignKnowledge, CustomFlowEdge, CustomFlowNode } from '../types/flow';

const tenantId = import.meta.env.VITE_TENANT_ID as string | undefined;

export function getTenantId(): string {
  if (!tenantId?.trim()) {
    throw new Error('VITE_TENANT_ID is required before launching a persisted campaign.');
  }
  return tenantId;
}

export async function saveCampaign(
  knowledge: CampaignKnowledge,
  nodes: CustomFlowNode[],
  edges: CustomFlowEdge[],
): Promise<void> {
  const response = await fetch(`/api/campaigns/${encodeURIComponent(knowledge.campaignId)}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      'X-Tenant-ID': getTenantId(),
    },
    body: JSON.stringify({ campaign_knowledge: knowledge, nodes, edges }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`Campaign could not be saved (${response.status}): ${detail}`);
  }
}
