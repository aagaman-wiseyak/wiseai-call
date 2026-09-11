import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { KnowledgeNodeData } from '../../types/flow';

export const KnowledgeNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as KnowledgeNodeData;
  const isActive = nodeData.isActive;

  return (
    <div className={`clean-node knowledge-card ${selected ? 'selected' : ''} ${isActive ? 'active-simulating' : ''}`}>
      <Handle type="target" position={Position.Top} className="clean-handle" />

      <div className="clean-node-header">
        <div className="clean-node-meta">
          <span className="clean-node-type">Campaign Rebuttal</span>
          <h4 className="clean-node-title">{nodeData.label || 'Objection Handler'}</h4>
        </div>
        {isActive && <span className="clean-live-tag answering">Handling</span>}
      </div>

      <div className="clean-node-body">
        <div className="clean-topic-row">
          <span className="clean-topic-label">Topic:</span>
          <span className="clean-topic-name">{nodeData.objectionTopic || 'General FAQ'}</span>
        </div>

        <div className="clean-script-box">
          <span className="clean-script-label">Rebuttal Response</span>
          <p className="clean-script-text">{nodeData.rebuttalScript}</p>
        </div>

        {nodeData.returnToPrevious && (
          <span className="clean-subtle-tag return-tag">
            Resumes previous question upon completion
          </span>
        )}
      </div>

      <Handle
        type="source"
        position={Position.Bottom}
        id="rebuttal-accepted"
        className="clean-handle handle-amber"
      />
    </div>
  );
};
