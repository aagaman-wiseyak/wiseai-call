import { CampaignKnowledge, CustomFlowEdge, CustomFlowNode } from '../types/flow';

const tenantId = import.meta.env.VITE_TENANT_ID as string | undefined;

export function getTenantId(): string {
  if (tenantId?.trim()) return tenantId;
  // Local development has no authenticated tenant context yet. Keep this
  // isolated to Vite dev; deployed builds must receive identity from config.
  if (import.meta.env.DEV) return 'local-development';
  throw new Error('VITE_TENANT_ID is required before launching a persisted campaign.');
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
