import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ScenarioBranchNodeData } from '../../types/flow';

export const ScenarioBranchNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as ScenarioBranchNodeData;
  const isActive = nodeData.isActive;
  const branches = nodeData.branches || [];

  return (
    <div className={`clean-node branch-card ${selected ? 'selected' : ''} ${isActive ? 'active-simulating' : ''}`}>
      <Handle type="target" position={Position.Top} className="clean-handle" />

      <div className="clean-node-header">
        <div className="clean-node-meta">
          <span className="clean-node-type">Scenario Router</span>
          <h4 className="clean-node-title">{nodeData.label || 'Intent Router'}</h4>
        </div>
        {isActive && <span className="clean-live-tag evaluating">Evaluating</span>}
      </div>

      <div className="clean-node-body">
        <p className="clean-desc-text">
          {nodeData.evaluationCriteria || 'Evaluates lead sentiment and intent to branch'}
        </p>

        <div className="clean-branch-list">
          {branches.map((b) => (
            <div key={b.id} className="clean-branch-row">
              <div className="clean-branch-info">
                <span className="clean-branch-dot" style={{ backgroundColor: b.color || '#18181b' }} />
                <span className="clean-branch-name">{b.label}</span>
              </div>

              <Handle
                type="source"
                position={Position.Right}
                id={b.targetHandle || b.id}
                className="clean-handle clean-handle-branch"
                style={{
                  top: 'auto',
                  position: 'relative',
                  transform: 'none',
                  borderColor: b.color || '#18181b',
                }}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
