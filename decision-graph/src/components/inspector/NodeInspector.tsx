import React from 'react';
import {
  Trash2,
  Variable,
  Plus,
  X,
  Sliders,
  Sparkles,
} from 'lucide-react';
import {
  CustomFlowNode,
  OutboundNodeData,
  BranchCondition,
  CampaignKnowledge,
} from '../../types/flow';

interface NodeInspectorProps {
  selectedNode: CustomFlowNode | null;
  onUpdateNodeData: (nodeId: string, newData: Partial<OutboundNodeData>) => void;
  onDeleteNode: (nodeId: string) => void;
  knowledge: CampaignKnowledge;
  onClose: () => void;
}

export const NodeInspector: React.FC<NodeInspectorProps> = ({
  selectedNode,
  onUpdateNodeData,
  onDeleteNode,
  knowledge,
  onClose,
}) => {
  if (!selectedNode) {
    return (
      <aside className="inspector-panel empty">
        <div className="empty-inspector-state">
          <Sliders size={28} className="text-muted" />
          <h4>No Node Selected</h4>
          <p>Click on any node in the canvas to inspect and edit its prompts, branches, and parameters.</p>
        </div>
      </aside>
    );
  }

  const data = selectedNode.data;
  const nodeType = data.type;

  const insertVariable = (varName: string, fieldKey: string, currentVal: string) => {
    onUpdateNodeData(selectedNode.id, {
      [fieldKey]: `${currentVal} {{${varName}}}`,
    } as any);
  };

  const handleBranchChange = (branchId: string, field: keyof BranchCondition, val: string) => {
    if (nodeType !== 'scenarioBranch') return;
    const branches = [...((data as any).branches || [])];
    const idx = branches.findIndex((b) => b.id === branchId);
    if (idx !== -1) {
      branches[idx] = { ...branches[idx], [field]: val };
      onUpdateNodeData(selectedNode.id, { branches } as any);
    }
  };

  const addBranch = () => {
    if (nodeType !== 'scenarioBranch') return;
    const branches = [...((data as any).branches || [])];
    const newId = `branch-${Date.now()}`;
    branches.push({
      id: newId,
      label: 'New Scenario Branch',
      description: 'Triggered when prospect responds with specific condition',
      intentKey: 'custom_intent',
      color: '#6366f1',
      targetHandle: `handle-${newId}`,
    });
    onUpdateNodeData(selectedNode.id, { branches } as any);
  };

  const removeBranch = (branchId: string) => {
    if (nodeType !== 'scenarioBranch') return;
    const branches = ((data as any).branches || []).filter((b: BranchCondition) => b.id !== branchId);
    onUpdateNodeData(selectedNode.id, { branches } as any);
  };

  return (
    <aside className="inspector-panel">
      <div className="inspector-header">
        <div className="inspector-title-wrap">
          <span className="inspector-badge">{nodeType.toUpperCase()} NODE</span>
          <h3 className="inspector-node-title">{data.label || 'Node Properties'}</h3>
        </div>
        <div className="inspector-header-actions">
          <button
            className="btn-icon text-danger"
            onClick={() => onDeleteNode(selectedNode.id)}
            title="Delete this node"
          >
            <Trash2 size={16} />
          </button>
          <button className="btn-icon" onClick={onClose} title="Close inspector">
            <X size={16} />
          </button>
        </div>
      </div>

      <div className="inspector-body">
        {/* Basic Node Name */}
        <div className="form-group">
          <label className="form-label">Node Title</label>
          <input
            type="text"
            className="form-input"
            value={data.label || ''}
            onChange={(e) => onUpdateNodeData(selectedNode.id, { label: e.target.value } as any)}
          />
        </div>

        {/* Dynamic Variable Shortcuts */}
        <div className="variable-shortcuts-section">
          <span className="section-label">
            <Sparkles size={12} /> Insert Campaign Variable:
          </span>
          <div className="variable-chips-row">
            {['lead_name', 'company', 'phone'].map((v) => (
              <button
                key={v}
                type="button"
                className="chip-btn"
                onClick={() => {
                  const targetField =
                    nodeType === 'greeting'
                      ? 'openingScript'
                      : nodeType === 'question'
                      ? 'speechPrompt'
                      : nodeType === 'knowledge'
                      ? 'rebuttalScript'
                      : nodeType === 'hangup'
                      ? 'closingScript'
                      : 'label';
                  insertVariable(v, targetField, (data as any)[targetField] || '');
                }}
              >
                + &#123;&#123;{v}&#125;&#125;
              </button>
            ))}
          </div>
        </div>

        {/* GREETING NODE SPECIFIC */}
        {nodeType === 'greeting' && (
          <>
            <div className="form-group">
              <label className="form-label">Opening Speech Script</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={(data as any).openingScript || ''}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, { openingScript: e.target.value } as any)
                }
              />
            </div>
          </>
        )}

        {/* QUESTION NODE SPECIFIC */}
        {nodeType === 'question' && (
          <>
            <div className="form-group">
              <label className="form-label">AI Speech Prompt</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={(data as any).speechPrompt || ''}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, { speechPrompt: e.target.value } as any)
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Variable to Extract</label>
              <div className="input-with-icon">
                <Variable size={14} className="input-icon" />
                <input
                  type="text"
                  className="form-input with-icon"
                  placeholder="e.g. cloud_budget, pain_level"
                  value={(data as any).variableToExtract || ''}
                  onChange={(e) =>
                    onUpdateNodeData(selectedNode.id, { variableToExtract: e.target.value } as any)
                  }
                />
              </div>
            </div>

            <div className="form-group">
              <label className="form-label">
                Max Question Repeats / Retries
                <span style={{ fontSize: '11px', color: '#64748b', fontWeight: 'normal', marginLeft: '6px' }}>
                  (unclear responses / repeat requests)
                </span>
              </label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input
                  type="number"
                  min={1}
                  max={5}
                  className="form-input"
                  style={{ width: '80px' }}
                  value={(data as any).maxRepeats ?? 2}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    onUpdateNodeData(selectedNode.id, {
                      maxRepeats: isNaN(val) ? 2 : Math.max(1, Math.min(5, val)),
                    } as any);
                  }}
                />
                <span style={{ fontSize: '12px', color: '#64748b' }}>times before fallback/escalation</span>
              </div>
            </div>

            <div className="form-group checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={(data as any).allowBargeIn || false}
                  onChange={(e) =>
                    onUpdateNodeData(selectedNode.id, { allowBargeIn: e.target.checked } as any)
                  }
                />
                Allow Barge-In (prospect can interrupt AI speech)
              </label>
            </div>
          </>
        )}

        {/* SCENARIO BRANCH NODE SPECIFIC */}
        {nodeType === 'scenarioBranch' && (
          <>
            <div className="form-group">
              <label className="form-label">Evaluation Criteria</label>
              <input
                type="text"
                className="form-input"
                value={(data as any).evaluationCriteria || ''}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, { evaluationCriteria: e.target.value } as any)
                }
              />
            </div>

            <div className="branches-editor-section">
              <div className="section-header-inline">
                <label className="form-label">Branch Scenarios</label>
                <button className="btn-secondary btn-xs" onClick={addBranch}>
                  <Plus size={12} /> Add Path
                </button>
              </div>

              {((data as any).branches || []).map((b: BranchCondition) => (
                <div key={b.id} className="branch-editor-card">
                  <div className="branch-card-row">
                    <input
                      type="color"
                      className="branch-color-picker"
                      value={b.color || '#6366f1'}
                      onChange={(e) => handleBranchChange(b.id, 'color', e.target.value)}
                    />
                    <input
                      type="text"
                      className="form-input form-input-sm branch-title-input"
                      value={b.label}
                      onChange={(e) => handleBranchChange(b.id, 'label', e.target.value)}
                      placeholder="Branch label"
                    />
                    <button
                      className="btn-icon text-muted"
                      onClick={() => removeBranch(b.id)}
                      title="Remove branch"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                  <input
                    type="text"
                    className="form-input form-input-sm branch-desc-input"
                    value={b.description}
                    onChange={(e) => handleBranchChange(b.id, 'description', e.target.value)}
                    placeholder="Scenario trigger description"
                  />
                </div>
              ))}
            </div>
          </>
        )}

        {/* KNOWLEDGE NODE SPECIFIC */}
        {nodeType === 'knowledge' && (
          <>
            <div className="form-group">
              <label className="form-label">Objection / Topic</label>
              <input
                type="text"
                className="form-input"
                value={(data as any).objectionTopic || ''}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, { objectionTopic: e.target.value } as any)
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Rebuttal / Knowledge Answer</label>
              <textarea
                className="form-textarea"
                rows={4}
                value={(data as any).rebuttalScript || ''}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, { rebuttalScript: e.target.value } as any)
                }
              />
            </div>

            <div className="form-group checkbox-row">
              <label>
                <input
                  type="checkbox"
                  checked={(data as any).returnToPrevious || false}
                  onChange={(e) =>
                    onUpdateNodeData(selectedNode.id, { returnToPrevious: e.target.checked } as any)
                  }
                />
                Return to previous question after rebuttal
              </label>
            </div>
          </>
        )}

        {/* ACTION NODE SPECIFIC */}
        {nodeType === 'action' && (
          <>
            <div className="form-group">
              <label className="form-label">Integration Action Type</label>
              <select
                className="form-select"
                value={(data as any).actionType || 'calendar_booking'}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, { actionType: e.target.value } as any)
                }
              >
                <option value="calendar_booking">Calendar Booking (Calendly/Google Cal)</option>
                <option value="send_sms">Dispatch SMS Confirmation (Twilio)</option>
                <option value="live_transfer">Warm Live Agent Transfer (SIP)</option>
                <option value="crm_update">Update CRM Lead Status</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">Payload / Details</label>
              <input
                type="text"
                className="form-input"
                value={(data as any).actionConfig?.title || ''}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, {
                    actionConfig: {
                      ...((data as any).actionConfig || {}),
                      title: e.target.value,
                    },
                  } as any)
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">CRM Disposition Tag</label>
              <input
                type="text"
                className="form-input"
                value={(data as any).actionConfig?.crmTag || ''}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, {
                    actionConfig: {
                      ...((data as any).actionConfig || {}),
                      crmTag: e.target.value,
                    },
                  } as any)
                }
              />
            </div>
          </>
        )}

        {/* HANGUP NODE SPECIFIC */}
        {nodeType === 'hangup' && (
          <>
            <div className="form-group">
              <label className="form-label">Closing Script</label>
              <textarea
                className="form-textarea"
                rows={3}
                value={(data as any).closingScript || ''}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, { closingScript: e.target.value } as any)
                }
              />
            </div>

            <div className="form-group">
              <label className="form-label">Final Call Disposition</label>
              <select
                className="form-select"
                value={(data as any).disposition || 'meeting_booked'}
                onChange={(e) =>
                  onUpdateNodeData(selectedNode.id, { disposition: e.target.value } as any)
                }
              >
                <option value="meeting_booked">Meeting / Appointment Booked</option>
                <option value="callback_scheduled">Callback Scheduled</option>
                <option value="information_sent">Information Dispatched (SMS/Email)</option>
                <option value="disqualified_not_interested">Disqualified / Neutral Exit</option>
                <option value="dnc_requested">Do Not Call (DNC) Requested</option>
                <option value="voicemail_left">Voicemail Left</option>
                <option value="wrong_number">Wrong Number / Invalid Contact</option>
              </select>
            </div>
          </>
        )}
      </div>
    </aside>
  );
};
