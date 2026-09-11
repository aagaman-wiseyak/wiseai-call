import React from 'react';
import {
  PhoneCall,
  MessageSquareQuote,
  GitFork,
  BookOpen,
  Zap,
  PhoneOff,
  BookMarked,
  UserCheck,
  PlusCircle,
} from 'lucide-react';
import { OutboundNodeType, CampaignKnowledge } from '../../types/flow';

interface NodePaletteProps {
  onAddNode: (type: OutboundNodeType) => void;
  knowledge: CampaignKnowledge;
  onOpenKnowledgeModal: () => void;
}

interface PaletteItem {
  type: OutboundNodeType;
  title: string;
  description: string;
  icon: React.ReactNode;
  color: string;
}

const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'greeting',
    title: 'Greeting & AMD',
    description: 'Voicemail detection & human answer trigger',
    icon: <PhoneCall size={16} />,
    color: '#3b82f6',
  },
  {
    type: 'question',
    title: 'Spoken Prompt',
    description: 'AI speech with variable extraction',
    icon: <MessageSquareQuote size={16} />,
    color: '#8b5cf6',
  },
  {
    type: 'scenarioBranch',
    title: 'Scenario Router',
    description: 'Multi-path branching on lead intent',
    icon: <GitFork size={16} />,
    color: '#ec4899',
  },
  {
    type: 'knowledge',
    title: 'Knowledge / Objection',
    description: 'Rebuttal & FAQ with loop-back',
    icon: <BookOpen size={16} />,
    color: '#f59e0b',
  },
  {
    type: 'action',
    title: 'Action / Webhook',
    description: 'Calendar booking, SMS, or live transfer',
    icon: <Zap size={16} />,
    color: '#10b981',
  },
  {
    type: 'hangup',
    title: 'Call Hangup',
    description: 'Polite close with disposition tagging',
    icon: <PhoneOff size={16} />,
    color: '#64748b',
  },
];

export const NodePalette: React.FC<NodePaletteProps> = ({
  onAddNode,
  knowledge,
  onOpenKnowledgeModal,
}) => {
  const onDragStart = (event: React.DragEvent, nodeType: OutboundNodeType) => {
    event.dataTransfer.setData('application/reactflow', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <aside className="node-palette-sidebar">
      <div className="palette-header">
        <h3 className="palette-title">Node Components</h3>
        <p className="palette-subtitle">Drag to canvas or click to add</p>
      </div>

      <div className="palette-list">
        {PALETTE_ITEMS.map((item) => (
          <div
            key={item.type}
            className="palette-card"
            draggable
            onDragStart={(e) => onDragStart(e, item.type)}
            onClick={() => onAddNode(item.type)}
            title="Drag onto canvas or click to add"
          >
            <div className="palette-card-icon" style={{ backgroundColor: `${item.color}20`, color: item.color }}>
              {item.icon}
            </div>
            <div className="palette-card-info">
              <span className="palette-card-title">{item.title}</span>
              <span className="palette-card-desc">{item.description}</span>
            </div>
            <button
              className="palette-add-btn"
              onClick={(e) => {
                e.stopPropagation();
                onAddNode(item.type);
              }}
              title="Add node"
            >
              <PlusCircle size={14} />
            </button>
          </div>
        ))}
      </div>

      {/* Campaign Knowledge Card */}
      <div className="campaign-context-card">
        <div className="context-card-header">
          <BookMarked size={16} className="text-primary" />
          <span className="context-card-title">Campaign Knowledge</span>
        </div>
        <p className="context-card-desc">
          Persona: <strong>{knowledge.agentPersona.name}</strong> ({knowledge.agentPersona.company})
        </p>

        <div className="context-card-chips">
          <span className="context-chip">
            <UserCheck size={11} /> {knowledge.leadProfile.name}
          </span>
          <span className="context-chip">
            {knowledge.faqs.length} FAQs Loaded
          </span>
          <span className="context-chip">
            {knowledge.globalObjections.length} Objections
          </span>
        </div>

        <button
          className="btn-secondary btn-sm edit-kb-btn"
          onClick={onOpenKnowledgeModal}
        >
          Manage Campaign Knowledge
        </button>
      </div>
    </aside>
  );
};
