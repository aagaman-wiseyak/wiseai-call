import React, { useState, useCallback, useRef, useMemo } from 'react';
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  Connection,
  Node,
  ReactFlowInstance,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import {
  CustomFlowNode,
  CustomFlowEdge,
  OutboundNodeType,
  OutboundNodeData,
  CampaignKnowledge,
} from '../../types/flow';
import { CampaignTemplate } from '../../templates/campaignTemplates';
import { getLayoutedElements } from '../../utils/layout';

import { GreetingNode } from '../nodes/GreetingNode';
import { QuestionNode } from '../nodes/QuestionNode';
import { ScenarioBranchNode } from '../nodes/ScenarioBranchNode';
import { KnowledgeNode } from '../nodes/KnowledgeNode';
import { ActionNode } from '../nodes/ActionNode';
import { HangupNode } from '../nodes/HangupNode';
import { ConditionEdge } from '../edges/ConditionEdge';
import { RightSetupPanel } from './RightSetupPanel';
import { LiveCallConsole } from '../call/LiveCallConsole';
import { saveCampaign } from '../../utils/campaignClient';
import { callLlm } from '../../utils/llmClient';

import {
  ArrowLeft,
  LayoutGrid,
  Plus,
  PhoneCall,
  Download,
  HelpCircle,
  GitFork,
  ShieldAlert,
  Zap,
  RotateCcw,
  Copy,
  Trash2,
  Phone,
  PhoneOff,
  Sparkles,
  X,
  SlidersHorizontal,
} from 'lucide-react';
import { WiseBrandLogo } from '../brand/WiseBrandLogo';
import { CanvasActionContext } from '../../context/CanvasActionContext';

const nodeTypes = {
  greeting: GreetingNode,
  question: QuestionNode,
  scenarioBranch: ScenarioBranchNode,
  knowledge: KnowledgeNode,
  action: ActionNode,
  hangup: HangupNode,
};

const edgeTypes = {
  condition: ConditionEdge,
  default: ConditionEdge,
};

interface CanvasStudioProps {
  template: CampaignTemplate;
  onBackToTemplates: () => void;
  onProceedToCall: (
    nodes: CustomFlowNode[],
    edges: CustomFlowEdge[],
    knowledge: CampaignKnowledge
  ) => void;
}

export const CanvasStudio: React.FC<CanvasStudioProps> = ({
  template,
  onBackToTemplates,
  onProceedToCall,
}) => {
  const reactFlowWrapper = useRef<HTMLDivElement>(null);
  const [rfInstance, setRfInstance] = useState<ReactFlowInstance<CustomFlowNode, CustomFlowEdge> | null>(null);

  const [campaignKnowledge, setCampaignKnowledge] = useState<CampaignKnowledge>(template.knowledge);
  const [nodes, setNodes, onNodesChange] = useNodesState<CustomFlowNode>(template.initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState<CustomFlowEdge>(template.initialEdges);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isAddStepMenuOpen, setIsAddStepMenuOpen] = useState(false);
  const [editingEdgeId, setEditingEdgeId] = useState<string | null>(null);

  // Live Call Simulation State
  const [isStartCallModalOpen, setIsStartCallModalOpen] = useState(false);
  const [isLiveCallOpen, setIsLiveCallOpen] = useState(false);
  const [simActiveNodeId, setSimActiveNodeId] = useState<string | null>(null);
  const [simActiveEdgeId, setSimActiveEdgeId] = useState<string | null>(null);
  const [isRightPanelCollapsed, setIsRightPanelCollapsed] = useState(false);

  // Editable lead parameters for call
  const [callLeadName, setCallLeadName] = useState(campaignKnowledge.leadProfile?.name || 'Prospective Client');
  const [callLeadPhone, setCallLeadPhone] = useState(campaignKnowledge.leadProfile?.phone || '+1 (555) 123-4567');
  const [callLeadCompany, setCallLeadCompany] = useState(campaignKnowledge.leadProfile?.company || 'Acme Corp');

  const copiedNodeRef = useRef<CustomFlowNode | null>(null);
  const [copiedToast, setCopiedToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setCopiedToast(msg);
    setTimeout(() => setCopiedToast(null), 2500);
  }, []);

  // Compute nodes with active simulation styling
  const displayNodes = useMemo(() => {
    return nodes.map((node) => ({
      ...node,
      data: {
        ...node.data,
        isActive: node.id === simActiveNodeId,
      },
    }));
  }, [nodes, simActiveNodeId]);

  // Compute edges with active simulation path styling
  const displayEdges = useMemo(() => {
    return edges.map((edge) => ({
      ...edge,
      data: {
        ...edge.data,
        isActive: edge.id === simActiveEdgeId,
      },
    }));
  }, [edges, simActiveEdgeId]);

  // Smoothly center the canvas on the active node as conversational turns progress
  React.useEffect(() => {
    if (!simActiveNodeId || !rfInstance) return;
    const targetNode = nodes.find((n) => n.id === simActiveNodeId);
    if (targetNode) {
      rfInstance.setCenter(targetNode.position.x + 140, targetNode.position.y + 70, {
        duration: 600,
        zoom: 0.95,
      });
    }
  }, [simActiveNodeId, nodes, rfInstance]);

  // Confirm and start live call simulation
  const handleConfirmStartCall = async () => {
    const updatedKnowledge: CampaignKnowledge = {
      ...campaignKnowledge,
      leadProfile: {
        ...campaignKnowledge.leadProfile,
        name: callLeadName.trim() || 'Prospective Client',
        phone: callLeadPhone.trim() || '+1 (555) 123-4567',
        company: callLeadCompany.trim() || 'Acme Corp',
      },
    };
    setCampaignKnowledge(updatedKnowledge);

    try {
      await saveCampaign(updatedKnowledge, nodes, edges);
    } catch (err) {
      console.warn('Auto-save error before starting call:', err);
    }

    setIsStartCallModalOpen(false);
    setIsLiveCallOpen(true);
    setIsRightPanelCollapsed(true);
  };

  // Store pristine initial layout for 1-click revert capability
  const pristineLayoutRef = useRef<{ nodes: CustomFlowNode[]; edges: CustomFlowEdge[] } | null>(null);

  // Synchronize when template prop updates (e.g. from prompt generator or template selection)
  React.useEffect(() => {
    if (template) {
      setCampaignKnowledge(template.knowledge);
      // Run dagre clean layout to ensure nodes are placed without overlaps
      const cleanlyLayouted = getLayoutedElements(template.initialNodes, template.initialEdges, 'TB');
      setNodes(cleanlyLayouted.nodes);
      setEdges(cleanlyLayouted.edges);
      pristineLayoutRef.current = {
        nodes: JSON.parse(JSON.stringify(cleanlyLayouted.nodes)),
        edges: JSON.parse(JSON.stringify(cleanlyLayouted.edges)),
      };
      setSelectedNodeId(null);
      setTimeout(() => {
        if (rfInstance) {
          rfInstance.fitView({ padding: 0.18, duration: 400 });
        }
      }, 100);
    }
  }, [template, setNodes, setEdges, rfInstance]);

  const selectedNode = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) || null,
    [nodes, selectedNodeId]
  );

  // Node Duplication Handler
  const handleDuplicateNode = useCallback(
    (nodeId?: string) => {
      const targetId = nodeId || selectedNodeId;
      if (!targetId) return;
      const target = nodes.find((n) => n.id === targetId);
      if (!target) return;

      const newId = `node-${target.data.type}-${Date.now().toString().slice(-4)}`;
      const clonedData = JSON.parse(JSON.stringify(target.data));

      if (clonedData.label) {
        clonedData.label = `${clonedData.label} (Copy)`;
      }
      if (clonedData.type === 'scenarioBranch' && Array.isArray(clonedData.branches)) {
        clonedData.branches = clonedData.branches.map((b: any, idx: number) => ({
          ...b,
          id: `branch-dup-${Date.now().toString().slice(-4)}-${idx}`,
          targetHandle: `handle-dup-${Date.now().toString().slice(-4)}-${idx}`,
        }));
      }

      const newNode: CustomFlowNode = {
        ...target,
        id: newId,
        position: {
          x: target.position.x + 50,
          y: target.position.y + 50,
        },
        data: clonedData,
        selected: true,
      };

      setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), newNode]);
      setSelectedNodeId(newId);
      showToast(`Duplicated "${target.data.label || 'Node'}"`);
    },
    [selectedNodeId, nodes, setNodes, showToast]
  );

  // Delete node
  const handleDeleteNode = useCallback(
    (nodeId: string) => {
      setNodes((nds) => nds.filter((n) => n.id !== nodeId));
      setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
      if (selectedNodeId === nodeId) setSelectedNodeId(null);
    },
    [selectedNodeId, setNodes, setEdges]
  );

  // Global Keyboard Shortcuts (Ctrl+C, Ctrl+V, Ctrl+D, Delete)
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = document.activeElement?.tagName?.toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea' || activeTag === 'select') {
        return;
      }

      const isCtrlOrCmd = e.ctrlKey || e.metaKey;

      // Duplicate: Ctrl+D
      if (isCtrlOrCmd && e.key.toLowerCase() === 'd') {
        if (selectedNodeId) {
          e.preventDefault();
          handleDuplicateNode(selectedNodeId);
        }
        return;
      }

      // Copy: Ctrl+C
      if (isCtrlOrCmd && e.key.toLowerCase() === 'c') {
        if (selectedNodeId) {
          const target = nodes.find((n) => n.id === selectedNodeId);
          if (target) {
            e.preventDefault();
            copiedNodeRef.current = target;
            showToast(`Copied "${target.data.label || 'Node'}" (Press Ctrl+V to paste)`);
          }
        }
        return;
      }

      // Paste: Ctrl+V
      if (isCtrlOrCmd && e.key.toLowerCase() === 'v') {
        if (copiedNodeRef.current) {
          e.preventDefault();
          const target = copiedNodeRef.current;
          const newId = `node-${target.data.type}-${Date.now().toString().slice(-4)}`;
          const clonedData = JSON.parse(JSON.stringify(target.data));
          if (clonedData.label) clonedData.label = `${clonedData.label} (Copy)`;

          const newNode: CustomFlowNode = {
            ...target,
            id: newId,
            position: {
              x: target.position.x + 60,
              y: target.position.y + 60,
            },
            data: clonedData,
            selected: true,
          };

          setNodes((nds) => [...nds.map((n) => ({ ...n, selected: false })), newNode]);
          setSelectedNodeId(newId);
          copiedNodeRef.current = {
            ...copiedNodeRef.current,
            position: { x: target.position.x + 60, y: target.position.y + 60 },
          };
          showToast(`Pasted "${newNode.data.label}"`);
        }
        return;
      }

      // Delete / Backspace
      if (e.key === 'Delete' || e.key === 'Backspace') {
        if (selectedNodeId) {
          e.preventDefault();
          handleDeleteNode(selectedNodeId);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedNodeId, nodes, handleDuplicateNode, handleDeleteNode, setNodes, showToast]);

  const knowledgeStatus = useMemo(() => {
    const items = campaignKnowledge.knowledgeItems || [];
    const approved = items.filter((item) => item.status === 'approved').length;
    const drafts = items.filter((item) => item.status === 'draft').length;
    if (items.length === 0) return 'No knowledge added';
    if (approved === 0) return `${drafts} draft item${drafts === 1 ? '' : 's'}`;
    return `${approved} approved item${approved === 1 ? '' : 's'}${drafts ? ` · ${drafts} draft` : ''}`;
  }, [campaignKnowledge.knowledgeItems]);

  // Connect edges
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdgeId = `edge-${Date.now()}`;
      const newEdge: CustomFlowEdge = {
        ...params,
        id: newEdgeId,
        type: 'condition',
        data: {
          label: 'Next Step',
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
      // Immediately open in-canvas inline editing for this connection!
      setEditingEdgeId(newEdgeId);
    },
    [setEdges]
  );

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Update node data (live 2-way sync)
  const handleUpdateNodeData = (nodeId: string, updatedFields: Partial<OutboundNodeData>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id === nodeId) {
          return {
            ...n,
            data: {
              ...n.data,
              ...updatedFields,
            } as OutboundNodeData,
          };
        }
        return n;
      })
    );
  };

  // Add an outgoing branch/edge from a node
  const handleAddBranchConnection = useCallback(
    (sourceNodeId: string, label: string, targetNodeId: string, isObjection = false) => {
      const edgeId = `edge-${sourceNodeId}-${Date.now().toString().slice(-4)}`;
      const newEdge: CustomFlowEdge = {
        id: edgeId,
        source: sourceNodeId,
        target: targetNodeId,
        type: 'condition',
        data: {
          label,
          isObjection,
        },
      };

      const updatedEdges = [...edges, newEdge];
      const layouted = getLayoutedElements(nodes, updatedEdges, 'TB');
      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);
      setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 400 }), 80);
    },
    [nodes, edges, rfInstance, setNodes, setEdges]
  );

  // Quick create a new node and connect it via branch
  const handleQuickCreateAndConnect = useCallback(
    (sourceNodeId: string, branchLabel: string, targetNodeType: OutboundNodeType, isObjection = false) => {
      const newId = `node-${targetNodeType}-${Date.now().toString().slice(-4)}`;
      let newNodeData: OutboundNodeData;

      switch (targetNodeType) {
        case 'knowledge':
          newNodeData = {
            type: 'knowledge',
            label: `Rebuttal: ${branchLabel.replace(/^If\s+/i, '')}`,
            objectionTopic: branchLabel.replace(/^If\s+/i, ''),
            rebuttalScript: 'I completely understand your concern! Let me address that directly.',
            returnToPrevious: true,
          };
          break;
        case 'action':
          newNodeData = {
            type: 'action',
            label: `Action: ${branchLabel.replace(/^If\s+/i, '')}`,
            actionType: branchLabel.toLowerCase().includes('sms') ? 'send_sms' : 'calendar_booking',
            actionConfig: {
              title: `${branchLabel} Triggered for {{lead_name}}`,
              crmTag: 'branch_action_executed',
            },
          };
          break;
        case 'question':
          newNodeData = {
            type: 'question',
            label: `Follow-up: ${branchLabel.replace(/^If\s+/i, '')}`,
            speechPrompt: 'Could you share a bit more detail on that?',
            allowBargeIn: true,
            maxWaitSeconds: 6,
          };
          break;
        case 'hangup':
          newNodeData = {
            type: 'hangup',
            label: `Exit: ${branchLabel.replace(/^If\s+/i, '')}`,
            closingScript: 'Thank you for your time. Have a great day!',
            disposition: branchLabel.toLowerCase().includes('not')
              ? 'disqualified_not_interested'
              : 'callback_scheduled',
            sendSummarySms: false,
          };
          break;
        default:
          newNodeData = {
            type: 'question',
            label: `Next Step: ${branchLabel}`,
            speechPrompt: 'How would you like to proceed?',
            allowBargeIn: true,
            maxWaitSeconds: 6,
          };
      }

      const sourceNode = nodes.find((n) => n.id === sourceNodeId);
      const newPosition = sourceNode
        ? { x: sourceNode.position.x, y: sourceNode.position.y + 200 }
        : { x: 350, y: 350 };

      const newNode: CustomFlowNode = {
        id: newId,
        type: targetNodeType,
        position: newPosition,
        data: newNodeData,
      };

      const newEdge: CustomFlowEdge = {
        id: `edge-${sourceNodeId}-${newId}`,
        source: sourceNodeId,
        target: newId,
        type: 'condition',
        data: {
          label: branchLabel,
          isObjection,
        },
      };

      const updatedNodes = [...nodes, newNode];
      const updatedEdges = [...edges, newEdge];
      const layouted = getLayoutedElements(updatedNodes, updatedEdges, 'TB');
      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);
      setSelectedNodeId(newId);
      setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 400 }), 80);
    },
    [nodes, edges, rfInstance, setNodes, setEdges]
  );

  // Update edge target
  const handleUpdateEdgeTarget = useCallback(
    (edgeId: string, newTargetId: string) => {
      const updatedEdges = edges.map((e) => (e.id === edgeId ? { ...e, target: newTargetId } : e));
      const layouted = getLayoutedElements(nodes, updatedEdges, 'TB');
      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);
      setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 400 }), 80);
    },
    [nodes, edges, rfInstance, setNodes, setEdges]
  );

  // Update edge label & optional color/objection
  const handleUpdateEdgeLabel = useCallback(
    (edgeId: string, newLabel: string, color?: string, isObjection?: boolean) => {
      setEdges((eds) =>
        eds.map((e) => {
          if (e.id === edgeId) {
            const nextData: any = { ...(e.data || {}), label: newLabel };
            if (color) nextData.color = color;
            if (isObjection !== undefined) nextData.isObjection = isObjection;
            return { ...e, data: nextData };
          }
          return e;
        })
      );
    },
    [setEdges]
  );

  // Delete edge
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      const updatedEdges = edges.filter((e) => e.id !== edgeId);
      setEdges(updatedEdges);
      if (editingEdgeId === edgeId) setEditingEdgeId(null);
    },
    [edges, editingEdgeId, setEdges]
  );

  // Add node
  const handleAddNode = (type: OutboundNodeType) => {
    const id = `node-${type}-${Date.now().toString().slice(-4)}`;
    let nodeData: OutboundNodeData;

    switch (type) {
      case 'greeting':
        nodeData = {
          type: 'greeting',
          label: 'Greeting & Intro',
          openingScript: 'Hello {{lead_name}}, this is {{agent_name}} calling from {{company}}.',
          voiceStyle: 'Professional',
        };
        break;
      case 'question':
        nodeData = {
          type: 'question',
          label: 'Follow-up Question',
          speechPrompt: 'Could you confirm if that still works for you?',
          variableToExtract: 'customer_preference',
          allowBargeIn: true,
          maxWaitSeconds: 6,
        };
        break;
      case 'scenarioBranch':
        nodeData = {
          type: 'scenarioBranch',
          label: 'Scenario Router',
          evaluationCriteria: 'Analyze lead response',
          branches: [
            {
              id: `b-${Date.now()}-1`,
              label: 'Yes / Accepted',
              description: 'Customer accepts offer',
              intentKey: 'accept',
              color: '#18181b',
              targetHandle: `h-acc-${Date.now()}`,
            },
            {
              id: `b-${Date.now()}-2`,
              label: 'No / Objection',
              description: 'Customer objects',
              intentKey: 'objection',
              color: '#d97706',
              targetHandle: `h-obj-${Date.now()}`,
            },
          ],
        };
        break;
      case 'knowledge':
        nodeData = {
          type: 'knowledge',
          label: 'Objection Rebuttal',
          objectionTopic: 'Timing Concern',
          rebuttalScript: 'Completely understand! We can keep it brief or send a calendar invite.',
          returnToPrevious: true,
        };
        break;
      case 'action':
        nodeData = {
          type: 'action',
          label: 'Calendar Webhook',
          actionType: 'calendar_booking',
          actionConfig: {
            title: 'Customer Appointment Booking',
            crmTag: 'demo_scheduled',
          },
        };
        break;
      case 'hangup':
        nodeData = {
          type: 'hangup',
          label: 'Wrap Up & Close',
          closingScript: 'Thank you for your time today! Have a great week.',
          disposition: 'meeting_booked',
          sendSummarySms: true,
        };
        break;
    }

    const newNode: CustomFlowNode = {
      id,
      type,
      position: { x: 300, y: 150 + nodes.length * 30 },
      data: nodeData,
    };

    setNodes((nds) => [...nds, newNode]);
    setSelectedNodeId(id);
  };

  // Auto Clean Layout (instant clean dynamic rearrangement)
  const handleAutoLayout = useCallback(() => {
    const layouted = getLayoutedElements(nodes, edges, 'TB');
    setNodes([...layouted.nodes]);
    setEdges([...layouted.edges]);
    setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 400 }), 60);
  }, [nodes, edges, rfInstance, setNodes, setEdges]);

  // Revert / Reset Layout (restores original clean template state or resets positions)
  const handleResetLayout = useCallback(() => {
    if (pristineLayoutRef.current) {
      setNodes(JSON.parse(JSON.stringify(pristineLayoutRef.current.nodes)));
      setEdges(JSON.parse(JSON.stringify(pristineLayoutRef.current.edges)));
    } else {
      const layouted = getLayoutedElements(nodes, edges, 'TB');
      setNodes([...layouted.nodes]);
      setEdges([...layouted.edges]);
    }
    setTimeout(() => rfInstance?.fitView({ padding: 0.18, duration: 400 }), 60);
  }, [nodes, edges, rfInstance, setNodes, setEdges]);

  // Prompt Refine: natural language prompt modification via WiseAI LLM
  const handlePromptRefine = async (promptText: string) => {
    const lower = promptText.toLowerCase();

    try {
      // Use LLM to generate spoken script tailored to prompt
      const scriptResponse = await callLlm([
        {
          role: 'system',
          content: 'You are an outbound phone call copywriter. In 1 or 2 concise conversational sentences, generate the exact spoken line the AI agent should speak based on the user instruction. Return ONLY the spoken speech.',
        },
        { role: 'user', content: promptText },
      ]);

      const cleanScript = scriptResponse.replace(/^["']|["']$/g, '').trim() || promptText;

      if (lower.includes('discount') || lower.includes('objection') || lower.includes('price') || lower.includes('rebuttal')) {
        const rebuttalId = `node-knowledge-${Date.now().toString().slice(-4)}`;
        const newNode: CustomFlowNode = {
          id: rebuttalId,
          type: 'knowledge',
          position: { x: 100, y: 550 },
          data: {
            type: 'knowledge',
            label: 'LLM Generated Rebuttal',
            objectionTopic: promptText,
            rebuttalScript: cleanScript,
            returnToPrevious: true,
          },
        };
        setNodes((nds) => [...nds, newNode]);
        setSelectedNodeId(rebuttalId);
        return;
      }

      if (lower.includes('sms') || lower.includes('text') || lower.includes('link') || lower.includes('calendar') || lower.includes('book')) {
        const actionId = `node-action-${Date.now().toString().slice(-4)}`;
        const newNode: CustomFlowNode = {
          id: actionId,
          type: 'action',
          position: { x: 700, y: 550 },
          data: {
            type: 'action',
            label: promptText,
            actionType: lower.includes('sms') ? 'send_sms' : 'calendar_booking',
            actionConfig: {
              title: cleanScript,
              crmTag: 'prompt_action_triggered',
            },
          },
        };
        setNodes((nds) => [...nds, newNode]);
        setSelectedNodeId(actionId);
        return;
      }

      const qId = `node-question-${Date.now().toString().slice(-4)}`;
      const newNode: CustomFlowNode = {
        id: qId,
        type: 'question',
        position: { x: 400, y: 400 },
        data: {
          type: 'question',
          label: 'LLM Prompt Step',
          speechPrompt: cleanScript,
          allowBargeIn: true,
          maxWaitSeconds: 6,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(qId);
    } catch (err) {
      console.warn('Refine LLM error, falling back to local creation:', err);
      const qId = `node-question-${Date.now().toString().slice(-4)}`;
      const newNode: CustomFlowNode = {
        id: qId,
        type: 'question',
        position: { x: 400, y: 400 },
        data: {
          type: 'question',
          label: 'Custom Step',
          speechPrompt: promptText,
          allowBargeIn: true,
          maxWaitSeconds: 6,
        },
      };
      setNodes((nds) => [...nds, newNode]);
      setSelectedNodeId(qId);
    }
  };

  // Export JSON
  const handleExport = () => {
    const dataStr =
      'data:text/json;charset=utf-8,' +
      encodeURIComponent(
        JSON.stringify({ campaignKnowledge, nodes, edges }, null, 2)
      );
    const a = document.createElement('a');
    a.href = dataStr;
    a.download = `${campaignKnowledge.campaignId}.json`;
    a.click();
    a.remove();
  };

  return (
    <div className="canvas-studio-page">
      {/* Studio Header */}
      <header className="canvas-header">
        <div className="canvas-header-left">
          <button className="btn-clean-back" onClick={onBackToTemplates}>
            <ArrowLeft size={14} /> Campaign setup
          </button>
          <div className="header-divider" />
          <WiseBrandLogo size="sm" showTagline={false} />
          <div className="header-divider" />
          <div className="header-campaign-info">
            <h2 className="header-campaign-title">{template.name}</h2>
            <span className="header-campaign-badge">
              Decision Flow Studio
            </span>
            <span className="header-campaign-badge">
              {knowledgeStatus}
            </span>
          </div>
        </div>

        <div className="canvas-header-right">
          <div className="add-step-menu-wrap">
            <button
              className="btn-clean-secondary"
              onClick={() => setIsAddStepMenuOpen((open) => !open)}
              aria-expanded={isAddStepMenuOpen}
            >
              <Plus size={14} /> Add step
            </button>
            {isAddStepMenuOpen && (
              <div className="add-step-menu">
                <button type="button" onClick={() => { handleAddNode('greeting'); setIsAddStepMenuOpen(false); }}>
                  <PhoneCall size={14} color="#0284C7" /> Opening Greeting
                </button>
                <button type="button" onClick={() => { handleAddNode('question'); setIsAddStepMenuOpen(false); }}>
                  <HelpCircle size={14} color="#4AADDE" /> Spoken Question
                </button>
                <button type="button" onClick={() => { handleAddNode('scenarioBranch'); setIsAddStepMenuOpen(false); }}>
                  <GitFork size={14} color="#8280FF" /> Scenario Router
                </button>
                <button type="button" onClick={() => { handleAddNode('knowledge'); setIsAddStepMenuOpen(false); }}>
                  <ShieldAlert size={14} color="#F59E0B" /> Campaign Rebuttal
                </button>
                <button type="button" onClick={() => { handleAddNode('action'); setIsAddStepMenuOpen(false); }}>
                  <Zap size={14} color="#10B981" /> Automated Action
                </button>
                <button type="button" onClick={() => { handleAddNode('hangup'); setIsAddStepMenuOpen(false); }}>
                  <PhoneOff size={14} color="#EF4444" /> Call Exit
                </button>
              </div>
            )}
          </div>

          <div className="header-divider" />

          <button
            className="btn-clean-secondary"
            onClick={handleAutoLayout}
            title="Auto-arrange graph cleanly without overlaps"
          >
            <LayoutGrid size={14} /> Auto Layout
          </button>

          <button
            className="btn-clean-secondary"
            onClick={handleResetLayout}
            title="Revert back to pristine clean layout"
          >
            <RotateCcw size={14} /> Reset Layout
          </button>

          <button
            className="btn-clean-secondary"
            onClick={handleExport}
            title="Export JSON"
          >
            <Download size={14} /> Export
          </button>

          {/* Primary Lock-In and Proceed to Call Button */}
          <button
            className="btn-clean-primary"
            onClick={() => {
              setCallLeadName(campaignKnowledge.leadProfile?.name || 'Prospective Client');
              setCallLeadPhone(campaignKnowledge.leadProfile?.phone || '+1 (555) 123-4567');
              setCallLeadCompany(campaignKnowledge.leadProfile?.company || 'Acme Corp');
              setIsStartCallModalOpen(true);
            }}
          >
            <PhoneCall size={14} />
            <span>Lock In & Test Voice Call →</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body: Canvas + Right Setup Panel */}
      <div className="canvas-studio-body">
        {/* Canvas Area */}
        <div className="canvas-area-wrapper" ref={reactFlowWrapper} style={{ position: 'relative' }}>
          <CanvasActionContext.Provider
            value={{
              updateEdgeLabel: handleUpdateEdgeLabel,
              deleteEdge: handleDeleteEdge,
              duplicateNode: handleDuplicateNode,
              editingEdgeId,
              setEditingEdgeId,
            }}
          >
            <ReactFlow
              nodes={displayNodes}
              edges={displayEdges}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onConnect={onConnect}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              onInit={(instance: any) => {
                setRfInstance(instance);
                setTimeout(() => {
                  instance.fitView({ padding: 0.18, duration: 350 });
                }, 60);
              }}
              nodeTypes={nodeTypes}
              edgeTypes={edgeTypes}
              fitView
              fitViewOptions={{ padding: 0.2 }}
              minZoom={0.2}
              maxZoom={2}
            >
              <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#cbd5e1" />
              <Controls className="clean-flow-controls" />
              <MiniMap
                className="clean-flow-minimap"
                nodeColor={() => '#4AADDE'}
                maskColor="rgba(255, 255, 255, 0.7)"
              />
            </ReactFlow>

            {/* Empty Canvas Starter Card */}
            {nodes.length === 0 && (
              <div
                style={{
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  backgroundColor: '#ffffff',
                  border: '1.5px dashed #cbd5e1',
                  borderRadius: '16px',
                  padding: '32px 40px',
                  textAlign: 'center',
                  maxWidth: '440px',
                  boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.05)',
                  zIndex: 10,
                }}
              >
                <div
                  style={{
                    width: 44,
                    height: 44,
                    borderRadius: '50%',
                    backgroundColor: '#f0fdf4',
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 12,
                  }}
                >
                  <Phone size={22} color="#10b981" />
                </div>
                <h3 style={{ fontSize: '17px', fontWeight: 700, color: '#0f172a', margin: '0 0 6px 0' }}>
                  Start Your Conversation
                </h3>
                <p style={{ fontSize: '13px', color: '#64748b', margin: '0 0 20px 0', lineHeight: 1.5 }}>
                  Begin by adding your opening greeting or first qualifying question. You can connect, label paths, and copy steps anytime.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn-clean-primary"
                    style={{ justifyContent: 'center', padding: '9px 16px' }}
                    onClick={() => handleAddNode('greeting')}
                  >
                    <Plus size={14} /> Add Opening Greeting
                  </button>
                  <button
                    type="button"
                    className="btn-clean-outline"
                    style={{ justifyContent: 'center', padding: '9px 16px' }}
                    onClick={() => handleAddNode('question')}
                  >
                    <Plus size={14} /> Add Question Step
                  </button>
                </div>
              </div>
            )}

            {/* Floating Selection Action Toolbar */}
            {selectedNode && (
              <div
                style={{
                  position: 'absolute',
                  bottom: '24px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#ffffff',
                  border: '1px solid #e2e8f0',
                  borderRadius: '30px',
                  padding: '6px 14px',
                  boxShadow: '0 8px 24px -4px rgba(0, 0, 0, 0.12), 0 4px 8px -2px rgba(0, 0, 0, 0.06)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  zIndex: 20,
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                <span style={{ color: '#475569', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  Step: <strong style={{ color: '#0f172a' }}>{selectedNode.data.label}</strong>
                </span>
                <div style={{ width: '1px', height: '16px', background: '#cbd5e1' }} />
                <button
                  type="button"
                  onClick={() => handleDuplicateNode(selectedNode.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    borderRadius: '20px',
                    border: '1px solid #cbd5e1',
                    background: '#f8fafc',
                    color: '#0f172a',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Duplicate step (Ctrl+D / Ctrl+C, Ctrl+V)"
                >
                  <Copy size={12} /> Duplicate (Ctrl+D)
                </button>
                <button
                  type="button"
                  onClick={() => handleDeleteNode(selectedNode.id)}
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '5px',
                    padding: '5px 10px',
                    borderRadius: '20px',
                    border: '1px solid #fecaca',
                    background: '#fef2f2',
                    color: '#ef4444',
                    fontSize: '11px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                  title="Delete step (Del)"
                >
                  <Trash2 size={12} /> Delete
                </button>
              </div>
            )}

            {/* Notification Toast */}
            {copiedToast && (
              <div
                style={{
                  position: 'absolute',
                  top: '20px',
                  left: '50%',
                  transform: 'translateX(-50%)',
                  backgroundColor: '#0f172a',
                  color: '#ffffff',
                  padding: '8px 16px',
                  borderRadius: '20px',
                  fontSize: '12px',
                  fontWeight: 600,
                  boxShadow: '0 8px 16px rgba(0,0,0,0.15)',
                  zIndex: 50,
                  pointerEvents: 'none',
                }}
              >
                {copiedToast}
              </div>
            )}
          </CanvasActionContext.Provider>
        </div>

        {/* Floating Toggle for Setup Panel */}
        <button
          type="button"
          className="panel-toggle-float-btn"
          onClick={() => setIsRightPanelCollapsed((prev) => !prev)}
          title={isRightPanelCollapsed ? 'Show Setup Panel' : 'Hide Setup Panel'}
        >
          <SlidersHorizontal size={13} />
          <span>{isRightPanelCollapsed ? 'Setup Panel' : 'Hide Panel'}</span>
        </button>

        {/* Live Call Floating Console */}
        <LiveCallConsole
          nodes={nodes}
          edges={edges}
          knowledge={campaignKnowledge}
          isOpen={isLiveCallOpen}
          autoStart={true}
          onClose={() => {
            setIsLiveCallOpen(false);
            setSimActiveNodeId(null);
            setSimActiveEdgeId(null);
            setIsRightPanelCollapsed(false);
          }}
          onActiveNodeChange={(nodeId) => setSimActiveNodeId(nodeId)}
          onActiveEdgeChange={(edgeId) => setSimActiveEdgeId(edgeId)}
          onUpdateKnowledge={(k) => setCampaignKnowledge(k)}
        />

        {/* Right Setup Panel */}
        {!isRightPanelCollapsed && (
          <RightSetupPanel
            nodes={nodes}
            edges={edges}
            selectedNode={selectedNode}
            knowledge={campaignKnowledge}
            onSelectNode={(nodeId) => {
              setSelectedNodeId(nodeId);
              const targetNode = nodes.find((n) => n.id === nodeId);
              if (targetNode && rfInstance) {
                rfInstance.setCenter(targetNode.position.x + 140, targetNode.position.y + 70, {
                  duration: 500,
                  zoom: 1.0,
                });
              }
            }}
            onUpdateNodeData={handleUpdateNodeData}
            onDeleteNode={handleDeleteNode}
            onAddBranchConnection={handleAddBranchConnection}
            onQuickCreateAndConnect={handleQuickCreateAndConnect}
            onUpdateEdgeTarget={handleUpdateEdgeTarget}
            onUpdateEdgeLabel={handleUpdateEdgeLabel}
            onDeleteEdge={handleDeleteEdge}
            onUpdateKnowledge={(k) => setCampaignKnowledge(k)}
            onPromptRefine={handlePromptRefine}
          />
        )}
      </div>

      {/* Start Call Simulation Modal */}
      {isStartCallModalOpen && (
        <div className="start-call-modal-overlay" onClick={() => setIsStartCallModalOpen(false)}>
          <div className="start-call-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="start-call-modal-header">
              <div>
                <h3 className="start-call-modal-title">Start Outbound Call Simulation</h3>
                <p className="start-call-modal-desc">
                  Simulate live voice conversation directly on this canvas with real-time decision graph path illumination.
                </p>
              </div>
              <button
                type="button"
                className="btn-icon-xs"
                onClick={() => setIsStartCallModalOpen(false)}
                style={{ background: '#f1f5f9', color: '#64748b', border: 'none', borderRadius: '6px', cursor: 'pointer', padding: '4px' }}
              >
                <X size={16} />
              </button>
            </div>

            <div className="start-call-modal-form">
              <div className="modal-input-row">
                <label>Lead / Contact Name</label>
                <input
                  type="text"
                  value={callLeadName}
                  onChange={(e) => setCallLeadName(e.target.value)}
                  placeholder="e.g. Prospective Client"
                />
              </div>

              <div className="modal-input-row">
                <label>Phone Number</label>
                <input
                  type="text"
                  value={callLeadPhone}
                  onChange={(e) => setCallLeadPhone(e.target.value)}
                  placeholder="e.g. +1 (555) 123-4567"
                />
              </div>

              <div className="modal-input-row">
                <label>Company / Organization</label>
                <input
                  type="text"
                  value={callLeadCompany}
                  onChange={(e) => setCallLeadCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                />
              </div>

              <div className="modal-call-banner">
                <Sparkles size={16} color="#16a34a" style={{ flexShrink: 0, marginTop: '2px' }} />
                <div>
                  <strong>Live In-Canvas Traversal:</strong>
                  <div>As you speak or type answers, the orchestrator will highlight each decision path and active node in real time.</div>
                </div>
              </div>
            </div>

            <div className="start-call-modal-actions">
              <button
                type="button"
                className="btn-clean-secondary"
                onClick={() => setIsStartCallModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-clean-primary"
                onClick={handleConfirmStartCall}
                style={{ background: '#10b981', borderColor: '#10b981' }}
              >
                <PhoneCall size={14} /> Start Call Simulation
              </button>
            </div>

            <div style={{ textAlign: 'center', marginTop: '14px', fontSize: '11.5px', color: '#94a3b8' }}>
              Want full-screen mode instead?{' '}
              <button
                type="button"
                onClick={() => {
                  setIsStartCallModalOpen(false);
                  onProceedToCall(nodes, edges, campaignKnowledge);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  textDecoration: 'underline',
                  cursor: 'pointer',
                  fontSize: '11.5px',
                  fontWeight: 600,
                  padding: 0,
                }}
              >
                Open Full Screen Voice Call Page →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
