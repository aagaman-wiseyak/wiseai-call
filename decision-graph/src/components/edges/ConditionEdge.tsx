import React, { useState, useEffect, useRef } from 'react';
import {
  BaseEdge,
  EdgeLabelRenderer,
  EdgeProps,
  getBezierPath,
  Position,
} from '@xyflow/react';
import { useCanvasActions } from '../../context/CanvasActionContext';
import { Check, X, Trash2, Edit3 } from 'lucide-react';

const QUICK_INTENT_CHIPS = [
  { label: 'Yes / Accepted', color: '#10b981', isObjection: false },
  { label: 'User Busy / Later', color: '#3b82f6', isObjection: false },
  { label: 'Price / Objection', color: '#f59e0b', isObjection: true },
  { label: 'Not Interested / Opt-Out', color: '#ef4444', isObjection: false },
  { label: 'Next Step', color: '#94a3b8', isObjection: false },
];

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
  const canvasActions = useCanvasActions();
  const isActive = (data as any)?.isActive;
  const isObjection = (data as any)?.isObjection;
  const isReturn = (data as any)?.isReturn;
  const label = (data as any)?.label || 'Next Step';
  const intent = (data as any)?.intent;
  const explicitColor = (data as any)?.color;

  const isEditing = canvasActions?.editingEdgeId === id;
  const [draftLabel, setDraftLabel] = useState(label);
  const inputRef = useRef<HTMLInputElement>(null);
  const editorRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setDraftLabel(label);
  }, [label]);

  useEffect(() => {
    if (isEditing) {
      setTimeout(() => {
        inputRef.current?.focus();
        inputRef.current?.select();
      }, 50);
    }
  }, [isEditing]);

  // Derive thread color matching the branch options
  let threadColor = explicitColor;
  if (!threadColor) {
    if (intent === 'positive' || intent === 'positive_interest') {
      threadColor = '#10b981';
    } else if (isObjection || intent === 'objection' || intent === 'cost_concern' || intent === 'price_objection') {
      threadColor = '#f59e0b';
    } else if (intent === 'busy' || intent === 'busy_reschedule' || intent === 'timing_busy') {
      threadColor = '#3b82f6';
    } else if (intent === 'dnc' || intent === 'not_interested' || intent === 'negative') {
      threadColor = '#ef4444';
    } else {
      threadColor = '#94a3b8';
    }
  }

  // Prevent awkward 180-degree loopbacks when target is below and left of a right-sided handle
  let effectiveSourcePos = sourcePosition;
  if (sourcePosition === Position.Right && targetY > sourceY + 15 && targetX <= sourceX + 80) {
    effectiveSourcePos = Position.Bottom;
  }

  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition: effectiveSourcePos,
    targetX,
    targetY,
    targetPosition,
  });

  const edgeStyle = {
    ...style,
    stroke: isActive ? '#10b981' : threadColor,
    strokeWidth: isActive ? 3.5 : 2,
    strokeDasharray: isActive ? '6,3' : (isObjection || isReturn) ? '4,4' : undefined,
    filter: isActive ? 'drop-shadow(0 0 6px rgba(16, 185, 129, 0.75))' : undefined,
    animation: isActive ? 'conditionEdgeFlow 1.2s linear infinite' : undefined,
    transition: 'all 0.25s ease',
  };

  const handleSave = (customLabel?: string, customColor?: string, customObjection?: boolean) => {
    const finalLabel = (customLabel !== undefined ? customLabel : draftLabel).trim() || 'Next Step';
    canvasActions?.updateEdgeLabel(id, finalLabel, customColor || threadColor, customObjection !== undefined ? customObjection : isObjection);
    canvasActions?.setEditingEdgeId(null);
  };

  const handleSelectChip = (chip: typeof QUICK_INTENT_CHIPS[0]) => {
    setDraftLabel(chip.label);
    handleSave(chip.label, chip.color, chip.isObjection);
  };

  return (
    <>
      <BaseEdge id={id} path={edgePath} style={edgeStyle} markerEnd={markerEnd} />
      <EdgeLabelRenderer>
        {isEditing ? (
          <div
            ref={editorRef}
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              backgroundColor: '#ffffff',
              border: `2px solid ${threadColor || '#3b82f6'}`,
              borderRadius: '10px',
              padding: '8px 10px',
              boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.2), 0 8px 10px -6px rgba(0, 0, 0, 0.1)',
              zIndex: 100,
              minWidth: '240px',
            }}
            onClick={(e) => e.stopPropagation()}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                handleSave();
              } else if (e.key === 'Escape') {
                e.preventDefault();
                canvasActions?.setEditingEdgeId(null);
              }
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  backgroundColor: threadColor,
                  flexShrink: 0,
                }}
              />
              <input
                ref={inputRef}
                type="text"
                value={draftLabel}
                onChange={(e) => setDraftLabel(e.target.value)}
                placeholder="Path condition name..."
                style={{
                  flex: 1,
                  border: '1px solid #e2e8f0',
                  borderRadius: '5px',
                  padding: '4px 8px',
                  fontSize: '12px',
                  fontWeight: 600,
                  outline: 'none',
                  color: '#0f172a',
                }}
              />
              <button
                type="button"
                onClick={() => handleSave()}
                title="Save path name (Enter)"
                style={{
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '4px 7px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Check size={12} />
              </button>
              <button
                type="button"
                onClick={() => canvasActions?.deleteEdge(id)}
                title="Delete this connection"
                style={{
                  background: '#fef2f2',
                  color: '#ef4444',
                  border: '1px solid #fecaca',
                  borderRadius: '5px',
                  padding: '4px 7px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={12} />
              </button>
              <button
                type="button"
                onClick={() => canvasActions?.setEditingEdgeId(null)}
                title="Close (Esc)"
                style={{
                  background: '#f1f5f9',
                  color: '#64748b',
                  border: 'none',
                  borderRadius: '5px',
                  padding: '4px 6px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <X size={12} />
              </button>
            </div>

            {/* Quick Intent Chips */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px' }}>
              {QUICK_INTENT_CHIPS.map((chip) => (
                <button
                  key={chip.label}
                  type="button"
                  onClick={() => handleSelectChip(chip)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '4px',
                    padding: '2px 7px',
                    fontSize: '10px',
                    fontWeight: 600,
                    borderRadius: '9999px',
                    border: `1px solid ${chip.color}50`,
                    background: draftLabel === chip.label ? `${chip.color}20` : '#f8fafc',
                    color: '#334155',
                    cursor: 'pointer',
                    transition: 'all 0.1s ease',
                  }}
                >
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: chip.color }} />
                  {chip.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div
            onClick={(e) => {
              e.stopPropagation();
              canvasActions?.setEditingEdgeId(id);
            }}
            title="Click to edit path name directly on canvas"
            style={{
              position: 'absolute',
              transform: `translate(-50%, -50%) translate(${labelX}px,${labelY}px)`,
              pointerEvents: 'all',
              backgroundColor: isActive ? '#ecfdf5' : '#ffffff',
              border: `2px solid ${isActive ? '#10b981' : `${threadColor}40`}`,
              borderRadius: '9999px',
              padding: isActive ? '4px 12px' : '3px 9px',
              fontSize: isActive ? '12px' : '11px',
              fontWeight: 700,
              color: isActive ? '#065f46' : '#334155',
              boxShadow: isActive
                ? '0 0 16px rgba(16, 185, 129, 0.45), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
                : '0 2px 5px rgba(0, 0, 0, 0.08)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '6px',
              whiteSpace: 'nowrap',
              zIndex: isActive ? 40 : 10,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
              userSelect: 'none',
            }}
            className={`condition-edge-badge ${isActive ? 'active-simulating' : ''}`}
          >
            <span
              style={{
                width: isActive ? 9 : 7,
                height: isActive ? 9 : 7,
                borderRadius: '50%',
                backgroundColor: isActive ? '#10b981' : threadColor,
                display: 'inline-block',
                flexShrink: 0,
                boxShadow: isActive ? '0 0 8px #10b981' : undefined,
              }}
            />
            <span>{label}</span>
            {isActive ? (
              <span
                style={{
                  fontSize: '9px',
                  fontWeight: 800,
                  backgroundColor: '#10b981',
                  color: '#ffffff',
                  padding: '1px 6px',
                  borderRadius: '4px',
                  letterSpacing: '0.04em',
                }}
              >
                TRAVERSED
              </span>
            ) : (
              <Edit3 size={10} style={{ opacity: 0.45, marginLeft: 2 }} />
            )}
          </div>
        )}
      </EdgeLabelRenderer>
    </>
  );
};


