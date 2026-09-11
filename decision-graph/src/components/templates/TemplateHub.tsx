import React, { useState } from 'react';
import { ArrowRight, Plus, Sparkles } from 'lucide-react';
import { CAMPAIGN_TEMPLATES, CampaignTemplate } from '../../templates/campaignTemplates';
import { generateCampaignFromPrompt } from '../../utils/promptGenerator';
import { generateDecisionGraphWithLlm } from '../../utils/llmClient';
import { WiseBrandLogo } from '../brand/WiseBrandLogo';

interface TemplateHubProps {
  onSelectCampaign: (template: CampaignTemplate) => void;
  onStartBlank: () => void;
}

export const TemplateHub: React.FC<TemplateHubProps> = ({
  onSelectCampaign,
  onStartBlank,
}) => {
  const [promptText, setPromptText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  const handlePromptSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!promptText.trim()) return;

    setIsGenerating(true);
    try {
      const generated = await generateDecisionGraphWithLlm(promptText);
      setIsGenerating(false);
      onSelectCampaign({
        id: generated.id,
        name: generated.name,
        tagline: generated.tagline,
        category: generated.category,
        knowledge: generated.knowledge,
        initialNodes: generated.nodes,
        initialEdges: generated.edges,
      });
    } catch (llmErr) {
      console.warn('LLM generator encountered error, using local synthesizer fallback:', llmErr);
      const generated = generateCampaignFromPrompt(promptText);
      setIsGenerating(false);
      onSelectCampaign({
        id: generated.id,
        name: generated.name,
        tagline: generated.tagline,
        category: generated.category,
        knowledge: generated.knowledge,
        initialNodes: generated.nodes,
        initialEdges: generated.edges,
      });
    }
  };

  return (
    <div className="template-hub-page">
      {/* Top Brand Header */}
      <header className="hub-header">
        <div className="hub-header-inner">
          <div className="hub-brand">
            <WiseBrandLogo size="md" />
          </div>
          <div className="hub-header-actions">
            <button className="btn-clean-primary" onClick={onStartBlank}>
              <Plus size={14} /> Blank Campaign
            </button>
          </div>
        </div>
      </header>

      <main className="hub-main-content">
        {/* Hero Section */}
        <section className="hub-hero">
          <h2 className="hero-headline">Campaign Templates</h2>
          <p className="hero-subtext">
            Generate a custom decision tree with AI or start from a pre-configured template.
          </p>

          {/* AI Prompt Generator Box */}
          <form className="prompt-generator-form" onSubmit={handlePromptSubmit}>
            <div className="prompt-input-wrapper">
              <input
                type="text"
                className="prompt-input"
                placeholder="Describe your outbound campaign objective (e.g., Customer renewal check-in)..."
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <button
                type="submit"
                className="btn-prompt-generate"
                disabled={!promptText.trim() || isGenerating}
              >
                {isGenerating ? (
                  <span>Generating...</span>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Generate Flow</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* Templates Grid Section */}
        <section className="templates-section">
          <div className="section-title-row">
            <div className="section-title-left">
              <h3 className="section-title">Pre-configured Templates</h3>
              <span className="section-count">{CAMPAIGN_TEMPLATES.length} available</span>
            </div>
            <button className="btn-clean-outline" onClick={onStartBlank}>
              <Plus size={13} /> Start from Blank Slate
            </button>
          </div>

          <div className="templates-grid">
            {CAMPAIGN_TEMPLATES.map((tpl) => (
              <div
                key={tpl.id}
                className="template-card"
                onClick={() => onSelectCampaign(tpl)}
              >
                <div className="card-top-row">
                  <span className="template-category-tag">{tpl.category}</span>
                  <span className="template-node-count">
                    {tpl.initialNodes.length} Nodes
                  </span>
                </div>

                <h4 className="template-name">{tpl.name}</h4>
                <p className="template-desc">{tpl.tagline}</p>

                <div className="template-meta-footer">
                  <div className="persona-info">
                    <span className="meta-label">Persona:</span>
                    <span className="meta-value">
                      {tpl.knowledge.agentPersona.name} ({tpl.knowledge.agentPersona.company})
                    </span>
                  </div>
                  <span className="btn-use-template">
                    Configure Flow <ArrowRight size={13} />
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
};
