import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  CustomFlowNode,
  CustomFlowEdge,
  CampaignKnowledge,
} from '../../types/flow';
import {
  telephoneAudio,
  speakText,
  stopSpeech,
  initTTSWebSocket,
  disconnectTTSWebSocket,
} from '../../utils/speech';
import { VADAudioEngine } from '../../utils/vadRecorder';
import confetti from 'canvas-confetti';
import {
  PhoneCall,
  PhoneOff,
  Send,
  Volume2,
  VolumeX,
  X,
  Sparkles,
  Maximize2,
  Minimize2,
  Clock,
  CheckCircle2,
  Activity,
  Bot,
  User,
  Radio,
  Mic,
  MicOff,
  Loader2,
} from 'lucide-react';

export interface LiveCallConsoleProps {
  nodes: CustomFlowNode[];
  edges: CustomFlowEdge[];
  knowledge: CampaignKnowledge;
  isOpen: boolean;
  autoStart?: boolean;
  onClose: () => void;
  onActiveNodeChange: (nodeId: string | null) => void;
  onActiveEdgeChange: (edgeId: string | null) => void;
  onUpdateKnowledge?: (k: CampaignKnowledge) => void;
}

interface SimulationMessage {
  id: string;
  speaker: 'agent' | 'user' | 'system';
  text: string;
  timestamp: string;
  intentMatched?: string;
  nodeId?: string;
}

export const LiveCallConsole: React.FC<LiveCallConsoleProps> = ({
  nodes,
  edges,
  knowledge,
  isOpen,
  autoStart = false,
  onClose,
  onActiveNodeChange,
  onActiveEdgeChange,
}) => {
  // Call status
  const [callStatus, setCallStatus] = useState<'idle' | 'ringing' | 'connected' | 'ended'>('idle');
  const [callDuration, setCallDuration] = useState(0);
  const [disposition, setDisposition] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isMinimized, setIsMinimized] = useState(false);
  const [lastTraversalUpdate, setLastTraversalUpdate] = useState<{
    userUtterance: string;
    pathLabel: string;
    targetNodeLabel: string;
  } | null>(null);

  // Transcript & speech
  const [transcript, setTranscript] = useState<SimulationMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [isAiSpeaking, setIsAiSpeaking] = useState(false);
  const [isRouting, setIsRouting] = useState(false);
  const [activeStreamingMsgId, setActiveStreamingMsgId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [variables, setVariables] = useState<Record<string, any>>({
    lead_name: knowledge.leadProfile?.name || 'Prospect',
    company: knowledge.leadProfile?.company || 'Company',
    phone: knowledge.leadProfile?.phone || '',
    ...(knowledge.leadProfile?.attributes || {}),
  });
  const [conversationState, setConversationState] = useState<Record<string, unknown>>({});

  // Microphone & ASR states
  const [micEnabled, setMicEnabled] = useState(true);
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [userVoiceLevel, setUserVoiceLevel] = useState(0);

  const vadEngineRef = useRef<VADAudioEngine | null>(null);
  const isAiSpeakingRef = useRef(false);
  const callStatusRef = useRef(callStatus);
  const isRoutingRef = useRef(isRouting);
  const timerRef = useRef<any>(null);
  const streamIntervalRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const activeNodeIdRef = useRef<string | null>(null);
  const nodesRef = useRef(nodes);
  nodesRef.current = nodes;
  const edgesRef = useRef(edges);
  edgesRef.current = edges;

  useEffect(() => {
    isAiSpeakingRef.current = isAiSpeaking;
  }, [isAiSpeaking]);

  useEffect(() => {
    callStatusRef.current = callStatus;
  }, [callStatus]);

  useEffect(() => {
    isRoutingRef.current = isRouting;
  }, [isRouting]);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [transcript, streamingText, isRouting]);

  // Call timer
  useEffect(() => {
    if (callStatus === 'connected') {
      timerRef.current = setInterval(() => {
        setCallDuration((d) => d + 1);
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [callStatus]);

  // Pre-warm Persistent TTS WebSocket when console opens
  useEffect(() => {
    if (isOpen) {
      initTTSWebSocket();
    }
    return () => {
      stopSpeech();
      disconnectTTSWebSocket();
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      if (vadEngineRef.current) {
        vadEngineRef.current.stop();
        vadEngineRef.current = null;
      }
    };
  }, [isOpen]);

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60).toString().padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Interpolate variables
  const interpolate = (text: string, currentVars: Record<string, any>) => {
    let res = text || '';
    Object.entries(currentVars).forEach(([k, v]) => {
      res = res.replace(new RegExp(`{{${k}}}`, 'g'), String(v ?? ''));
    });
    return res;
  };

  // Stream words into the active message bubble
  const streamWords = (msgId: string, fullText: string, onFinish?: () => void) => {
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);

    const sanitized = fullText.trim();
    if (!sanitized || [']', '}', '{}', '[]', 'null', 'None'].includes(sanitized)) {
      setActiveStreamingMsgId(null);
      setStreamingText('');
      if (onFinish) onFinish();
      return;
    }

    setActiveStreamingMsgId(msgId);
    setStreamingText('');
    const words = sanitized.split(' ');
    let currentIdx = 0;
    const stepMs = Math.max(30, Math.min(65, 2200 / Math.max(words.length, 1)));

    streamIntervalRef.current = setInterval(() => {
      currentIdx++;
      const currentChunk = words.slice(0, currentIdx).join(' ');
      setStreamingText(currentChunk);

      if (currentIdx >= words.length) {
        clearInterval(streamIntervalRef.current);
        streamIntervalRef.current = null;
        setActiveStreamingMsgId(null);
        setStreamingText('');

        setTranscript((prev) =>
          prev.map((m) => (m.id === msgId ? { ...m, text: sanitized } : m))
        );
        if (onFinish) onFinish();
      }
    }, stepMs);
  };

  // Execute conversational node on graph
  const executeNode = useCallback((node: CustomFlowNode, currentVars = variables, overrideSpeech?: string) => {
    // If scenarioBranch, traverse directly to downstream target
    if (node.data.type === 'scenarioBranch') {
      const branchEdge = edgesRef.current.find((e) => e.source === node.id);
      if (branchEdge) {
        const targetNode = nodesRef.current.find((n) => n.id === branchEdge.target);
        if (targetNode) {
          executeNode(targetNode, currentVars, overrideSpeech);
          return;
        }
      }
    }

    activeNodeIdRef.current = node.id;
    onActiveNodeChange(node.id);
    setIsAiSpeaking(true);

    let scriptToSpeak = '';
    const nodeData = node.data as any;

    if (overrideSpeech && overrideSpeech.trim() && ![']', '}', '{}', '[]', 'null', 'None'].includes(overrideSpeech.trim())) {
      const cleanOverride = overrideSpeech.trim();
      const nodePrompt = node.data.type === 'question' ? (nodeData.speechPrompt || '') :
        node.data.type === 'greeting' ? (nodeData.openingScript || '') :
          node.data.type === 'knowledge' ? (nodeData.rebuttalScript || '') :
            node.data.type === 'hangup' ? (nodeData.closingScript || '') : '';

      // If override is just an acknowledgment bridge without the node's question, deliver the node's options and prompt
      if (nodePrompt && !cleanOverride.includes('?') && nodePrompt.includes('?')) {
        scriptToSpeak = interpolate(`${cleanOverride.replace(/[.!?]+$/, '')}. ${nodePrompt}`, currentVars);
      } else {
        scriptToSpeak = interpolate(cleanOverride, currentVars);
      }
    } else if (node.data.type === 'greeting') {
      scriptToSpeak = interpolate(nodeData.openingScript || 'Hello!', currentVars);
    } else if (node.data.type === 'question') {
      scriptToSpeak = interpolate(nodeData.speechPrompt || '', currentVars);
    } else if (node.data.type === 'knowledge') {
      scriptToSpeak = interpolate(nodeData.rebuttalScript || '', currentVars);
    } else if (node.data.type === 'action') {
      scriptToSpeak = `Confirming your ${nodeData.label || 'selection'} right now.`;
    } else if (node.data.type === 'hangup') {
      scriptToSpeak = interpolate(nodeData.closingScript || 'Thank you for your time. Have a great day!', currentVars);
    }

    const cleanScript = scriptToSpeak.trim();
    if (!cleanScript || [']', '}', '{}', '[]'].includes(cleanScript)) {
      setIsAiSpeaking(false);
      handlePostSpeech(node, currentVars);
      return;
    }

    const msgId = `msg-${Date.now()}`;
    const msg: SimulationMessage = {
      id: msgId,
      speaker: node.data.type === 'action' ? 'system' : 'agent',
      text: '',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      nodeId: node.id,
    };

    setTranscript((prev) => [...prev, msg]);
    streamWords(msgId, cleanScript);

    if (audioEnabled && node.data.type !== 'action') {
      speakText(cleanScript, knowledge.agentPersona?.speakingRate || 1.0, 1.0, () => {
        setIsAiSpeaking(false);
        handlePostSpeech(node, currentVars);
      });
    } else {
      setTimeout(() => {
        setIsAiSpeaking(false);
        handlePostSpeech(node, currentVars);
      }, 1200);
    }
  }, [audioEnabled, knowledge, onActiveNodeChange]);

  // Handle post speech action execution & hangup
  const handlePostSpeech = useCallback((node: CustomFlowNode, currentVars: Record<string, any>) => {
    if (node.data.type === 'action') {
      const nextEdge = edgesRef.current.find((e) => e.source === node.id);
      if (nextEdge) {
        const nextNode = nodesRef.current.find((n) => n.id === nextEdge.target);
        if (nextNode) {
          onActiveEdgeChange(nextEdge.id);
          setTimeout(() => {
            executeNode(nextNode, currentVars);
          }, 800);
          return;
        }
      }
    } else if (node.data.type === 'hangup') {
      const disp = (node.data as any).disposition || 'completed';
      setCallStatus('ended');
      setDisposition(disp);
      telephoneAudio.playHangup();

      if (disp === 'meeting_booked') {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }
    }
  }, [executeNode, onActiveEdgeChange]);

  // Start Call
  const handleStartCall = useCallback(() => {
    stopSpeech();
    telephoneAudio.startRingback();
    setConversationState({});
    setCallStatus('ringing');
    setCallDuration(0);
    setDisposition(null);
    setLastTraversalUpdate(null);

    const initialVars = {
      lead_name: knowledge.leadProfile?.name || 'Prospect',
      company: knowledge.leadProfile?.company || 'Company',
      phone: knowledge.leadProfile?.phone || '',
      ...(knowledge.leadProfile?.attributes || {}),
    };
    setVariables(initialVars);

    setTranscript([
      {
        id: `sys-${Date.now()}`,
        speaker: 'system',
        text: `Dialing ${initialVars.lead_name} (${initialVars.phone})...`,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);

    setTimeout(() => {
      telephoneAudio.stopRingback();
      telephoneAudio.playConnect();

      setCallStatus('connected');
      setTranscript((prev) => [
        ...prev,
        {
          id: `sys-pickup-${Date.now()}`,
          speaker: 'system',
          text: `[Call Connected] ${initialVars.lead_name} answered.`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ]);

      const greetingNode = nodes.find((n) => n.data.type === 'greeting') || nodes[0];
      if (greetingNode) {
        executeNode(greetingNode, initialVars);
      }
    }, 1600);
  }, [executeNode, knowledge, nodes]);

  // Auto-start call when opened with autoStart = true
  useEffect(() => {
    if (isOpen && autoStart && callStatus === 'idle') {
      const timer = setTimeout(() => {
        handleStartCall();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [isOpen, autoStart, callStatus, handleStartCall]);

  // End Call
  const handleEndCall = () => {
    stopSpeech();
    telephoneAudio.stopRingback();
    telephoneAudio.playHangup();

    if (vadEngineRef.current) {
      vadEngineRef.current.stop();
      vadEngineRef.current = null;
    }

    setCallStatus('ended');
    setDisposition((prev) => prev || 'call_ended_manually');
    onActiveNodeChange(null);
    onActiveEdgeChange(null);

    setTranscript((prev) => [
      ...prev,
      {
        id: `sys-end-${Date.now()}`,
        speaker: 'system',
        text: '[Call Ended]',
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
  };

  // Process User Input Turn
  const handleSendUserMessage = async (textToSend: string) => {
    const userText = textToSend.trim();
    if (!userText || isRouting || callStatus !== 'connected') return;

    setInputText('');
    stopSpeech();

    const userMsg: SimulationMessage = {
      id: `usr-${Date.now()}`,
      speaker: 'user',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newTranscript = [...transcript, userMsg];
    setTranscript(newTranscript);
    setIsRouting(true);

    try {
      const response = await fetch('/api/call/process-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_text: userText,
          current_node_id: activeNodeIdRef.current,
          nodes: nodes,
          edges: edges,
          campaign_knowledge: knowledge,
          conversation_history: newTranscript,
          conversation_state: conversationState,
          variables: variables,
          language: 'eng',
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setIsRouting(false);
        setConversationState(result.conversation_state || {});

        const updatedVars = result.updated_variables || variables;
        setVariables(updatedVars);

        // 1. REPEAT QUESTION, KNOWLEDGE LOOKUP, OR IN-PLACE CLARIFICATION
        const staysOnCurrentNode = result.next_node_id === activeNodeIdRef.current;
        if (
          result.knowledge_invoked ||
          result.intent_matched === 'repeated_question' ||
          (staysOnCurrentNode && result.ai_response_text)
        ) {
          const replyId = `ai-reply-${Date.now()}`;
          const label = result.knowledge_topic
            ? `Knowledge: ${result.knowledge_topic}`
            : result.intent_matched === 'repeated_question'
              ? 'Question Repeated'
              : 'Clarification';

          const replyMsg: SimulationMessage = {
            id: replyId,
            speaker: 'agent',
            text: '',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            intentMatched: label,
            nodeId: activeNodeIdRef.current || undefined,
          };

          setTranscript([...newTranscript, replyMsg]);
          setIsAiSpeaking(true);
          streamWords(replyId, result.ai_response_text);

          if (audioEnabled) {
            speakText(result.ai_response_text, knowledge.agentPersona?.speakingRate || 1.0, 1.0, () => {
              setIsAiSpeaking(false);
            });
          } else {
            setTimeout(() => setIsAiSpeaking(false), 1200);
          }
          return;
        }

        // 2. ROUTING TO NEXT NODE
        if (result.next_node_id && result.next_node_id !== activeNodeIdRef.current) {
          const nextNode = nodes.find((n) => n.id === result.next_node_id);
          if (nextNode) {
            // Find traversed edge and activate it for real-time visual path traversal
            const edgeBetween = edges.find(
              (e) => (e.source === activeNodeIdRef.current && e.target === result.next_node_id) ||
                (e.target === result.next_node_id)
            );
            const edgeLabel = (edgeBetween?.data as any)?.label || result.intent_matched || 'Next Step';
            if (edgeBetween) {
              onActiveEdgeChange(edgeBetween.id);
            }

            setLastTraversalUpdate({
              userUtterance: userText,
              pathLabel: edgeLabel,
              targetNodeLabel: (nextNode.data as any)?.label || 'Next Step',
            });

            // Annotate the user's transcript message with the matched condition path
            setTranscript((prev) =>
              prev.map((m) => (m.id === userMsg.id ? { ...m, intentMatched: `Path: ${edgeLabel}` } : m))
            );

            executeNode(nextNode, updatedVars, result.ai_response_text);
            return;
          }
        }
      }
    } catch (err) {
      console.warn('Turn processing error:', err);
    }

    setIsRouting(false);
  };

  // VAD Audio Engine for live speech-to-text (ASR)
  useEffect(() => {
    if (callStatus === 'connected' && micEnabled) {
      if (!vadEngineRef.current) {
        vadEngineRef.current = new VADAudioEngine({
          energyThreshold: 14,
          silenceDurationMs: 1100,
          onVoiceActivity: (level, speaking) => {
            if (isRoutingRef.current) {
              setUserVoiceLevel(0);
              setIsUserSpeaking(false);
              return;
            }

            // Real-Time Barge-In Check
            if (isAiSpeakingRef.current) {
              if (speaking && level > 16) {
                stopSpeech();
                if (streamIntervalRef.current) {
                  clearInterval(streamIntervalRef.current);
                  streamIntervalRef.current = null;
                }
                setActiveStreamingMsgId(null);
                setStreamingText('');
                setIsAiSpeaking(false);
                setUserVoiceLevel(level);
                setIsUserSpeaking(true);
                return;
              }
              setUserVoiceLevel(0);
              setIsUserSpeaking(false);
              return;
            }

            setUserVoiceLevel(level);
            setIsUserSpeaking(speaking);
          },
          onSpeechStart: () => {
            if (isRoutingRef.current) return;
            if (isAiSpeakingRef.current) {
              stopSpeech();
              if (streamIntervalRef.current) {
                clearInterval(streamIntervalRef.current);
                streamIntervalRef.current = null;
              }
              setActiveStreamingMsgId(null);
              setStreamingText('');
              setIsAiSpeaking(false);
            }
            setIsUserSpeaking(true);
          },
          onSpeechEnd: async (wavBlob: Blob) => {
            if (callStatusRef.current !== 'connected' || isRoutingRef.current) return;

            setIsTranscribing(true);
            try {
              const formData = new FormData();
              formData.append('file', wavBlob, 'speech.wav');
              formData.append('language', (knowledge.agentPersona as any)?.language === 'nep' ? 'nep' : 'eng');

              const response = await fetch('/api/call/asr', {
                method: 'POST',
                body: formData,
              });

              if (response.ok) {
                const data = await response.json();
                const text = (data.text || '').trim();
                setIsTranscribing(false);
                setIsUserSpeaking(false);
                if (text && text.length > 1 && !text.toLowerCase().includes('nope')) {
                  handleSendUserMessage(text);
                }
              } else {
                setIsTranscribing(false);
                setIsUserSpeaking(false);
              }
            } catch (err) {
              console.warn('LiveCallConsole ASR request error:', err);
              setIsTranscribing(false);
              setIsUserSpeaking(false);
            }
          },
          onError: (err) => {
            console.warn('Microphone/VAD init error:', err);
          },
        });
        vadEngineRef.current.start();
      }
    } else {
      if (vadEngineRef.current) {
        vadEngineRef.current.stop();
        vadEngineRef.current = null;
      }
      setUserVoiceLevel(0);
      setIsUserSpeaking(false);
      setIsTranscribing(false);
    }

    return () => {
      if (vadEngineRef.current) {
        vadEngineRef.current.stop();
        vadEngineRef.current = null;
      }
    };
  }, [callStatus, micEnabled]);

  // Quick intent suggestions for testing
  const getQuickChips = () => {
    if (callStatus !== 'connected') return [];
    const currentNode = nodes.find((n) => n.id === activeNodeIdRef.current);
    if (!currentNode) return ['Yes, speaking', 'Could you repeat that?', 'I am busy right now'];

    const nodeId = currentNode.id;
    if (nodeId === 'node-greeting' || currentNode.data.type === 'greeting') {
      return ['Yes, speaking', 'No, this is someone else', 'I am busy right now'];
    }
    if (nodeId === 'node-q2-quick-chat') {
      return ['Yes, I have time', 'No, I am busy right now', 'What is this regarding?'];
    }
    if (nodeId === 'node-q3-expiring-plan') {
      return ['Yes, interested in renewing', 'Not interested in renewal', 'How much does it cost?'];
    }
    if (nodeId === 'node-q4-usage-discovery') {
      return ['Heavy gaming and 4K streaming', 'Light browsing and social media', 'Not sure, general family use'];
    }
    if (nodeId === 'node-q5-heavy-services') {
      return ['Ultra WiFi 6 400 Mbps', 'Pro WiFi 6 250 Mbps', 'Include ViaTV too'];
    }
    if (nodeId === 'node-q5-light-services') {
      return ['Samba Plus 100 Mbps', 'Mini 50 Mbps', 'Add ViaTV as well'];
    }
    if (nodeId === 'node-q5-general-services') {
      return ['Pro WiFi 6 250 Mbps', 'Samba Pro 200 Mbps', 'Sounds good'];
    }
    if (nodeId === 'node-q6-tv-services') {
      return ['Yes, add ViaTV for Rs. 3,000', 'Internet only, no TV', 'Tell me more about ViaTV'];
    }
    if (nodeId === 'node-q6-tv-details') {
      return ['Sounds good, add ViaTV', 'No thanks, just internet', 'What about 2 TVs?'];
    }
    if (nodeId === 'node-tv-bundle-added' || nodeId === 'node-tv-internet-only') {
      return ['Yes, send the link', 'Sounds good, go ahead'];
    }
    if (currentNode.data.type === 'knowledge') {
      return ['Okay, tell me more', 'Sounds fair, let us proceed', 'Still not interested'];
    }
    return ['Yes, sounds good', 'No thanks', 'How much does it cost?'];
  };

  if (!isOpen) return null;

  return (
    <aside className={`live-call-floating-console ${isMinimized ? 'minimized' : ''}`}>
      {/* Console Header */}
      <header className="live-call-header">
        <div className="call-header-status">
          <span className={`call-status-indicator ${callStatus}`}>
            <span className="status-dot" />
            {callStatus === 'idle' && 'READY TO CALL'}
            {callStatus === 'ringing' && 'DIALING...'}
            {callStatus === 'connected' && `LIVE ${formatDuration(callDuration)}`}
            {callStatus === 'ended' && `ENDED (${disposition || 'complete'})`}
          </span>
          <span className="caller-info-pill">
            <User size={11} /> {variables.lead_name}
          </span>
        </div>

        <div className="call-header-actions">
          <button
            type="button"
            className={`btn-icon-xs ${micEnabled ? 'active-mic' : 'muted-mic'}`}
            onClick={() => setMicEnabled(!micEnabled)}
            title={micEnabled ? 'Mute microphone (VAD ASR active)' : 'Enable microphone (VAD ASR)'}
          >
            {micEnabled ? <Mic size={14} /> : <MicOff size={14} />}
          </button>
          <button
            type="button"
            className="btn-icon-xs"
            onClick={() => setAudioEnabled(!audioEnabled)}
            title={audioEnabled ? 'Mute AI speech audio' : 'Enable AI speech audio'}
          >
            {audioEnabled ? <Volume2 size={14} /> : <VolumeX size={14} />}
          </button>
          <button
            type="button"
            className="btn-icon-xs"
            onClick={() => setIsMinimized(!isMinimized)}
            title={isMinimized ? 'Expand window' : 'Minimize window'}
          >
            {isMinimized ? <Maximize2 size={14} /> : <Minimize2 size={14} />}
          </button>
          <button
            type="button"
            className="btn-icon-xs text-danger"
            onClick={onClose}
            title="Close call window"
          >
            <X size={14} />
          </button>
        </div>
      </header>

      {!isMinimized && (
        <>
          {/* Active Call Controls Bar */}
          <div className="live-call-topbar">
            {callStatus === 'idle' && (
              <div className="pre-call-bar">
                <span className="pre-call-desc">
                  Simulating call with <strong>{knowledge.agentPersona?.name || 'Alex'}</strong> ({knowledge.agentPersona?.company || 'Company'})
                </span>
                <button
                  type="button"
                  className="btn-start-call-pill"
                  onClick={handleStartCall}
                >
                  <PhoneCall size={13} /> Start Call
                </button>
              </div>
            )}

            {callStatus === 'connected' && (
              <div className="in-call-bar">
                <div className="in-call-stats">
                  <Clock size={12} /> {formatDuration(callDuration)}
                  {isAiSpeaking && <span className="speaking-tag"><Activity size={12} className="pulse-icon" /> AI Speaking</span>}
                  {isRouting && <span className="routing-tag"><Radio size={12} className="spin-icon" /> Routing Path...</span>}
                </div>
                <button
                  type="button"
                  className="btn-end-call-pill"
                  onClick={handleEndCall}
                >
                  <PhoneOff size={13} /> End Call
                </button>
              </div>
            )}

            {callStatus === 'ended' && (
              <div className="post-call-bar">
                <span className="disposition-text">
                  <CheckCircle2 size={13} color="#10b981" /> Disposition: <strong>{disposition || 'Complete'}</strong>
                </span>
                <button
                  type="button"
                  className="btn-restart-call-pill"
                  onClick={handleStartCall}
                >
                  <PhoneCall size={12} /> Restart
                </button>
              </div>
            )}
          </div>

          {/* Real-Time Traversal Assignment Banner */}
          {lastTraversalUpdate && (
            <div className="live-call-traversal-banner" title="Real-time decision graph path assignment">
              <div className="traversal-pill-content">
                <span className="traversal-quote">"{lastTraversalUpdate.userUtterance}"</span>
                <span className="traversal-arrow">→</span>
                <span className="traversal-edge-pill">
                  <Sparkles size={11} /> {lastTraversalUpdate.pathLabel}
                </span>
                <span className="traversal-arrow">→</span>
                <span className="traversal-node-pill">{lastTraversalUpdate.targetNodeLabel}</span>
              </div>
            </div>
          )}

          {/* Transcript Scroll Area */}
          <div className="live-call-transcript">
            {transcript.length === 0 && (
              <div className="live-call-empty">
                <Bot size={28} />
                <h4>Call simulation ready</h4>
                <p>Click "Start Call" to dial. Watch the graph navigate and highlight the active path in real time as you talk.</p>
              </div>
            )}

            {transcript.map((msg) => {
              const isStreamingThis = activeStreamingMsgId === msg.id;
              const displayText = isStreamingThis ? streamingText : msg.text;

              if (msg.speaker === 'system') {
                return (
                  <div key={msg.id} className="live-transcript-system">
                    <span>{displayText}</span>
                  </div>
                );
              }

              const isAgent = msg.speaker === 'agent';
              return (
                <div key={msg.id} className={`live-transcript-bubble-wrap ${isAgent ? 'agent' : 'user'}`}>
                  <div className="bubble-header">
                    <span className="bubble-speaker">
                      {isAgent ? (knowledge.agentPersona?.name || 'Alex') : variables.lead_name}
                    </span>
                    <span className="bubble-time">{msg.timestamp}</span>
                  </div>
                  <div className="live-bubble">
                    <p>{displayText || (isStreamingThis ? '…' : '')}</p>
                    {msg.intentMatched && (
                      <span className="bubble-intent-pill">
                        <Sparkles size={10} /> {msg.intentMatched}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
            <div ref={transcriptEndRef} />
          </div>

          {/* Quick-Reply Intent Chips */}
          {callStatus === 'connected' && (
            <div className="live-quick-chips">
              <span className="chips-label">Quick test reply:</span>
              <div className="chips-scroll">
                {getQuickChips().map((chip) => (
                  <button
                    key={chip}
                    type="button"
                    className="chip-btn-sm"
                    onClick={() => handleSendUserMessage(chip)}
                  >
                    {chip}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Voice Activity / Transcribing Indicator */}
          {callStatus === 'connected' && (isUserSpeaking || isTranscribing) && (
            <div className="live-call-speech-indicator">
              {isTranscribing ? (
                <span className="speech-ind-badge transcribing">
                  <Loader2 size={12} className="spin" /> Transcribing speech via WiseAI ASR...
                </span>
              ) : (
                <span className="speech-ind-badge listening">
                  <span className="live-mic-pulse" /> Listening to your voice... ({userVoiceLevel}%)
                </span>
              )}
            </div>
          )}

          {/* Message Input Box & Mic */}
          <div className="live-call-input-wrap">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSendUserMessage(inputText);
              }}
              className="live-call-input-form"
            >
              <button
                type="button"
                className={`btn-live-mic ${!micEnabled ? 'muted' : isUserSpeaking ? 'speaking' : isTranscribing ? 'transcribing' : 'ready'}`}
                onClick={() => setMicEnabled(!micEnabled)}
                title={micEnabled ? 'Microphone active (Listening for speech)' : 'Microphone muted (Click to enable)'}
                disabled={callStatus !== 'connected'}
              >
                {isTranscribing ? (
                  <Loader2 size={14} className="spin" />
                ) : micEnabled ? (
                  <Mic size={14} />
                ) : (
                  <MicOff size={14} />
                )}
              </button>
              <input
                type="text"
                className="live-call-text-input"
                placeholder={callStatus === 'connected' ? (micEnabled ? 'Speak into microphone or type response...' : 'Type response (mic muted)...') : 'Start call to begin...'}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={callStatus !== 'connected' || isRouting}
              />
              <button
                type="submit"
                className="btn-live-send"
                disabled={!inputText.trim() || callStatus !== 'connected' || isRouting}
              >
                <Send size={14} />
              </button>
            </form>
          </div>
        </>
      )}
    </aside>
  );
};
