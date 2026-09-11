import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Send,
  Clock,
  Variable,
  Wand2,
  Sparkles,
} from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  CustomFlowNode,
  CustomFlowEdge,
  CampaignKnowledge,
  CallSimulationState,
  SimulationMessage,
} from '../../types/flow';
import { telephoneAudio, speakText, stopSpeech, initTTSWebSocket, disconnectTTSWebSocket } from '../../utils/speech';
import { VADAudioEngine } from '../../utils/vadRecorder';
import { WiseBrandLogo } from '../brand/WiseBrandLogo';

interface VoiceCallPageProps {
  nodes: CustomFlowNode[];
  edges: CustomFlowEdge[];
  knowledge: CampaignKnowledge;
  onBackToCanvas: () => void;
}

export const VoiceCallPage: React.FC<VoiceCallPageProps> = ({
  nodes,
  edges,
  knowledge,
  onBackToCanvas,
}) => {
  const [simState, setSimState] = useState<CallSimulationState>({
    status: 'idle',
    activeNodeId: null,
    previousNodeId: null,
    transcript: [],
    variables: {
      lead_name: knowledge.leadProfile.name,
      company: knowledge.leadProfile.company,
      phone: knowledge.leadProfile.phone,
    },
    disposition: null,
    callDurationSeconds: 0,
    isAiSpeaking: false,
    audioTtsEnabled: true,
    activeEdgeId: null,
  });

  // Voice Activity Detection & Live Audio
  const [userVoiceLevel, setUserVoiceLevel] = useState(0); // 0 to 100
  const [isUserSpeaking, setIsUserSpeaking] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micEnabled, setMicEnabled] = useState(true);
  const [callLanguage, setCallLanguage] = useState<'eng' | 'nep'>('eng');

  // Frontend Real-time Streaming
  const [activeStreamingMsgId, setActiveStreamingMsgId] = useState<string | null>(null);
  const [streamingText, setStreamingText] = useState('');
  const [inputText, setInputText] = useState('');
  const [isRouting, setIsRouting] = useState(false);
  // Server-owned conversation state: holds a valid transition while the
  // customer’s campaign question is resolved (e.g. “yes, but why?”).
  const [conversationState, setConversationState] = useState<Record<string, unknown>>({});
  const [backendStatus, setBackendStatus] = useState<'checking' | 'online' | 'offline'>('checking');

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((d) => {
        if (d.status === 'online') setBackendStatus('online');
        else setBackendStatus('offline');
      })
      .catch(() => setBackendStatus('offline'));
  }, []);

  const vadEngineRef = useRef<VADAudioEngine | null>(null);
  const timerRef = useRef<any>(null);
  const streamIntervalRef = useRef<any>(null);
  const transcriptEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll transcript to bottom
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simState.transcript, streamingText, isUserSpeaking, isRouting, isTranscribing]);

  // Call duration counter
  useEffect(() => {
    if (simState.status === 'connected') {
      timerRef.current = setInterval(() => {
        setSimState((prev) => ({
          ...prev,
          callDurationSeconds: prev.callDurationSeconds + 1,
        }));
      }, 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [simState.status]);

  // Pre-warm Persistent TTS WebSocket when entering call view & clean up on unmount
  useEffect(() => {
    initTTSWebSocket();

    return () => {
      stopSpeech();
      disconnectTTSWebSocket();
      if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);
      if (vadEngineRef.current) {
        vadEngineRef.current.stop();
        vadEngineRef.current = null;
      }
    };
  }, []);

  const interpolate = (text: string, currentVars: Record<string, any>) => {
    let result = text;
    Object.entries(currentVars).forEach(([k, v]) => {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    });
    result = result.replace(/\{\{lead_name\}\}/g, knowledge.leadProfile.name);
    result = result.replace(/\{\{company\}\}/g, knowledge.leadProfile.company);
    result = result.replace(/\{\{phone\}\}/g, knowledge.leadProfile.phone);
    return result;
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Stream text word-by-word into the active message bubble
  const streamWords = (msgId: string, fullText: string, onFinish?: () => void) => {
    if (streamIntervalRef.current) clearInterval(streamIntervalRef.current);

    setActiveStreamingMsgId(msgId);
    setStreamingText('');
    const words = fullText.split(' ');
    let currentIdx = 0;

    // Word step pace
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

        // Ensure full text is committed in state
        setSimState((prev) => ({
          ...prev,
          transcript: prev.transcript.map((m) => (m.id === msgId ? { ...m, text: fullText } : m)),
        }));

        if (onFinish) onFinish();
      }
    }, stepMs);
  };

  // Setup VAD Engine when call connects
  useEffect(() => {
    if (simState.status === 'connected' && micEnabled) {
      if (!vadEngineRef.current) {
        vadEngineRef.current = new VADAudioEngine({
          energyThreshold: 14,
          silenceDurationMs: 1100,
          onVoiceActivity: (level, speaking) => {
            if (simState.isAiSpeaking || isRouting) {
              setUserVoiceLevel(0);
              setIsUserSpeaking(false);
              return;
            }
            setUserVoiceLevel(level);
            setIsUserSpeaking(speaking);
          },
          onSpeechStart: () => {
            if (!simState.isAiSpeaking && !isRouting) {
              setIsUserSpeaking(true);
            }
          },
          onSpeechEnd: async (wavBlob: Blob) => {
            if (simState.status !== 'connected' || simState.isAiSpeaking || isRouting) return;

            setIsTranscribing(true);
            try {
              const formData = new FormData();
              formData.append('file', wavBlob, 'speech.wav');
              formData.append('language', callLanguage);

              const response = await fetch('/api/call/asr', {
                method: 'POST',
                body: formData,
              });

              if (response.ok) {
                const data = await response.json();
                const text = (data.text || '').trim();
                setIsTranscribing(false);
                if (text && text.length > 1 && !text.toLowerCase().includes('nope')) {
                  handleCallerResponse(text);
                }
              } else {
                setIsTranscribing(false);
              }
            } catch (err) {
              console.warn('VAD ASR request error:', err);
              setIsTranscribing(false);
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
    }
  }, [simState.status, micEnabled, simState.isAiSpeaking, isRouting]);

  const toggleMic = () => {
    setMicEnabled((prev) => !prev);
  };

  const getGreetingNode = () => {
    return nodes.find((n) => n.data.type === 'greeting') || nodes[0];
  };

  const executeNode = (node: CustomFlowNode, vars = simState.variables) => {
    setSimState((prev) => ({ ...prev, activeNodeId: node.id, isAiSpeaking: true }));

    let scriptToSpeak = '';
    const nodeData = node.data as any;

    if (node.data.type === 'greeting') {
      scriptToSpeak = interpolate(nodeData.openingScript || 'Hello!', vars);
    } else if (node.data.type === 'question') {
      scriptToSpeak = interpolate(nodeData.speechPrompt || '', vars);
    } else if (node.data.type === 'knowledge') {
      scriptToSpeak = interpolate(nodeData.rebuttalScript || '', vars);
    } else if (node.data.type === 'action') {
      scriptToSpeak = `Confirming your ${nodeData.label || 'selection'} right now.`;
    } else if (node.data.type === 'hangup') {
      scriptToSpeak = interpolate(nodeData.closingScript || 'Thank you for your time. Have a great day!', vars);
    }

    const msgId = `msg-${Date.now()}`;
    const msg: SimulationMessage = {
      id: msgId,
      speaker: node.data.type === 'action' ? 'system' : 'agent',
      text: '', // Start empty and stream words into it
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      nodeId: node.id,
    };

    setSimState((prev) => ({
      ...prev,
      transcript: [...prev.transcript, msg],
    }));

    // Stream words into the message bubble in real time
    streamWords(msgId, scriptToSpeak);

    if (simState.audioTtsEnabled && node.data.type !== 'action') {
      speakText(scriptToSpeak, knowledge.agentPersona.speakingRate || 1.0, 1.0, () => {
        setSimState((prev) => ({ ...prev, isAiSpeaking: false }));
        handlePostSpeech(node, vars);
      }, { language: callLanguage });
    } else {
      setTimeout(() => {
        setSimState((prev) => ({ ...prev, isAiSpeaking: false }));
        handlePostSpeech(node, vars);
      }, 1200);
    }
  };

  const handlePostSpeech = (node: CustomFlowNode, vars: Record<string, any>) => {
    if (node.data.type === 'action') {
      const nextEdge = edges.find((e) => e.source === node.id);
      if (nextEdge) {
        const nextNode = nodes.find((n) => n.id === nextEdge.target);
        if (nextNode) {
          setTimeout(() => executeNode(nextNode, vars), 800);
          return;
        }
      }
    } else if (node.data.type === 'hangup') {
      const disp = (node.data as any).disposition || 'completed';
      setSimState((prev) => ({
        ...prev,
        status: 'ended',
        disposition: disp,
      }));
      telephoneAudio.playHangup();

      if (disp === 'meeting_booked') {
        confetti({ particleCount: 70, spread: 60, origin: { y: 0.6 } });
      }
    }
  };

  const startCall = () => {
    stopSpeech();
    telephoneAudio.startRingback();
    setConversationState({});

    setSimState({
      status: 'ringing',
      activeNodeId: null,
      previousNodeId: null,
      transcript: [
        {
          id: `sys-${Date.now()}`,
          speaker: 'system',
          text: `Dialing ${knowledge.leadProfile.name} (${knowledge.leadProfile.phone})...`,
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      variables: {
        lead_name: knowledge.leadProfile.name,
        company: knowledge.leadProfile.company,
        phone: knowledge.leadProfile.phone,
      },
      disposition: null,
      callDurationSeconds: 0,
      isAiSpeaking: false,
      audioTtsEnabled: simState.audioTtsEnabled,
      activeEdgeId: null,
    });

    setTimeout(() => {
      telephoneAudio.stopRingback();
      telephoneAudio.playConnect();

      setSimState((prev) => ({
        ...prev,
        status: 'connected',
        transcript: [
          ...prev.transcript,
          {
            id: `sys-pickup-${Date.now()}`,
            speaker: 'system',
            text: `[Call Connected] ${knowledge.leadProfile.name} answered.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ],
      }));

      const greetingNode = getGreetingNode();
      if (greetingNode) {
        executeNode(greetingNode);
      }
    }, 1800);
  };

  const endCall = () => {
    stopSpeech();
    telephoneAudio.stopRingback();
    telephoneAudio.playHangup();

    if (vadEngineRef.current) {
      vadEngineRef.current.stop();
      vadEngineRef.current = null;
    }

    setSimState((prev) => ({
      ...prev,
      status: 'ended',
      isAiSpeaking: false,
      transcript: [
        ...prev.transcript,
        {
          id: `sys-end-${Date.now()}`,
          speaker: 'system',
          text: '[Call Ended]',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    }));
  };

  const handleCallerResponse = async (userText: string) => {
    if (!userText.trim() || simState.status !== 'connected') return;

    const userMsg: SimulationMessage = {
      id: `lead-${Date.now()}`,
      speaker: 'lead',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    };

    const newTranscript = [...simState.transcript, userMsg];
    setInputText('');
    setSimState((prev) => ({ ...prev, transcript: newTranscript }));
    setIsRouting(true);

    try {
      // POST TO FASTAPI PYTHON BACKEND
      const response = await fetch('/api/call/process-turn', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_text: userText,
          current_node_id: simState.activeNodeId,
          nodes: nodes,
          edges: edges,
          campaign_knowledge: knowledge,
          conversation_history: newTranscript,
          conversation_state: conversationState,
          variables: simState.variables,
          language: callLanguage,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setIsRouting(false);
        setConversationState(result.conversation_state || {});

        // 1. CAMPAIGN KNOWLEDGE LOOKUP
        if (result.knowledge_invoked) {
          const kMsgId = `ai-knowledge-${Date.now()}`;
          const knowledgeMsg: SimulationMessage = {
            id: kMsgId,
            speaker: 'agent',
            text: '',
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            intentMatched: result.knowledge_topic || 'Campaign Knowledge',
          };

          setSimState((prev) => ({
            ...prev,
            transcript: [...newTranscript, knowledgeMsg],
            isAiSpeaking: true,
          }));

          streamWords(kMsgId, result.ai_response_text);

          if (simState.audioTtsEnabled) {
            speakText(result.ai_response_text, knowledge.agentPersona.speakingRate || 1.0, 1.0, () => {
              setSimState((prev) => ({ ...prev, isAiSpeaking: false }));
            }, { language: callLanguage });
          } else {
            setTimeout(() => setSimState((prev) => ({ ...prev, isAiSpeaking: false })), 1200);
          }
          return;
        }

        // 2. LLM INTENT ROUTING TO NEXT NODE
        if (result.next_node_id) {
          const nextNode = nodes.find((n) => n.id === result.next_node_id);
          if (nextNode) {
            const edgeBetween = edges.find(
              (e) => e.source === simState.activeNodeId && e.target === result.next_node_id
            );
            if (edgeBetween) {
              setSimState((prev) => ({ ...prev, activeEdgeId: edgeBetween.id }));
            }

            executeNode(nextNode, result.updated_variables || simState.variables);
            return;
          }
        }
      }
    } catch (apiError) {
      console.warn('Backend routing fallback:', apiError);
    }

    setIsRouting(false);

    // Fallback traversal
    const outgoingEdges = edges.filter((e) => e.source === simState.activeNodeId);
    if (outgoingEdges.length > 0) {
      const nextNode = nodes.find((n) => n.id === outgoingEdges[0].target);
      if (nextNode) {
        setTimeout(() => executeNode(nextNode, simState.variables), 400);
        return;
      }
    }

    const fallbackReply = 'Understood. Could you share a bit more about that?';
    const fMsgId = `ai-ack-${Date.now()}`;
    setSimState((prev) => ({
      ...prev,
      transcript: [
        ...newTranscript,
        {
          id: fMsgId,
          speaker: 'agent',
          text: '',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
      isAiSpeaking: true,
    }));
    streamWords(fMsgId, fallbackReply, () => {
      setSimState((prev) => ({ ...prev, isAiSpeaking: false }));
    });
  };

  // Dynamic contextual quick chips for testing without speaking
  const quickSuggestions = useMemo(() => {
    const currentNode = nodes.find((n) => n.id === simState.activeNodeId);
    if (!currentNode) {
      return ['Yes, speaking', 'Could you repeat that?', 'I am busy right now'];
    }

    const chips: string[] = [];

    // 1. Dynamic chips from outgoing decision branches departing from currentNode
    const outgoing = edges.filter((e) => e.source === currentNode.id);
    outgoing.forEach((edge) => {
      const edgeLabel = edge.data?.label || '';
      if (edgeLabel) {
        // Clean up common branch prefixes like "If ... -> ..." or "If Agrees -> Confirm"
        const cleanChip = edgeLabel
          .replace(/^If\s+/i, '')
          .replace(/\s*->.*$/, '')
          .trim();
        if (cleanChip && !chips.includes(cleanChip)) {
          chips.push(cleanChip);
        }
      }
    });

    // 2. Dynamic chips from scenario branch options if applicable
    if (currentNode.data.type === 'scenarioBranch') {
      const branches = (currentNode.data as any).branches || [];
      branches.forEach((b: any) => {
        if (b.label && !chips.includes(b.label)) {
          chips.push(b.label);
        }
      });
    }

    // 3. Dynamic inquiries from Campaign FAQs
    if (knowledge.faqs && knowledge.faqs.length > 0) {
      knowledge.faqs.slice(0, 2).forEach((faq) => {
        if (!chips.includes(faq.question)) {
          chips.push(faq.question);
        }
      });
    }

    // 4. Dynamic triggers from Campaign Global Objections
    if (knowledge.globalObjections && knowledge.globalObjections.length > 0) {
      knowledge.globalObjections.slice(0, 2).forEach((obj) => {
        if (!chips.includes(obj.trigger)) {
          chips.push(obj.trigger);
        }
      });
    }

    if (callLanguage === 'nep') {
      if (currentNode.data.type === 'greeting') {
        chips.unshift(`हजुर, म ${knowledge.leadProfile.name} बोल्दैछु`);
        chips.push('म अहिले अलि व्यस्त छु, पछि फोन गर्नुस् न?');
      } else if (currentNode.data.type === 'question') {
        chips.unshift('हजुर हुन्छ, राम्रो लाग्यो');
        chips.push('अहिलेलाई पर्दैन होला');
      } else if (currentNode.data.type === 'knowledge') {
        chips.unshift('बुझेँ, अगाडि बढौँ');
        chips.push('मलाई अझै केही कुरा सोध्नु थियो');
      } else {
        chips.unshift('हजुर हुन्छ');
        chips.push('धन्यवाद');
      }
      return chips.slice(0, 6);
    }

    // 5. Node-type specific natural conversational fallbacks
    if (currentNode.data.type === 'greeting') {
      if (!chips.some((c) => c.toLowerCase().includes('yes'))) {
        chips.unshift(`Yes, this is ${knowledge.leadProfile.name}`);
      }
      if (!chips.some((c) => c.toLowerCase().includes('busy'))) {
        chips.push('I am in a meeting, can you call back later?');
      }
    } else if (currentNode.data.type === 'question') {
      if (!chips.some((c) => c.toLowerCase().includes('yes') || c.toLowerCase().includes('sounds'))) {
        chips.unshift('Yes, sounds good');
      }
      if (!chips.some((c) => c.toLowerCase().includes('not') || c.toLowerCase().includes('cancel'))) {
        chips.push('Not interested right now');
      }
    } else if (currentNode.data.type === 'knowledge') {
      chips.unshift("Understood, let's move forward");
      chips.push('I still have some concerns');
    } else if (currentNode.data.type === 'action') {
      chips.unshift('Confirm and proceed');
      chips.push('Need to reschedule');
    } else if (currentNode.data.type === 'hangup') {
      chips.unshift('Thank you, goodbye');
    }

    // Return max 6 chips to keep layout balanced
    return chips.slice(0, 6);
  }, [simState.activeNodeId, nodes, edges, knowledge]);

  const activeNode = nodes.find((n) => n.id === simState.activeNodeId);

  return (
    <div className="voice-call-page">
      {/* Header Bar per Section 2 of Brand Spec */}
      <header className="voice-header">
        <div className="voice-header-left">
          <button className="btn-clean-back" onClick={onBackToCanvas}>
            <ArrowLeft size={14} /> Back to Canvas
          </button>
          <div className="header-divider" />
          <WiseBrandLogo size="sm" showTagline={false} />
        </div>

        <div className="voice-header-center">
          <div className="call-info-block">
            <span className="persona-label">Contact:</span>
            <span className="callee-name">{knowledge.leadProfile.name}</span>
            <span className="callee-phone">({knowledge.leadProfile.phone})</span>
          </div>
          <div className="call-persona-block">
            <span className="persona-label">AI Agent:</span>
            <span className="persona-name">
              {knowledge.agentPersona.name} ({knowledge.agentPersona.company})
            </span>
          </div>
        </div>

        <div className="voice-header-right" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {/* Language Toggle: English (eng) vs Nepali (nep) */}
          <div className="call-lang-selector" title="Select Voice & AI Language">
            <button
              type="button"
              className={`call-lang-btn ${callLanguage === 'eng' ? 'active' : ''}`}
              onClick={() => setCallLanguage('eng')}
            >
              EN
            </button>
            <button
              type="button"
              className={`call-lang-btn ${callLanguage === 'nep' ? 'active' : ''}`}
              onClick={() => setCallLanguage('nep')}
            >
              नेपाली
            </button>
          </div>
          <div className={`backend-indicator ${backendStatus}`} title="FastAPI Python Backend Status">
            <span className="indicator-dot" />
            <span>FastAPI: {backendStatus}</span>
          </div>
          <button
            className={`btn-icon-clean ${simState.audioTtsEnabled ? 'active' : ''}`}
            onClick={() => {
              stopSpeech();
              setSimState((prev) => ({ ...prev, audioTtsEnabled: !prev.audioTtsEnabled }));
            }}
            title={simState.audioTtsEnabled ? 'Speech Audio TTS On' : 'Speech Audio Muted'}
          >
            {simState.audioTtsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
        </div>
      </header>

      {/* Main Call View: Split into Status/Dialer & Real-time Transcript */}
      <div className="voice-main-content">
        {/* Left Telephony Status Column */}
        <div className="telephony-column">
          <div className="telephony-card">
            {/* Status Visualizer Circle per Section 2.7 of Brand Spec */}
            <div
              className={`avatar-status-circle ${simState.status === 'connected'
                  ? isUserSpeaking
                    ? 'speaking user-speaking'
                    : simState.isAiSpeaking
                      ? 'speaking'
                      : 'connected'
                  : simState.status
                }`}
            >
              {simState.isAiSpeaking ? (
                <div className="voice-wave-bars" title="Agent speaking">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : isUserSpeaking ? (
                <div className="voice-wave-bars user-wave" title="Contact speaking">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : simState.status === 'connected' ? (
                <Mic size={28} className="phone-icon-center" style={{ color: 'var(--color-listening)' }} />
              ) : simState.status === 'ended' ? (
                <PhoneOff size={26} className="phone-icon-center" style={{ color: 'var(--color-success)' }} />
              ) : (
                <Phone size={28} className="phone-icon-center" />
              )}
            </div>

            <div className="call-status-headline">
              {simState.status === 'idle' && 'Ready to Dial'}
              {simState.status === 'ringing' && 'Ringing Outbound...'}
              {simState.status === 'connected' &&
                (simState.isAiSpeaking
                  ? 'Agent Speaking...'
                  : isUserSpeaking
                    ? 'Contact Speaking...'
                    : isTranscribing
                      ? 'Transcribing Voice...'
                      : 'Listening to Contact...')}
              {simState.status === 'ended' && 'Call Concluded'}
            </div>

            <div className="call-timer-badge">
              <Clock size={13} />
              <span>{formatTime(simState.callDurationSeconds)}</span>
            </div>

            {/* Hands-Free VAD Mode Toggle Pill */}
            {simState.status === 'connected' && (
              <button
                className={`mic-mode-pill ${micEnabled ? (isUserSpeaking ? 'speaking' : 'active') : 'muted'
                  }`}
                onClick={toggleMic}
                title="Click to toggle Hands-Free Microphone"
              >
                {micEnabled ? (
                  <>
                    <Mic size={12} />
                    <span>{isUserSpeaking ? 'Voice Detected' : 'Hands-Free Mic Active'}</span>
                  </>
                ) : (
                  <>
                    <MicOff size={12} />
                    <span>Mic Muted (Click to Enable)</span>
                  </>
                )}
              </button>
            )}

            {/* Active Flow Node Indicator */}
            {activeNode && simState.status === 'connected' && (
              <div className="active-path-box">
                <span className="active-path-tag">Active Decision Tree Step:</span>
                <span className="active-path-name">{activeNode.data.label}</span>
                <span className="active-path-type">({activeNode.data.type} node)</span>
              </div>
            )}

            {/* Primary Action Dial / Hangup */}
            <div className="telephony-actions">
              {simState.status === 'idle' || simState.status === 'ended' ? (
                <button className="btn-call-dial" onClick={startCall}>
                  <Phone size={16} />
                  <span>Start Outbound Call</span>
                </button>
              ) : (
                <button className="btn-call-hangup" onClick={endCall}>
                  <PhoneOff size={16} />
                  <span>End Call</span>
                </button>
              )}
            </div>
          </div>

          {/* Session Variables Card */}
          <div className="session-data-card">
            <div className="session-data-head">
              <Variable size={13} />
              <span>Extracted Call Variables</span>
            </div>
            <div className="session-data-list">
              {Object.entries(simState.variables).map(([k, v]) => (
                <div key={k} className="session-data-row">
                  <span className="data-key">{k}</span>
                  <span className="data-val">{String(v)}</span>
                </div>
              ))}
              {simState.disposition && (
                <div className="session-data-row highlight">
                  <span className="data-key">final_disposition</span>
                  <span className="data-val">{simState.disposition}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Real-time Transcription Stream Column */}
        <div className="transcript-column">
          <div className="transcript-header">
            <span className="transcript-title">Real-Time Call Transcript</span>
            <span className="transcript-count">{simState.transcript.length} messages</span>
          </div>

          <div className="transcript-messages-scroller">
            {simState.transcript.length === 0 ? (
              <div className="empty-transcript-state">
                <p>Click <strong>"Start Outbound Call"</strong> to initiate the AI voice outreach session.</p>
              </div>
            ) : (
              simState.transcript.map((msg) => {
                const isCurrentlyStreaming = msg.id === activeStreamingMsgId;
                const displayText = isCurrentlyStreaming ? streamingText || '...' : msg.text;

                return (
                  <div key={msg.id} className={`clean-msg-row ${msg.speaker}`}>
                    <div className="clean-msg-bubble">
                      <div className="msg-meta-bar">
                        <span className="msg-speaker">
                          {msg.speaker === 'agent'
                            ? knowledge.agentPersona.name
                            : msg.speaker === 'lead'
                              ? knowledge.leadProfile.name
                              : 'System Event'}
                        </span>
                        <span className="msg-time">{msg.timestamp}</span>
                      </div>
                      <p className="msg-content">
                        {displayText}
                        {isCurrentlyStreaming && <span className="stream-cursor">▌</span>}
                      </p>
                      {msg.intentMatched && (
                        <span className="intent-matched-pill">{msg.intentMatched}</span>
                      )}
                    </div>
                  </div>
                );
              })
            )}

            {/* Agent Thinking Row */}
            {isRouting && (
              <div className="clean-msg-row agent thinking-row">
                <div className="clean-msg-bubble thinking-bubble">
                  <div className="thinking-dots-container">
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                    <span className="thinking-dot" />
                  </div>
                  <span className="thinking-text" style={{ marginLeft: 8 }}>
                    Evaluating customer response & campaign decision tree...
                  </span>
                </div>
              </div>
            )}

            {/* Live User Speaking Indicator */}
            {isUserSpeaking && (
              <div className="clean-msg-row lead">
                <div className="clean-msg-bubble user-live-bubble">
                  <div className="speaking-wave-dots">
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                  <span>Contact is speaking...</span>
                </div>
              </div>
            )}

            {/* Live User Transcribing Indicator */}
            {isTranscribing && (
              <div className="clean-msg-row lead">
                <div className="clean-msg-bubble user-transcribing-bubble">
                  <Sparkles size={13} className="spin" />
                  <span>Transcribing speech with Whisper...</span>
                </div>
              </div>
            )}

            <div ref={transcriptEndRef} />
          </div>

          {/* Contextual Caller Responses & Input Bar */}
          <div className="caller-interaction-bar">
            {simState.status === 'connected' && (
              <div className="quick-chips-wrapper">
                <span className="chips-title">
                  <Wand2 size={11} /> Quick Lead Responses:
                </span>
                <div className="chips-list">
                  {quickSuggestions.map((chip) => (
                    <button
                      key={chip}
                      className="clean-chip-btn"
                      onClick={() => handleCallerResponse(chip)}
                    >
                      "{chip}"
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="transcript-input-row">
              <button
                className={`btn-icon-clean ${micEnabled ? (isUserSpeaking ? 'active' : '') : 'muted'}`}
                onClick={toggleMic}
                title={
                  micEnabled
                    ? 'Hands-Free Microphone Active (Click to mute)'
                    : 'Microphone Muted (Click to enable)'
                }
                disabled={simState.status !== 'connected'}
              >
                {micEnabled ? <Mic size={16} /> : <MicOff size={16} />}
              </button>

              <input
                type="text"
                className="transcript-input"
                placeholder={
                  simState.status === 'connected'
                    ? 'Type lead response or speak hands-free with your mic...'
                    : 'Call not active — click Start Outbound Call to begin'
                }
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCallerResponse(inputText);
                }}
                disabled={simState.status !== 'connected'}
              />

              <button
                className="btn-send-clean"
                onClick={() => handleCallerResponse(inputText)}
                disabled={simState.status !== 'connected' || !inputText.trim()}
              >
                <Send size={14} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
