import React, { useState } from 'react';
import {
  CustomFlowNode,
  CustomFlowEdge,
  OutboundNodeData,
  OutboundNodeType,
  CampaignKnowledge,
  BranchCondition,
  KnowledgeItem,
  KnowledgeContentType,
} from '../../types/flow';
import {
  Sliders,
  Sparkles,
  Plus,
  Trash2,
  ListOrdered,
  BookOpen,
  GitFork,
  ArrowRight,
  Phone,
  HelpCircle,
  ShieldAlert,
  Zap,
  PhoneOff,
} from 'lucide-react';

interface RightSetupPanelProps {
  nodes: CustomFlowNode[];
  edges: CustomFlowEdge[];
  selectedNode: CustomFlowNode | null;
  knowledge: CampaignKnowledge;
  onSelectNode: (nodeId: string) => void;
  onUpdateNodeData: (nodeId: string, updatedFields: Partial<OutboundNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  onAddBranchConnection: (sourceNodeId: string, label: string, targetNodeId: string, isObjection?: boolean) => void;
  onQuickCreateAndConnect: (sourceNodeId: string, branchLabel: string, targetNodeType: OutboundNodeType, isObjection?: boolean) => void;
  onUpdateEdgeTarget: (edgeId: string, newTargetId: string) => void;
  onUpdateEdgeLabel: (edgeId: string, newLabel: string) => void;
  onDeleteEdge: (edgeId: string) => void;
  onUpdateKnowledge: (updated: CampaignKnowledge) => void;
  onPromptRefine: (prompt: string) => void;
}

const renderTypePill = (type: OutboundNodeType) => {
  switch (type) {
    case 'greeting':
      return (
        <span className="step-type-pill greeting">
          <Phone size={10} /> Greeting
        </span>
      );
    case 'question':
      return (
        <span className="step-type-pill question">
          <HelpCircle size={10} /> Question
        </span>
      );
    case 'scenarioBranch':
      return (
        <span className="step-type-pill scenarioBranch">
          <GitFork size={10} /> Response check
        </span>
      );
    case 'knowledge':
      return (
        <span className="step-type-pill knowledge">
          <ShieldAlert size={10} /> Answer concern
        </span>
      );
    case 'action':
      return (
        <span className="step-type-pill action">
          <Zap size={10} /> Complete task
        </span>
      );
    case 'hangup':
      return (
        <span className="step-type-pill hangup">
          <PhoneOff size={10} /> End call
        </span>
      );
    default:
      return <span className="step-type-pill">{type}</span>;
  }
};

const stepTypeName = (type: OutboundNodeType) => ({
  greeting: 'opening',
  question: 'question',
  scenarioBranch: 'response check',
  knowledge: 'answer concern',
  action: 'complete task',
  hangup: 'end call',
}[type]);

export const RightSetupPanel: React.FC<RightSetupPanelProps> = ({
  nodes,
  edges,
  selectedNode,
  knowledge,
  onSelectNode,
  onUpdateNodeData,
  onDeleteNode,
  onAddBranchConnection,
  onQuickCreateAndConnect,
  onUpdateEdgeTarget,
  onUpdateEdgeLabel,
  onDeleteEdge,
  onUpdateKnowledge,
  onPromptRefine,
}) => {
  const [activeTab, setActiveTab] = useState<'flow' | 'node' | 'knowledge'>('flow');
  const [refinePrompt, setRefinePrompt] = useState('');
  const [customBranchText, setCustomBranchText] = useState('');
  const [customBranchTarget, setCustomBranchTarget] = useState('');
  const [isAddingCustomPath, setIsAddingCustomPath] = useState(false);

  const outgoingEdges = selectedNode ? edges.filter((e) => e.source === selectedNode.id) : [];
  const otherNodes = selectedNode ? nodes.filter((n) => n.id !== selectedNode.id) : [];

  // Node editing helpers
  const handleBranchChange = (branchId: string, field: keyof BranchCondition, val: string) => {
    if (!selectedNode || selectedNode.data.type !== 'scenarioBranch') return;
    const branches = [...((selectedNode.data as any).branches || [])];
    const idx = branches.findIndex((b) => b.id === branchId);
    if (idx !== -1) {
      branches[idx] = { ...branches[idx], [field]: val };
      onUpdateNodeData(selectedNode.id, { branches } as any);
    }
  };

  const addBranchToSelected = () => {
    if (!selectedNode || selectedNode.data.type !== 'scenarioBranch') return;
    const branches = [...((selectedNode.data as any).branches || [])];
    const newId = `branch-${Date.now()}`;
    branches.push({
      id: newId,
      label: 'New Scenario Path',
      description: 'Triggered upon customer condition',
      intentKey: 'custom_path',
      color: '#18181b',
      targetHandle: `handle-${newId}`,
    });
    onUpdateNodeData(selectedNode.id, { branches } as any);
  };

  const removeBranchFromSelected = (branchId: string) => {
    if (!selectedNode || selectedNode.data.type !== 'scenarioBranch') return;
    const branches = ((selectedNode.data as any).branches || []).filter(
      (b: BranchCondition) => b.id !== branchId
    );
    onUpdateNodeData(selectedNode.id, { branches } as any);
  };

  const handleRefineSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!refinePrompt.trim()) return;
    onPromptRefine(refinePrompt);
    setRefinePrompt('');
  };

  const addKnowledgeItem = () => {
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

  const updateKnowledgeItem = (id: string, fields: Partial<KnowledgeItem>) => {
    onUpdateKnowledge({
      ...knowledge,
      knowledgeItems: (knowledge.knowledgeItems || []).map((item) =>
        item.id === id ? { ...item, ...fields } : item
      ),
    });
  };

  const removeKnowledgeItem = (id: string) => {
    onUpdateKnowledge({
      ...knowledge,
      knowledgeItems: (knowledge.knowledgeItems || []).filter((item) => item.id !== id),
    });
  };

  return (
    <aside className="right-setup-panel">
      {/* Tab Navigation */}
      <div className="panel-tab-bar">
        <button
          className={`panel-tab ${activeTab === 'flow' ? 'active' : ''}`}
          onClick={() => setActiveTab('flow')}
        >
          <ListOrdered size={14} />
          <span>Flow Steps ({nodes.length})</span>
        </button>
        <button
          className={`panel-tab ${activeTab === 'node' ? 'active' : ''}`}
          onClick={() => setActiveTab('node')}
        >
          <Sliders size={14} />
          <span>{selectedNode ? selectedNode.data.label : 'Node Inspector'}</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="panel-scroll-content">
        {/* TAB 1: STEP-BY-STEP FLOW LIST */}
        {activeTab === 'flow' && (
          <div className="flow-steps-view">
            <div className="view-intro">
              <span className="view-title">Conversation steps</span>
              <p className="view-desc">
                Select a step to adjust what the agent says and where customer responses should go.
              </p>
            </div>

            <div className="step-cards-list">
              {nodes.map((n, index) => {
                const isSelected = selectedNode?.id === n.id;
                const nodeData = n.data as any;

                return (
                  <div
                    key={n.id}
                    className={`step-card ${isSelected ? 'selected' : ''}`}
                    onClick={() => {
                      onSelectNode(n.id);
                      setActiveTab('node');
                    }}
                  >
                    <div className="step-card-header">
                      <span className="step-num">Step {index + 1}</span>
                      {renderTypePill(n.data.type)}
                    </div>

                    <h4 className="step-title">{n.data.label}</h4>

                    {/* Quick Script Preview */}
                    {nodeData.openingScript && (
                      <p className="step-preview-text">"{nodeData.openingScript}"</p>
                    )}
                    {nodeData.speechPrompt && (
                      <p className="step-preview-text">"{nodeData.speechPrompt}"</p>
                    )}
                    {nodeData.rebuttalScript && (
                      <p className="step-preview-text">"{nodeData.rebuttalScript}"</p>
                    )}
                    {nodeData.closingScript && (
                      <p className="step-preview-text">"{nodeData.closingScript}"</p>
                    )}
                    {nodeData.actionConfig?.title && (
                      <p className="step-preview-text">Action: {nodeData.actionConfig.title}</p>
                    )}
                    {nodeData.branches && (
                      <div className="step-branches-summary">
                        {nodeData.branches.map((b: BranchCondition) => (
                          <span key={b.id} className="mini-branch-tag">
                            {b.label}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* TAB 2: NODE INSPECTOR */}
        {activeTab === 'node' && (
          <div className="node-inspector-view">
            {selectedNode ? (
              <div className="inspector-content">
                <div className="inspector-head">
                  <div className="inspector-head-title-wrap">
                    <span className="inspector-type">{stepTypeName(selectedNode.data.type)} step</span>
                    <h3 className="inspector-title">{selectedNode.data.label}</h3>
                  </div>
                  <button
                    type="button"
                    className="btn-delete-node"
                    onClick={() => onDeleteNode(selectedNode.id)}
                    title="Delete node"
                  >
                    <Trash2 size={13} />
                    <span>Delete</span>
                  </button>
                </div>

                {/* Title Input */}
                <div className="clean-field-group">
                  <label className="clean-label">Node Title</label>
                  <input
                    type="text"
                    className="clean-input"
                    value={selectedNode.data.label || ''}
                    onChange={(e) =>
                      onUpdateNodeData(selectedNode.id, { label: e.target.value } as any)
                    }
                  />
                </div>

                {/* GREETING NODE FIELDS */}
                {selectedNode.data.type === 'greeting' && (
                  <div className="clean-field-group">
                    <label className="clean-label">Opening Speech Script</label>
                    <textarea
                      className="clean-textarea"
                      rows={4}
                      value={(selectedNode.data as any).openingScript || ''}
                      onChange={(e) =>
                        onUpdateNodeData(selectedNode.id, { openingScript: e.target.value } as any)
                      }
                    />
                  </div>
                )}

                {/* QUESTION NODE FIELDS */}
                {selectedNode.data.type === 'question' && (
                  <>
                    <div className="clean-field-group">
                      <label className="clean-label">AI Speech Prompt</label>
                      <textarea
                        className="clean-textarea"
                        rows={4}
                        value={(selectedNode.data as any).speechPrompt || ''}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, { speechPrompt: e.target.value } as any)
                        }
                      />
                    </div>

                    <div className="clean-field-group">
                      <label className="clean-label">Variable to Extract</label>
                      <input
                        type="text"
                        className="clean-input"
                        placeholder="e.g. appointment_date, budget_range"
                        value={(selectedNode.data as any).variableToExtract || ''}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, { variableToExtract: e.target.value } as any)
                        }
                      />
                    </div>

                    <div className="clean-field-group">
                      <label className="clean-label">
                        Max Question Repeats / Retries
                        <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal', marginLeft: '6px' }}>
                          (unclear answers or repeat requests)
                        </span>
                      </label>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          min={1}
                          max={5}
                          className="clean-input"
                          style={{ width: '90px' }}
                          value={(selectedNode.data as any).maxRepeats ?? 2}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            onUpdateNodeData(selectedNode.id, {
                              maxRepeats: isNaN(val) ? 2 : Math.max(1, Math.min(5, val)),
                            } as any);
                          }}
                        />
                        <span style={{ fontSize: '12px', color: '#64748b' }}>
                          times before escalating/fallback (default: 2)
                        </span>
                      </div>
                    </div>

                    <div className="clean-checkbox-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={(selectedNode.data as any).allowBargeIn || false}
                          onChange={(e) =>
                            onUpdateNodeData(selectedNode.id, { allowBargeIn: e.target.checked } as any)
                          }
                        />
                        Allow Barge-In (prospect can speak without waiting for AI to finish)
                      </label>
                    </div>
                  </>
                )}

                {/* SCENARIO BRANCH NODE FIELDS */}
                {selectedNode.data.type === 'scenarioBranch' && (
                  <>
                    <div className="clean-field-group">
                      <label className="clean-label">How should the response be recognized?</label>
                      <input
                        type="text"
                        className="clean-input"
                        value={(selectedNode.data as any).evaluationCriteria || ''}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, { evaluationCriteria: e.target.value } as any)
                        }
                      />
                    </div>

                    <div className="branches-section">
                      <div className="section-head-inline">
                        <label className="clean-label">Customer response options</label>
                        <button className="btn-clean-secondary btn-sm" onClick={addBranchToSelected}>
                          <Plus size={12} /> Add Scenario
                        </button>
                      </div>

                      {((selectedNode.data as any).branches || []).map((b: BranchCondition) => (
                        <div key={b.id} className="clean-branch-editor">
                          <div className="branch-top-row">
                            <input
                              type="text"
                              className="clean-input clean-input-sm"
                              value={b.label}
                              onChange={(e) => handleBranchChange(b.id, 'label', e.target.value)}
                              placeholder="Path label (e.g. Yes / Confirmed)"
                            />
                            <button
                              className="btn-icon text-muted"
                              onClick={() => removeBranchFromSelected(b.id)}
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                          <input
                            type="text"
                            className="clean-input clean-input-sm mt-1"
                            value={b.description}
                            onChange={(e) => handleBranchChange(b.id, 'description', e.target.value)}
                            placeholder="Condition description"
                          />
                        </div>
                      ))}
                    </div>
                  </>
                )}

                {/* KNOWLEDGE NODE FIELDS */}
                {selectedNode.data.type === 'knowledge' && (
                  <>
                    <div className="clean-field-group">
                      <label className="clean-label">Customer concern or question</label>
                      <input
                        type="text"
                        className="clean-input"
                        value={(selectedNode.data as any).objectionTopic || ''}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, { objectionTopic: e.target.value } as any)
                        }
                      />
                    </div>

                    <div className="clean-field-group">
                      <label className="clean-label">Suggested answer</label>
                      <textarea
                        className="clean-textarea"
                        rows={4}
                        value={(selectedNode.data as any).rebuttalScript || ''}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, { rebuttalScript: e.target.value } as any)
                        }
                      />
                    </div>

                    <div className="clean-checkbox-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={(selectedNode.data as any).returnToPrevious || false}
                          onChange={(e) =>
                            onUpdateNodeData(selectedNode.id, { returnToPrevious: e.target.checked } as any)
                          }
                        />
                        Continue the conversation after answering
                      </label>
                    </div>
                  </>
                )}

                {/* ACTION NODE FIELDS */}
                {selectedNode.data.type === 'action' && (
                  <>
                    <div className="clean-field-group">
                      <label className="clean-label">Action Type</label>
                      <select
                        className="clean-select"
                        value={(selectedNode.data as any).actionType || 'calendar_booking'}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, { actionType: e.target.value } as any)
                        }
                      >
                        <option value="calendar_booking">Calendar Booking</option>
                        <option value="send_sms">Dispatch SMS Confirmation</option>
                        <option value="live_transfer">Live Agent Transfer</option>
                        <option value="crm_update">CRM Lead Tagging</option>
                      </select>
                    </div>

                    <div className="clean-field-group">
                      <label className="clean-label">Action Payload / Description</label>
                      <input
                        type="text"
                        className="clean-input"
                        value={(selectedNode.data as any).actionConfig?.title || ''}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, {
                            actionConfig: {
                              ...((selectedNode.data as any).actionConfig || {}),
                              title: e.target.value,
                            },
                          } as any)
                        }
                      />
                    </div>
                  </>
                )}

                {/* HANGUP NODE FIELDS */}
                {selectedNode.data.type === 'hangup' && (
                  <>
                    <div className="clean-field-group">
                      <label className="clean-label">Closing Script</label>
                      <textarea
                        className="clean-textarea"
                        rows={3}
                        value={(selectedNode.data as any).closingScript || ''}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, { closingScript: e.target.value } as any)
                        }
                      />
                    </div>

                    <div className="clean-field-group">
                      <label className="clean-label">Final Disposition</label>
                      <select
                        className="clean-select"
                        value={(selectedNode.data as any).disposition || 'meeting_booked'}
                        onChange={(e) =>
                          onUpdateNodeData(selectedNode.id, { disposition: e.target.value } as any)
                        }
                      >
                        <option value="meeting_booked">Meeting / Appointment Confirmed</option>
                        <option value="callback_scheduled">Callback Scheduled</option>
                        <option value="disqualified_not_interested">Not Interested / Cancelled</option>
                        <option value="voicemail_left">Voicemail Left</option>
                      </select>
                    </div>
                  </>
                )}

                {/* OUTGOING DECISION BRANCHES & ROUTING */}
                {selectedNode.data.type !== 'hangup' && (
                  <div className="clean-branches-section">
                    <div className="branches-section-head">
                      <div className="branches-title-wrap">
                        <GitFork size={13} className="text-muted" />
                        <label className="clean-label">Customer response paths ({outgoingEdges.length})</label>
                      </div>
                      <span className="clean-subtext">Choose what the agent should do for each meaningful customer response.</span>
                    </div>

                    {/* Existing Outgoing Branches */}
                    <div className="outgoing-branches-list">
                      {outgoingEdges.length === 0 ? (
                        <div className="empty-branches-notice">
                          <span>No response paths yet. Add one to tell the agent what to do next.</span>
                        </div>
                      ) : (
                        outgoingEdges.map((edge) => (
                          <div key={edge.id} className="outgoing-branch-card">
                            <div className="branch-card-header-row">
                              <input
                                type="text"
                                className="clean-input clean-input-sm branch-label-input"
                                value={edge.data?.label || 'Next Step'}
                                onChange={(e) => onUpdateEdgeLabel(edge.id, e.target.value)}
                                placeholder="What might the customer say?"
                              />
                              <button
                                type="button"
                                className="btn-icon-danger-sm"
                                onClick={() => onDeleteEdge(edge.id)}
                                title="Delete this branch"
                              >
                                <Trash2 size={13} />
                              </button>
                            </div>

                            <div className="branch-target-select-row">
                              <span className="route-arrow-symbol">
                                <ArrowRight size={12} />
                              </span>
                              <select
                                className="clean-select clean-select-sm"
                                value={edge.target}
                                onChange={(e) => onUpdateEdgeTarget(edge.id, e.target.value)}
                              >
                                {otherNodes.map((targetNode) => (
                                  <option key={targetNode.id} value={targetNode.id}>
                                    {targetNode.data.label} — {stepTypeName(targetNode.data.type)}
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Customer-defined response path */}
                    <div className="quick-branch-toolbar">
                      {!isAddingCustomPath ? (
                        <button type="button" className="btn-clean-outline btn-sm add-response-path-button" onClick={() => setIsAddingCustomPath(true)}>
                          <Plus size={13} /> Add customer response path
                        </button>
                      ) : <div className="custom-branch-inline-form">
                        <div className="custom-branch-heading">
                          <span>Create a custom response path</span>
                          <p>Describe what the customer says, then choose the next step.</p>
                        </div>
                        <label className="custom-branch-field">
                          <span>Customer response</span>
                          <input
                            type="text"
                            className="clean-input clean-input-sm"
                            placeholder="e.g. Asks about contract length"
                            value={customBranchText}
                            onChange={(e) => setCustomBranchText(e.target.value)}
                          />
                        </label>
                        <label className="custom-branch-field">
                          <span>Then go to</span>
                          <select
                            className="clean-select clean-select-sm"
                            value={customBranchTarget}
                            onChange={(e) => setCustomBranchTarget(e.target.value)}
                          >
                            <option value="">Choose the next step...</option>
                            {otherNodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.data.label} — {stepTypeName(n.data.type)}
                              </option>
                            ))}
                          </select>
                        </label>
                        <button
                          type="button"
                          className="btn-clean-primary btn-sm custom-branch-connect"
                          disabled={!customBranchText.trim() || !customBranchTarget}
                          onClick={() => {
                            if (customBranchText && customBranchTarget) {
                              onAddBranchConnection(selectedNode.id, customBranchText, customBranchTarget);
                              setCustomBranchText('');
                              setCustomBranchTarget('');
                              setIsAddingCustomPath(false);
                            }
                          }}
                        >
                          Add response path
                        </button>
                        <button type="button" className="btn-clean-text btn-sm" onClick={() => { setIsAddingCustomPath(false); setCustomBranchText(''); setCustomBranchTarget(''); }}>Cancel</button>
                      </div>}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="empty-panel-state">
                <Sliders size={24} className="text-muted" />
                <h4>No node selected</h4>
                <p>Click on any node in the canvas or step in the flow list to edit its parameters.</p>
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CAMPAIGN KNOWLEDGE */}
        {activeTab === 'knowledge' && (
          <div className="knowledge-view">
            <div className="view-intro">
              <span className="view-title">Campaign Knowledge Handbook</span>
              <p className="view-desc">
                Add the approved facts your agent can use across this entire campaign. Call steps decide what to ask; they do not own prices, policies, or answers.
              </p>
            </div>

            <div className="clean-field-group">
              <label className="clean-label">Agent Spoken Name</label>
              <input
                type="text"
                className="clean-input"
                value={knowledge.agentPersona.name}
                onChange={(e) =>
                  onUpdateKnowledge({
                    ...knowledge,
                    agentPersona: { ...knowledge.agentPersona, name: e.target.value },
                  })
                }
              />
            </div>

            <div className="clean-field-group">
              <label className="clean-label">Company Represented</label>
              <input
                type="text"
                className="clean-input"
                value={knowledge.agentPersona.company}
                onChange={(e) =>
                  onUpdateKnowledge({
                    ...knowledge,
                    agentPersona: { ...knowledge.agentPersona, company: e.target.value },
                  })
                }
              />
            </div>

            <div className="knowledge-summary-box">
              <span>{(knowledge.knowledgeItems || []).filter((item) => item.status === 'approved').length} Approved items</span>
              <span>{(knowledge.knowledgeItems || []).filter((item) => item.status === 'draft').length} Draft items</span>
            </div>

            <div className="branches-section">
              <div className="section-head-inline">
                <div>
                  <label className="clean-label">Approved campaign content</label>
                  <p className="clean-subtext">Only approved items are available to the live AI agent.</p>
                </div>
                <button type="button" className="btn-clean-primary btn-sm" onClick={addKnowledgeItem}>
                  <Plus size={12} /> Add information
                </button>
              </div>

              {(knowledge.knowledgeItems || []).length === 0 ? (
                <div className="empty-branches-notice">
                  <span>Add plans, prices, promotions, fees, policies, or service details. Include a source and version before approval.</span>
                </div>
              ) : (
                (knowledge.knowledgeItems || []).map((item) => (
                  <div className="clean-branch-editor" key={item.id}>
                    <div className="branch-top-row">
                      <input
                        className="clean-input clean-input-sm"
                        value={item.title}
                        placeholder="e.g. 300 Mbps annual renewal offer"
                        onChange={(e) => updateKnowledgeItem(item.id, { title: e.target.value })}
                      />
                      <button type="button" className="btn-icon-danger-sm" title="Remove information" onClick={() => removeKnowledgeItem(item.id)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div className="form-grid-2 mt-1">
                      <select className="clean-select clean-select-sm" value={item.contentType} onChange={(e) => updateKnowledgeItem(item.id, { contentType: e.target.value as KnowledgeContentType })}>
                        <option value="product_offer">Product / offer</option>
                        <option value="policy">Policy</option>
                        <option value="process">Process / procedure</option>
                        <option value="service">Service / support</option>
                        <option value="troubleshooting">Troubleshooting</option>
                        <option value="compliance">Compliance / privacy</option>
                        <option value="company_information">Company information</option>
                        <option value="escalation">Escalation / handoff</option>
                        <option value="reference">Reference</option>
                        <option value="other">Other</option>
                      </select>
                      <select className="clean-select clean-select-sm" value={item.status} onChange={(e) => updateKnowledgeItem(item.id, { status: e.target.value as KnowledgeItem['status'] })}>
                        <option value="draft">Draft — not used on calls</option>
                        <option value="approved">Approved — agent may use</option>
                        <option value="archived">Archived — not used</option>
                      </select>
                    </div>
                    <textarea
                      className="clean-textarea mt-1"
                      rows={4}
                      value={item.content}
                      placeholder="Approved customer-facing facts. Be specific about plan, price, eligibility, conditions, and limitations."
                      onChange={(e) => updateKnowledgeItem(item.id, { content: e.target.value })}
                    />
                    <input className="clean-input clean-input-sm mt-1" value={item.tags.join(', ')} placeholder="Tags, e.g. renewal, billing, privacy" onChange={(e) => updateKnowledgeItem(item.id, { tags: e.target.value.split(',').map((tag) => tag.trim()).filter(Boolean) })} />
                    <input className="clean-input clean-input-sm mt-1" value={item.source} placeholder="Source, e.g. Vianet Renewal Offer Sheet — Sep 2026" onChange={(e) => updateKnowledgeItem(item.id, { source: e.target.value })} />
                    <div className="form-grid-2 mt-1">
                      <input className="clean-input clean-input-sm" value={item.version} placeholder="Version" onChange={(e) => updateKnowledgeItem(item.id, { version: e.target.value })} />
                      <input className="clean-input clean-input-sm" type="date" value={item.effectiveFrom || ''} aria-label="Effective from" onChange={(e) => updateKnowledgeItem(item.id, { effectiveFrom: e.target.value || undefined })} />
                      <input className="clean-input clean-input-sm" type="date" value={item.effectiveUntil || ''} aria-label="Effective until" onChange={(e) => updateKnowledgeItem(item.id, { effectiveUntil: e.target.value || undefined })} />
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* AI Refine Prompt Bar at the Bottom */}
      <div className="panel-refine-footer">
        <form onSubmit={handleRefineSubmit} className="refine-form">
          <div className="refine-input-row">
            <input
              type="text"
              className="refine-input"
              placeholder="Prompt AI to refine flow (e.g. Add 20% discount rebuttal)..."
              value={refinePrompt}
              onChange={(e) => setRefinePrompt(e.target.value)}
            />
            <button
              type="submit"
              className="btn-refine"
              disabled={!refinePrompt.trim()}
              title="Apply prompt refinement"
            >
              <Sparkles size={13} />
            </button>
          </div>
        </form>
      </div>
    </aside>
  );
};
