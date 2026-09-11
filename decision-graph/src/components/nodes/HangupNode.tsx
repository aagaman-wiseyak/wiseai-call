import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { HangupNodeData } from '../../types/flow';

export const HangupNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as HangupNodeData;
  const isActive = nodeData.isActive;

  const getDispositionLabel = (disp: string) => {
    switch (disp) {
      case 'meeting_booked':
        return 'Meeting Booked';
      case 'callback_scheduled':
        return 'Callback Scheduled';
      case 'dnc_requested':
        return 'DNC Opt-Out';
      case 'voicemail_left':
        return 'Voicemail Drop';
      default:
        return 'Call Complete';
    }
  };

  return (
    <div className={`clean-node hangup-card ${selected ? 'selected' : ''} ${isActive ? 'active-simulating' : ''}`}>
      <Handle type="target" position={Position.Top} className="clean-handle" />

      <div className="clean-node-header">
        <div className="clean-node-meta">
          <span className="clean-node-type">Call Exit</span>
          <h4 className="clean-node-title">{nodeData.label || 'Call Termination'}</h4>
        </div>
        {isActive && <span className="clean-live-tag ended">Terminated</span>}
      </div>

      <div className="clean-node-body">
        <div className="clean-script-box">
          <span className="clean-script-label">Closing Speech</span>
          <p className="clean-script-text">{nodeData.closingScript}</p>
        </div>

        <div className="clean-disposition-pill">
          Disposition: <strong>{getDispositionLabel(nodeData.disposition)}</strong>
        </div>
      </div>
    </div>
  );
};
