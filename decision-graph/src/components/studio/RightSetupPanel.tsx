import React, { useState } from 'react';
import {
  CustomFlowNode,
  CustomFlowEdge,
  OutboundNodeData,
  OutboundNodeType,
  CampaignKnowledge,
  BranchCondition,
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
        <button
          className={`panel-tab ${activeTab === 'knowledge' ? 'active' : ''}`}
          onClick={() => setActiveTab('knowledge')}
        >
          <BookOpen size={14} />
          <span>Knowledge</span>
        </button>
      </div>

      {/* Main Content Area */}
      <div className="panel-scroll-content">
        {/* TAB 1: STEP-BY-STEP FLOW LIST */}
        {activeTab === 'flow' && (
          <div className="flow-steps-view">
            <div className="view-intro">
              <span className="view-title">Decision Tree Sequence</span>
              <p className="view-desc">
                Configure greetings, questions, and scenarios here. All updates sync live to the canvas.
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
                      <span className="step-type-pill">{n.data.type}</span>
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
                  <div>
                    <span className="inspector-type">{selectedNode.data.type} node</span>
                    <h3 className="inspector-title">{selectedNode.data.label}</h3>
                  </div>
                  <button
                    className="btn-text-danger"
                    onClick={() => onDeleteNode(selectedNode.id)}
                    title="Delete node"
                  >
                    <Trash2 size={14} />
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
                  <>
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

                    <div className="clean-checkbox-row">
                      <label>
                        <input
                          type="checkbox"
                          checked={(selectedNode.data as any).enableAmd || false}
                          onChange={(e) =>
                            onUpdateNodeData(selectedNode.id, { enableAmd: e.target.checked } as any)
                          }
                        />
                        Enable Answering Machine Detection (AMD)
                      </label>
                    </div>

                    {(selectedNode.data as any).enableAmd && (
                      <div className="clean-field-group">
                        <label className="clean-label">Voicemail Drop Message</label>
                        <textarea
                          className="clean-textarea"
                          rows={3}
                          value={(selectedNode.data as any).voicemailScript || ''}
                          onChange={(e) =>
                            onUpdateNodeData(selectedNode.id, { voicemailScript: e.target.value } as any)
                          }
                        />
                      </div>
                    )}
                  </>
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
                      <label className="clean-label">Evaluation Criteria</label>
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
                        <label className="clean-label">Branch Scenarios</label>
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
                      <label className="clean-label">Objection Topic</label>
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
                      <label className="clean-label">Rebuttal / FAQ Answer</label>
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
                        Resume previous question after answering
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
                        <label className="clean-label">Outgoing Branches ({outgoingEdges.length})</label>
                      </div>
                      <span className="clean-subtext">Route customer responses to next steps</span>
                    </div>

                    {/* Existing Outgoing Branches */}
                    <div className="outgoing-branches-list">
                      {outgoingEdges.length === 0 ? (
                        <div className="empty-branches-notice">
                          <span>No outgoing branches from this step yet. Click a branch below to connect.</span>
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
                                placeholder="Branch condition (e.g. If Customer says YES)"
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
                                    {targetNode.data.label} ({targetNode.data.type})
                                  </option>
                                ))}
                              </select>
                            </div>
                          </div>
                        ))
                      )}
                    </div>

                    {/* Quick Add Preset Response Branches */}
                    <div className="quick-branch-toolbar">
                      <span className="quick-branch-title">+ Quick Add Response Branch:</span>
                      <div className="quick-branch-buttons-grid">
                        <button
                          type="button"
                          className="btn-quick-branch green"
                          onClick={() =>
                            onQuickCreateAndConnect(selectedNode.id, 'If Confirmed / Yes', 'action')
                          }
                          title="If lead confirms -> triggers action"
                        >
                          + If Yes → Action
                        </button>
                        <button
                          type="button"
                          className="btn-quick-branch amber"
                          onClick={() =>
                            onQuickCreateAndConnect(selectedNode.id, 'If Price Objection', 'knowledge', true)
                          }
                          title="If lead objects on price -> routes to rebuttal"
                        >
                          + If Price Objection → Rebuttal
                        </button>
                        <button
                          type="button"
                          className="btn-quick-branch blue"
                          onClick={() =>
                            onQuickCreateAndConnect(selectedNode.id, 'If Busy / Call Later', 'action')
                          }
                          title="If lead is busy -> triggers callback SMS"
                        >
                          + If Busy → SMS Link
                        </button>
                        <button
                          type="button"
                          className="btn-quick-branch red"
                          onClick={() =>
                            onQuickCreateAndConnect(selectedNode.id, 'If Not Interested', 'hangup')
                          }
                          title="If lead rejects -> graceful opt-out"
                        >
                          + If Not Interested → Exit
                        </button>
                        <button
                          type="button"
                          className="btn-quick-branch purple"
                          onClick={() =>
                            onQuickCreateAndConnect(selectedNode.id, 'Next Question', 'question')
                          }
                          title="Add next sequential question"
                        >
                          + Next Question
                        </button>
                      </div>

                      {/* Custom Branch Creator Form */}
                      <div className="custom-branch-inline-form">
                        <input
                          type="text"
                          className="clean-input clean-input-sm"
                          placeholder="Or type custom condition (e.g. If asks about insurance)..."
                          value={customBranchText}
                          onChange={(e) => setCustomBranchText(e.target.value)}
                        />
                        <div className="custom-branch-target-row">
                          <select
                            className="clean-select clean-select-sm"
                            value={customBranchTarget}
                            onChange={(e) => setCustomBranchTarget(e.target.value)}
                          >
                            <option value="">Select target node...</option>
                            {otherNodes.map((n) => (
                              <option key={n.id} value={n.id}>
                                {n.data.label} ({n.data.type})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            className="btn-clean-primary btn-sm"
                            disabled={!customBranchText.trim() || !customBranchTarget}
                            onClick={() => {
                              if (customBranchText && customBranchTarget) {
                                onAddBranchConnection(selectedNode.id, customBranchText, customBranchTarget);
                                setCustomBranchText('');
                                setCustomBranchTarget('');
                              }
                            }}
                          >
                            Connect
                          </button>
                        </div>
                      </div>
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
              <span className="view-title">Campaign Persona & Context</span>
              <p className="view-desc">
                Setup agent identity, dynamic lead variables, and global objection responses.
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

            <div className="clean-field-group">
              <label className="clean-label">Target Lead Name (&#123;&#123;lead_name&#125;&#125;)</label>
              <input
                type="text"
                className="clean-input"
                value={knowledge.leadProfile.name}
                onChange={(e) =>
                  onUpdateKnowledge({
                    ...knowledge,
                    leadProfile: { ...knowledge.leadProfile, name: e.target.value },
                  })
                }
              />
            </div>

            <div className="clean-field-group">
              <label className="clean-label">Target Phone Number</label>
              <input
                type="text"
                className="clean-input"
                value={knowledge.leadProfile.phone}
                onChange={(e) =>
                  onUpdateKnowledge({
                    ...knowledge,
                    leadProfile: { ...knowledge.leadProfile, phone: e.target.value },
                  })
                }
              />
            </div>

            <div className="knowledge-summary-box">
              <span>{knowledge.globalObjections.length} Global Objections Loaded</span>
              <span>{knowledge.faqs.length} Campaign FAQs Loaded</span>
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
