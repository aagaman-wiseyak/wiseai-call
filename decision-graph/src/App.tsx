import React, { useRef, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import {
  CustomFlowNode,
  CustomFlowEdge,
  CampaignKnowledge,
} from './types/flow';
import { CAMPAIGN_TEMPLATES, CampaignTemplate } from './templates/campaignTemplates';
import { TemplateHub } from './components/templates/TemplateHub';
import { CanvasStudio } from './components/studio/CanvasStudio';
import { VoiceCallPage } from './components/call/VoiceCallPage';
import { saveCampaign } from './utils/campaignClient';
import { CampaignWorkspace } from './components/workspace/CampaignWorkspace';
import { generateDecisionGraphWithLlm } from './utils/llmClient';

type AppStage = 'templates' | 'workspace' | 'canvas' | 'voice_call';

export default function App() {
  const [stage, setStage] = useState<AppStage>('templates');
  const [currentTemplate, setCurrentTemplate] = useState<CampaignTemplate>(CAMPAIGN_TEMPLATES[0]);

  // Active Flow State (carried from Canvas into Voice Call)
  const [activeNodes, setActiveNodes] = useState<CustomFlowNode[]>(CAMPAIGN_TEMPLATES[0].initialNodes);
  const [activeEdges, setActiveEdges] = useState<CustomFlowEdge[]>(CAMPAIGN_TEMPLATES[0].initialEdges);
  const [activeKnowledge, setActiveKnowledge] = useState<CampaignKnowledge>(CAMPAIGN_TEMPLATES[0].knowledge);
  const [knowledgeSaveStatus, setKnowledgeSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const knowledgeSaveTimer = useRef<number | null>(null);

  const handleUpdateKnowledge = (knowledge: CampaignKnowledge) => {
    setActiveKnowledge(knowledge);
    setKnowledgeSaveStatus('saving');
    if (knowledgeSaveTimer.current) window.clearTimeout(knowledgeSaveTimer.current);
    knowledgeSaveTimer.current = window.setTimeout(async () => {
      try {
        await saveCampaign(knowledge, activeNodes, activeEdges);
        setKnowledgeSaveStatus('saved');
      } catch (error) {
        console.error('Campaign handbook save failed:', error);
        setKnowledgeSaveStatus('error');
      }
    }, 600);
  };

  // 1. SELECT TEMPLATE (from Hub)
  const handleSelectTemplate = (template: CampaignTemplate) => {
    setCurrentTemplate(template);
    setActiveNodes(template.initialNodes);
    setActiveEdges(template.initialEdges);
    setActiveKnowledge(template.knowledge);
    setStage('workspace');
  };

  // 2. START BLANK
  const handleStartBlank = () => {
    const blankTemplate: CampaignTemplate = {
      id: `custom-campaign-${Date.now()}`,
      name: 'Custom Outbound Campaign',
      tagline: 'Custom conversational decision tree',
      category: 'Custom Campaign',
      knowledge: {
        campaignId: `custom-campaign-${Date.now()}`,
        campaignName: 'New Campaign',
        description: 'Custom outbound voice workflow',
        agentPersona: {
          name: 'Alex',
          role: 'Voice Assistant',
          company: 'My Company',
          tone: 'friendly_professional',
          speakingRate: 1.0,
          voice: 'en-US-Standard-C',
        },
        leadProfile: {
          name: 'Prospective Client',
          company: 'Acme Corp',
          phone: '+1 (555) 123-4567',
          email: 'client@example.com',
          attributes: {},
        },
        complianceNotice: 'This call is recorded for quality assurance.',
        globalObjections: [],
        faqs: [],
        knowledgeItems: [],
      },
      initialNodes: [],
      initialEdges: [],
    };

    handleSelectTemplate(blankTemplate);
  };

  // 3. PROCEED TO VOICE CALL (Lock in canvas state)
  const handleProceedToCall = async (
    nodes: CustomFlowNode[],
    edges: CustomFlowEdge[],
    knowledge: CampaignKnowledge
  ) => {
    try {
      await saveCampaign(knowledge, nodes, edges);
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'Campaign could not be saved.');
      return;
    }
    setActiveNodes(nodes);
    setActiveEdges(edges);
    setActiveKnowledge(knowledge);
    setStage('voice_call');
  };

  const handleGenerateDraft = async () => {
    try {
      const generated = await generateDecisionGraphWithLlm(activeKnowledge.description, activeKnowledge);
      setCurrentTemplate((previous) => ({
        ...previous,
        name: activeKnowledge.campaignName || generated.name,
        tagline: activeKnowledge.description || generated.tagline,
        knowledge: activeKnowledge,
        initialNodes: generated.nodes,
        initialEdges: generated.edges,
      }));
      setActiveNodes(generated.nodes);
      setActiveEdges(generated.edges);
      setStage('canvas');
    } catch (error) {
      window.alert(error instanceof Error ? error.message : 'AI could not generate a draft. Please try again.');
    }
  };

  return (
    <div className="app-root-container">
      {stage === 'templates' && (
        <TemplateHub
          onSelectCampaign={handleSelectTemplate}
          onStartBlank={handleStartBlank}
        />
      )}

      {stage === 'canvas' && (
        <ReactFlowProvider>
          <CanvasStudio
            key={currentTemplate.id}
            template={{
              ...currentTemplate,
              initialNodes: activeNodes,
              initialEdges: activeEdges,
              knowledge: activeKnowledge,
            }}
            onBackToTemplates={() => setStage('workspace')}
            onProceedToCall={handleProceedToCall}
          />
        </ReactFlowProvider>
      )}

      {stage === 'workspace' && (
        <CampaignWorkspace
          template={currentTemplate}
          knowledge={activeKnowledge}
          onUpdateKnowledge={handleUpdateKnowledge}
          onBack={() => setStage('templates')}
          onOpenStudio={() => setStage('canvas')}
          onGenerateDraft={handleGenerateDraft}
          saveStatus={knowledgeSaveStatus}
        />
      )}

      {stage === 'voice_call' && (
        <VoiceCallPage
          nodes={activeNodes}
          edges={activeEdges}
          knowledge={activeKnowledge}
          onBackToCanvas={() => setStage('workspace')}
        />
      )}
    </div>
  );
}
