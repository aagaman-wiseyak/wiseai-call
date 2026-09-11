import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { GreetingNodeData } from '../../types/flow';

export const GreetingNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as GreetingNodeData;
  const isActive = nodeData.isActive;

  return (
    <div className={`clean-node greeting-card ${selected ? 'selected' : ''} ${isActive ? 'active-simulating' : ''}`}>
      <div className="clean-node-header">
        <div className="clean-node-meta">
          <span className="clean-node-type">Initial Greeting</span>
          <h4 className="clean-node-title">{nodeData.label || 'Outbound Greeting'}</h4>
        </div>
        {isActive && <span className="clean-live-tag">Dialing</span>}
      </div>

      <div className="clean-node-body">
        <div className="clean-script-box">
          <span className="clean-script-label">Opening Speech</span>
          <p className="clean-script-text">{nodeData.openingScript}</p>
        </div>
      </div>

      {/* Primary Output Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        id="human"
        className="clean-handle"
      />
    </div>
  );
};
