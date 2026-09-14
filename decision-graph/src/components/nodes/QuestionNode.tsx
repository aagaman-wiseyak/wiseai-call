import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { QuestionNodeData } from '../../types/flow';

export const QuestionNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as QuestionNodeData;
  const isActive = nodeData.isActive;

  return (
    <div className={`clean-node question-card ${selected ? 'selected' : ''} ${isActive ? 'active-simulating' : ''}`}>
      <Handle type="target" position={Position.Top} className="clean-handle" />

      <div className="clean-node-header">
        <div className="clean-node-meta">
          <span className="clean-node-type">Question Prompt</span>
          <h4 className="clean-node-title">{nodeData.label || 'Qualifying Question'}</h4>
        </div>
        {isActive && <span className="clean-live-tag speaking">Speaking</span>}
      </div>

      <div className="clean-node-body">
        <div className="clean-script-box">
          <span className="clean-script-label">AI Speech Prompt</span>
          <p className="clean-script-text">{nodeData.speechPrompt}</p>
        </div>

        <div className="clean-meta-row">
          {nodeData.variableToExtract && (
            <span className="clean-variable-pill">
              Extract: <code>{nodeData.variableToExtract}</code>
            </span>
          )}
          <span className="clean-subtle-tag" title="Maximum times AI will repeat/clarify if response is unclear">
            ↻ Max {nodeData.maxRepeats ?? 2} repeats
          </span>
          {nodeData.allowBargeIn && (
            <span className="clean-subtle-tag">Barge-in on</span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Bottom} className="clean-handle" />
    </div>
  );
};
