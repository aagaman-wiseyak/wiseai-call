import React, { useState } from 'react';
import {
  X,
  User,
  ShieldAlert,
  HelpCircle,
  FileText,
  Plus,
  Trash2,
  Check,
} from 'lucide-react';
import { CampaignKnowledge, FAQItem, GlobalObjection } from '../../types/flow';

interface CampaignKnowledgeModalProps {
  isOpen: boolean;
  onClose: () => void;
  knowledge: CampaignKnowledge;
  onSaveKnowledge: (updated: CampaignKnowledge) => void;
}

export const CampaignKnowledgeModal: React.FC<CampaignKnowledgeModalProps> = ({
  isOpen,
  onClose,
  knowledge,
  onSaveKnowledge,
}) => {
  const [activeTab, setActiveTab] = useState<'persona' | 'lead' | 'objections' | 'faqs' | 'compliance'>('persona');
  const [formData, setFormData] = useState<CampaignKnowledge>(knowledge);
  const [savedNotice, setSavedNotice] = useState(false);

  if (!isOpen) return null;

  const handleSave = () => {
    onSaveKnowledge(formData);
    setSavedNotice(true);
    setTimeout(() => {
      setSavedNotice(false);
      onClose();
    }, 600);
  };

  const addFaq = () => {
    const newFaq: FAQItem = {
      id: `faq-${Date.now()}`,
      question: 'New Question',
      answer: 'Spoken answer for outbound caller',
      keywords: ['keyword1'],
    };
    setFormData({
      ...formData,
      faqs: [...formData.faqs, newFaq],
    });
  };

  const removeFaq = (id: string) => {
    setFormData({
      ...formData,
      faqs: formData.faqs.filter((f) => f.id !== id),
    });
  };

  const addObjection = () => {
    const newObj: GlobalObjection = {
      id: `obj-${Date.now()}`,
      trigger: 'Objection phrase trigger',
      response: 'Agent rebuttal response',
      resumeFlow: true,
    };
    setFormData({
      ...formData,
      globalObjections: [...formData.globalObjections, newObj],
    });
  };

  const removeObjection = (id: string) => {
    setFormData({
      ...formData,
      globalObjections: formData.globalObjections.filter((o) => o.id !== id),
    });
  };

  return (
    <div className="modal-overlay">
      <div className="modal-dialog large-modal">
        <div className="modal-header">
          <div className="modal-title-wrap">
            <span className="badge-primary">CAMPAIGN CONTEXT</span>
            <h2>Campaign-Specific Knowledge Base</h2>
          </div>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>

        {/* Modal Navigation Tabs */}
        <div className="modal-tabs">
          <button
            className={`tab-btn ${activeTab === 'persona' ? 'active' : ''}`}
            onClick={() => setActiveTab('persona')}
          >
            <User size={15} /> Agent Persona
          </button>
          <button
            className={`tab-btn ${activeTab === 'lead' ? 'active' : ''}`}
            onClick={() => setActiveTab('lead')}
          >
            <FileText size={15} /> Lead Variables
          </button>
          <button
            className={`tab-btn ${activeTab === 'objections' ? 'active' : ''}`}
            onClick={() => setActiveTab('objections')}
          >
            <ShieldAlert size={15} /> Global Objections ({formData.globalObjections.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'faqs' ? 'active' : ''}`}
            onClick={() => setActiveTab('faqs')}
          >
            <HelpCircle size={15} /> Campaign FAQs ({formData.faqs.length})
          </button>
          <button
            className={`tab-btn ${activeTab === 'compliance' ? 'active' : ''}`}
            onClick={() => setActiveTab('compliance')}
          >
            Compliance & Disclaimers
          </button>
        </div>

        <div className="modal-content">
          {/* TAB 1: PERSONA */}
          {activeTab === 'persona' && (
            <div className="tab-pane">
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Agent Spoken Name</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.agentPersona.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        agentPersona: { ...formData.agentPersona, name: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Title / Role</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.agentPersona.role}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        agentPersona: { ...formData.agentPersona, role: e.target.value },
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">Company Represented</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.agentPersona.company}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        agentPersona: { ...formData.agentPersona, company: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Conversational Tone</label>
                  <select
                    className="form-select"
                    value={formData.agentPersona.tone}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        agentPersona: {
                          ...formData.agentPersona,
                          tone: e.target.value as any,
                        },
                      })
                    }
                  >
                    <option value="consultative">Consultative & Solution-focused</option>
                    <option value="friendly_professional">Friendly & Professional</option>
                    <option value="empathetic">Empathetic & Caring (Healthcare/Support)</option>
                    <option value="authoritative">Authoritative & Urgent</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: LEAD ATTRIBUTES */}
          {activeTab === 'lead' && (
            <div className="tab-pane">
              <p className="tab-desc">
                These dynamic variables can be injected into any prompt script using <code>&#123;&#123;variable_name&#125;&#125;</code> notation.
              </p>
              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">&#123;&#123;lead_name&#125;&#125;</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.leadProfile.name}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadProfile: { ...formData.leadProfile, name: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">&#123;&#123;company&#125;&#125;</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.leadProfile.company}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadProfile: { ...formData.leadProfile, company: e.target.value },
                      })
                    }
                  />
                </div>
              </div>

              <div className="form-grid-2">
                <div className="form-group">
                  <label className="form-label">&#123;&#123;phone&#125;&#125;</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.leadProfile.phone}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadProfile: { ...formData.leadProfile, phone: e.target.value },
                      })
                    }
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">&#123;&#123;email&#125;&#125;</label>
                  <input
                    type="text"
                    className="form-input"
                    value={formData.leadProfile.email}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        leadProfile: { ...formData.leadProfile, email: e.target.value },
                      })
                    }
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: GLOBAL OBJECTIONS */}
          {activeTab === 'objections' && (
            <div className="tab-pane">
              <div className="tab-action-bar">
                <p className="tab-desc">
                  Global objections are active across <em>any</em> node during the outbound call (e.g. "Are you an AI?", "Where did you get my number?").
                </p>
                <button className="btn-secondary btn-sm" onClick={addObjection}>
                  <Plus size={14} /> Add Global Objection
                </button>
              </div>

              <div className="list-items-container">
                {formData.globalObjections.map((obj, idx) => (
                  <div key={obj.id} className="knowledge-item-card">
                    <div className="item-card-header">
                      <span className="card-number-badge">#{idx + 1}</span>
                      <input
                        type="text"
                        className="form-input form-input-sm item-trigger-input"
                        placeholder="Trigger phrase (e.g. Are you an AI?)"
                        value={obj.trigger}
                        onChange={(e) => {
                          const updated = [...formData.globalObjections];
                          updated[idx].trigger = e.target.value;
                          setFormData({ ...formData, globalObjections: updated });
                        }}
                      />
                      <button
                        className="btn-icon text-muted"
                        onClick={() => removeObjection(obj.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="form-group mt-2">
                      <textarea
                        className="form-textarea form-textarea-sm"
                        rows={2}
                        placeholder="Agent spoken response..."
                        value={obj.response}
                        onChange={(e) => {
                          const updated = [...formData.globalObjections];
                          updated[idx].response = e.target.value;
                          setFormData({ ...formData, globalObjections: updated });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 4: FAQS */}
          {activeTab === 'faqs' && (
            <div className="tab-pane">
              <div className="tab-action-bar">
                <p className="tab-desc">
                  Campaign FAQ answers to handle off-script questions without derailing the outbound goal.
                </p>
                <button className="btn-secondary btn-sm" onClick={addFaq}>
                  <Plus size={14} /> Add FAQ Item
                </button>
              </div>

              <div className="list-items-container">
                {formData.faqs.map((faq, idx) => (
                  <div key={faq.id} className="knowledge-item-card">
                    <div className="item-card-header">
                      <span className="card-number-badge">#{idx + 1}</span>
                      <input
                        type="text"
                        className="form-input form-input-sm item-trigger-input"
                        placeholder="Prospect question (e.g. How much does it cost?)"
                        value={faq.question}
                        onChange={(e) => {
                          const updated = [...formData.faqs];
                          updated[idx].question = e.target.value;
                          setFormData({ ...formData, faqs: updated });
                        }}
                      />
                      <button
                        className="btn-icon text-muted"
                        onClick={() => removeFaq(faq.id)}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>

                    <div className="form-group mt-2">
                      <textarea
                        className="form-textarea form-textarea-sm"
                        rows={2}
                        placeholder="Agent answer..."
                        value={faq.answer}
                        onChange={(e) => {
                          const updated = [...formData.faqs];
                          updated[idx].answer = e.target.value;
                          setFormData({ ...formData, faqs: updated });
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB 5: COMPLIANCE */}
          {activeTab === 'compliance' && (
            <div className="tab-pane">
              <div className="form-group">
                <label className="form-label">Call Recording & TCPA Disclaimer</label>
                <textarea
                  className="form-textarea"
                  rows={4}
                  value={formData.complianceNotice}
                  onChange={(e) =>
                    setFormData({ ...formData, complianceNotice: e.target.value })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button className="btn-primary" onClick={handleSave}>
            {savedNotice ? (
              <>
                <Check size={16} /> Saved!
              </>
            ) : (
              'Save Campaign Knowledge'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
