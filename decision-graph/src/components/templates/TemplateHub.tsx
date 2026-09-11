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

const SAMPLE_PROMPTS = [
  'Dental cleaning appointment reminder with rescheduling & whitening add-on',
  'Insurance annual policy renewal check-in with deductible savings',
  'Real estate seller outreach offering free home valuation report',
  'B2B cloud infrastructure demo qualification with budget objection rebuttal',
];

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
      // Call WiseAI LLM endpoint
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
            <span className="hub-header-badge">
              Outbound Voice Campaign Studio
            </span>
            <button className="btn-clean-primary" onClick={onStartBlank}>
              <Plus size={14} /> Create Blank Campaign
            </button>
          </div>
        </div>
      </header>

      <main className="hub-main-content">
        {/* Hero Section */}
        <section className="hub-hero">
          <h2 className="hero-headline">Create or generate your outbound call template</h2>
          <p className="hero-subtext">
            Prompt the AI to analyze your campaign and build the complete decision tree (greeting, qualifying questions, multiple branching paths, objection rebuttals, and actions) — then inspect and refine it live in the canvas.
          </p>

          {/* AI Prompt Generator Box */}
          <form className="prompt-generator-form" onSubmit={handlePromptSubmit}>
            <div className="prompt-input-wrapper">
              <input
                type="text"
                className="prompt-input"
                placeholder="Describe your outbound call goal (e.g. Dental cleaning appointment reminder with rescheduling)..."
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
              />
              <button
                type="submit"
                className="btn-prompt-generate"
                disabled={!promptText.trim() || isGenerating}
              >
                {isGenerating ? (
                  <span>Generating with WiseAI LLM...</span>
                ) : (
                  <>
                    <Sparkles size={14} />
                    <span>Generate Template & Open Canvas →</span>
                  </>
                )}
              </button>
            </div>

            {/* Prompt Suggestion Chips */}
            <div className="prompt-suggestions-row">
              <span className="suggestions-label">Try an example:</span>
              {SAMPLE_PROMPTS.map((p) => (
                <button
                  key={p}
                  type="button"
                  className="suggestion-chip"
                  onClick={() => setPromptText(p)}
                >
                  {p}
                </button>
              ))}
            </div>
          </form>
        </section>

        {/* Templates Grid Section */}
        <section className="templates-section">
          <div className="section-title-row">
            <h3 className="section-title">Pre-configured Call Templates</h3>
            <span className="section-count">{CAMPAIGN_TEMPLATES.length} templates available</span>
          </div>

          <div className="templates-grid">
            {/* Blank Canvas Card */}
            <div className="template-card blank-card" onClick={onStartBlank}>
              <div className="blank-card-inner">
                <div className="blank-icon-circle">
                  <Plus size={20} />
                </div>
                <h4 className="template-name">Start from Blank Slate</h4>
                <p className="template-desc">
                  Design your own custom outbound greetings, questions, and routing branches from scratch.
                </p>
                <span className="btn-use-template">
                  Start Blank <ArrowRight size={13} />
                </span>
              </div>
            </div>

            {/* Existing Curated Templates */}
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
                    <span className="meta-value">{tpl.knowledge.agentPersona.name} ({tpl.knowledge.agentPersona.company})</span>
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
