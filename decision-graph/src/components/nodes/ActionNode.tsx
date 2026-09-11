import React from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { ActionNodeData } from '../../types/flow';

export const ActionNode: React.FC<NodeProps> = ({ data, selected }) => {
  const nodeData = data as unknown as ActionNodeData;
  const isActive = nodeData.isActive;

  const getActionTypeLabel = () => {
    switch (nodeData.actionType) {
      case 'calendar_booking':
        return 'Calendar Booking';
      case 'send_sms':
        return 'Dispatch SMS';
      case 'live_transfer':
        return 'Live Agent Transfer';
      case 'crm_update':
        return 'CRM Lead Tagging';
      default:
        return 'Integration Webhook';
    }
  };

  return (
    <div className={`clean-node action-card ${selected ? 'selected' : ''} ${isActive ? 'active-simulating' : ''}`}>
      <Handle type="target" position={Position.Top} className="clean-handle" />

      <div className="clean-node-header">
        <div className="clean-node-meta">
          <span className="clean-node-type">Automated Action</span>
          <h4 className="clean-node-title">{nodeData.label || getActionTypeLabel()}</h4>
        </div>
        {isActive && <span className="clean-live-tag executing">Executed</span>}
      </div>

      <div className="clean-node-body">
        <div className="clean-action-type-pill">
          {getActionTypeLabel()}
        </div>

        {nodeData.actionConfig?.title && (
          <div className="clean-action-detail">
            {nodeData.actionConfig.title}
          </div>
        )}

        {nodeData.actionConfig?.crmTag && (
          <div className="clean-crm-tag">
            Tag: <code>{nodeData.actionConfig.crmTag}</code>
          </div>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="clean-handle" />
    </div>
  );
};
