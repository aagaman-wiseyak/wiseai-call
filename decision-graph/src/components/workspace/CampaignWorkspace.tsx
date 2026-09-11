import React, { useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, FileText, Plus, Sparkles, Trash2 } from 'lucide-react';
import { CampaignKnowledge, KnowledgeItem, KnowledgeContentType } from '../../types/flow';
import { CampaignTemplate } from '../../templates/campaignTemplates';

type WorkspaceTab = 'overview' | 'knowledge';

interface CampaignWorkspaceProps {
  template: CampaignTemplate;
  knowledge: CampaignKnowledge;
  onUpdateKnowledge: (knowledge: CampaignKnowledge) => void;
  onBack: () => void;
  onOpenStudio: () => void;
  onGenerateDraft: () => Promise<void>;
}

const tabs: Array<{ id: WorkspaceTab; label: string; icon: React.ElementType }> = [
  { id: 'overview', label: 'Campaign overview', icon: FileText },
  { id: 'knowledge', label: 'Knowledge & rules', icon: BookOpen },
];

export const CampaignWorkspace: React.FC<CampaignWorkspaceProps> = ({
  template,
  knowledge,
  onUpdateKnowledge,
  onBack,
  onOpenStudio,
  onGenerateDraft,
}) => {
  const [activeTab, setActiveTab] = useState<WorkspaceTab>('overview');
  const [isGenerating, setIsGenerating] = useState(false);
  const approvedCount = (knowledge.knowledgeItems || []).filter((item) => item.status === 'approved').length;

  const addKnowledge = () => {
    const item: KnowledgeItem = {
      id: `knowledge-${Date.now()}`,
      title: 'Untitled campaign information',
      contentType: 'other',
      tags: [],
      content: '',
      source: '',
      version: '1.0',
      status: 'draft',
    };
    onUpdateKnowledge({ ...knowledge, knowledgeItems: [...(knowledge.knowledgeItems || []), item] });
  };

  const updateKnowledge = (id: string, fields: Partial<KnowledgeItem>) => {
    onUpdateKnowledge({
      ...knowledge,
      knowledgeItems: knowledge.knowledgeItems.map((item) => item.id === id ? { ...item, ...fields } : item),
    });
  };

  const removeKnowledge = (id: string) => {
    onUpdateKnowledge({ ...knowledge, knowledgeItems: knowledge.knowledgeItems.filter((item) => item.id !== id) });
  };

  const generateDraft = async () => {
    setIsGenerating(true);
    try {
      await onGenerateDraft();
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <main className="workspace-page">
      <header className="workspace-header">
        <button type="button" className="btn-clean-outline" onClick={onBack}><ArrowLeft size={14} /> Templates</button>
        <div className="workspace-title">
          <span className="workspace-eyebrow">CAMPAIGN SETUP</span>
          <h1>{knowledge.campaignName || template.name}</h1>
          <p>{knowledge.description || template.tagline}</p>
        </div>
        <button type="button" className="btn-clean-primary" onClick={onOpenStudio}>Open Decision Studio <ArrowRight size={14} /></button>
      </header>

      <div className="workspace-layout">
        <nav className="workspace-nav" aria-label="Campaign setup">
          {tabs.map(({ id, label, icon: Icon }) => (
            <button key={id} type="button" className={`workspace-nav-item ${activeTab === id ? 'active' : ''}`} onClick={() => setActiveTab(id)}>
              <Icon size={16} /> {label}
              {id === 'knowledge' && <span className={`workspace-status ${approvedCount ? 'ready' : ''}`}>{approvedCount ? `${approvedCount} approved` : 'Optional'}</span>}
            </button>
          ))}
        </nav>

        <section className="workspace-content">
          {activeTab === 'overview' && <>
            <span className="workspace-section-label">START HERE</span>
            <h2>What is this campaign for?</h2>
            <p className="workspace-lead">Set the campaign identity first. You can add business facts later, then refine the actual conversation only if needed.</p>
            <div className="workspace-fields">
              <label>Campaign name<input value={knowledge.campaignName} onChange={(e) => onUpdateKnowledge({ ...knowledge, campaignName: e.target.value })} /></label>
              <label>Purpose<textarea rows={3} value={knowledge.description} onChange={(e) => onUpdateKnowledge({ ...knowledge, description: e.target.value })} /></label>
              <label>Company represented<input value={knowledge.agentPersona.company} onChange={(e) => onUpdateKnowledge({ ...knowledge, agentPersona: { ...knowledge.agentPersona, company: e.target.value } })} /></label>
            </div>
            <div className="workspace-actions">
              <button type="button" className="btn-clean-primary" onClick={generateDraft} disabled={!knowledge.description.trim() || isGenerating}>
                <Sparkles size={14} /> {isGenerating ? 'Generating draft...' : 'Generate draft with AI'}
              </button>
              <button type="button" className="btn-clean-outline" onClick={onOpenStudio}>Use template flow <ArrowRight size={14} /></button>
            </div>
            <p className="workspace-note">AI creates a draft from this overview and any approved knowledge. You review every step in Decision Studio before using it.</p>
          </>}

          {activeTab === 'knowledge' && <>
            <div className="workspace-section-head">
              <div><span className="workspace-section-label">OPTIONAL</span><h2>Knowledge & rules</h2><p className="workspace-lead">Add approved facts for this campaign. The agent uses these only when a customer asks a question.</p></div>
              <button type="button" className="btn-clean-primary" onClick={addKnowledge}><Plus size={14} /> Add information</button>
            </div>
            {knowledge.knowledgeItems.length === 0 ? <div className="workspace-empty"><BookOpen size={24} /><h3>No campaign knowledge yet</h3><p>Your flow still works without it. If a customer asks a factual question, the agent will safely arrange follow-up instead of guessing.</p><button type="button" className="btn-clean-outline" onClick={addKnowledge}>Add approved information</button></div> : <div className="workspace-knowledge-list">
              {knowledge.knowledgeItems.map((item) => <article className="workspace-knowledge-card" key={item.id}>
                <div className="workspace-card-top"><input value={item.title} aria-label="Information title" onChange={(e) => updateKnowledge(item.id, { title: e.target.value })} /><button type="button" className="btn-icon-danger-sm" onClick={() => removeKnowledge(item.id)} aria-label="Remove information"><Trash2 size={14} /></button></div>
                <div className="workspace-inline-fields"><select value={item.contentType} onChange={(e) => updateKnowledge(item.id, { contentType: e.target.value as KnowledgeContentType })}><option value="product_offer">Product / offer</option><option value="policy">Policy</option><option value="process">Process / procedure</option><option value="service">Service / support</option><option value="troubleshooting">Troubleshooting</option><option value="compliance">Compliance / privacy</option><option value="company_information">Company information</option><option value="escalation">Escalation / handoff</option><option value="reference">Reference</option><option value="other">Other</option></select><select value={item.status} onChange={(e) => updateKnowledge(item.id, { status: e.target.value as KnowledgeItem['status'] })}><option value="draft">Draft</option><option value="approved">Approved for calls</option><option value="archived">Archived</option></select></div>
                <textarea rows={4} value={item.content} placeholder="Approved customer-facing facts and conditions" onChange={(e) => updateKnowledge(item.id, { content: e.target.value })} />
                <div className="workspace-inline-fields"><input value={item.tags.join(', ')} placeholder="Tags, e.g. renewal, billing, privacy" onChange={(e) => updateKnowledge(item.id, { tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} /><input value={item.source} placeholder="Source document" onChange={(e) => updateKnowledge(item.id, { source: e.target.value })} /><input value={item.version} placeholder="Version" onChange={(e) => updateKnowledge(item.id, { version: e.target.value })} /><input type="date" value={item.effectiveFrom || ''} aria-label="Effective from" onChange={(e) => updateKnowledge(item.id, { effectiveFrom: e.target.value || undefined })} /><input type="date" value={item.effectiveUntil || ''} aria-label="Effective until" onChange={(e) => updateKnowledge(item.id, { effectiveUntil: e.target.value || undefined })} /></div>
              </article>)}
            </div>}
          </>}

        </section>
      </div>
    </main>
  );
};
