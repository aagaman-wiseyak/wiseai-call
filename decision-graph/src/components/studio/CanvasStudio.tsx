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
} from 'lucide-react';
import { WiseBrandLogo } from '../brand/WiseBrandLogo';

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

  // Connect edges
  const onConnect = useCallback(
    (params: Connection) => {
      const newEdge: CustomFlowEdge = {
        ...params,
        id: `edge-${Date.now()}`,
        type: 'condition',
        data: {
          label: 'Next Step',
        },
      };
      setEdges((eds) => addEdge(newEdge, eds));
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

  const handleDeleteNode = (nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    if (selectedNodeId === nodeId) setSelectedNodeId(null);
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

  // Update edge label
  const handleUpdateEdgeLabel = useCallback(
    (edgeId: string, newLabel: string) => {
      setEdges((eds) =>
        eds.map((e) =>
          e.id === edgeId ? { ...e, data: { ...(e.data || {}), label: newLabel } } : e
        )
      );
    },
    [setEdges]
  );

  // Delete edge
  const handleDeleteEdge = useCallback(
    (edgeId: string) => {
      const updatedEdges = edges.filter((e) => e.id !== edgeId);
      setEdges(updatedEdges);
    },
    [setEdges]
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
            <ArrowLeft size={14} /> Templates
          </button>
          <div className="header-divider" />
          <WiseBrandLogo size="sm" showTagline={false} />
          <div className="header-divider" />
          <div className="header-campaign-info">
            <h2 className="header-campaign-title">{template.name}</h2>
            <span className="header-campaign-badge">
              Decision Flow Studio
            </span>
          </div>
        </div>

        <div className="canvas-header-right">
          {/* Quick Node Addition Buttons */}
          <div className="quick-add-group">
            <button
              className="btn-quick-add"
              onClick={() => handleAddNode('question')}
              title="Add Question Node"
            >
              <HelpCircle size={13} color="#4AADDE" />
              <span>Question</span>
            </button>
            <button
              className="btn-quick-add"
              onClick={() => handleAddNode('scenarioBranch')}
              title="Add Scenario Router"
            >
              <GitFork size={13} color="#8280FF" />
              <span>Branch</span>
            </button>
            <button
              className="btn-quick-add"
              onClick={() => handleAddNode('knowledge')}
              title="Add Objection Rebuttal"
            >
              <ShieldAlert size={13} color="#F59E0B" />
              <span>Rebuttal</span>
            </button>
            <button
              className="btn-quick-add"
              onClick={() => handleAddNode('action')}
              title="Add Action Trigger"
            >
              <Zap size={13} color="#10B981" />
              <span>Action</span>
            </button>
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
            onClick={() => onProceedToCall(nodes, edges, campaignKnowledge)}
          >
            <PhoneCall size={14} />
            <span>Lock In & Test Voice Call →</span>
          </button>
        </div>
      </header>

      {/* Main Studio Body: Canvas + Right Setup Panel */}
      <div className="canvas-studio-body">
        {/* Canvas Area */}
        <div className="canvas-area-wrapper" ref={reactFlowWrapper}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
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
        </div>

        {/* Right Setup Panel */}
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
      </div>
    </div>
  );
};
