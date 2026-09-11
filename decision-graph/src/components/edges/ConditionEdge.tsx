import React from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
} from '@xyflow/react';

export const ConditionEdge: React.FC<EdgeProps> = ({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  style = {},
  markerEnd,
  data,
}) => {
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isActive = (data as any)?.isActive;
  const isObjection = (data as any)?.isObjection;
  const label = (data as any)?.label;

  const edgeStyle = {
    ...style,
    stroke: isActive
      ? '#09090b'
      : isObjection
      ? '#d97706'
      : '#cbd5e1',
    strokeWidth: isActive ? 2.5 : 1.5,
    strokeDasharray: isObjection ? '3,3' : undefined,
    transition: 'stroke 0.2s ease',
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />
      {label && (
        <EdgeLabelRenderer>
          <div
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
            }}
            className={`clean-edge-badge ${isActive ? 'active' : ''} ${
              isObjection ? 'objection' : ''
            }`}
          >
            {label}
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
};
