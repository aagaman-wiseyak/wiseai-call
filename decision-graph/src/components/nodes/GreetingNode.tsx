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
          <span className="clean-node-type">Greeting & AMD</span>
          <h4 className="clean-node-title">{nodeData.label || 'Outbound Greeting'}</h4>
        </div>
        {isActive && <span className="clean-live-tag">Dialing</span>}
      </div>

      <div className="clean-node-body">
        <div className="clean-script-box">
          <span className="clean-script-label">Opening Speech</span>
          <p className="clean-script-text">{nodeData.openingScript}</p>
        </div>

        {nodeData.enableAmd && (
          <div className="clean-feature-badge">
            Answering Machine Detection (AMD) Active
          </div>
        )}
      </div>

      {/* Output Handles */}
      <div className="clean-node-handles-footer">
        <div className="clean-handle-item">
          <span className="clean-handle-text">Voicemail</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="voicemail"
            className="clean-handle handle-voicemail"
            style={{ left: '25%' }}
          />
        </div>
        <div className="clean-handle-item">
          <span className="clean-handle-text">Human Answered</span>
          <Handle
            type="source"
            position={Position.Bottom}
            id="human"
            className="clean-handle handle-human"
            style={{ left: '75%' }}
          />
        </div>
      </div>
    </div>
  );
};
