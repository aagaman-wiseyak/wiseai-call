import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  ArrowLeft,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Mic,
  MicOff,
  Keyboard,
  Send,
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
import { telephoneAudio, speakText, stopSpeech } from '../../utils/speech';
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
  const [showInputDrawer, setShowInputDrawer] = useState(false);
  const [inputText, setInputText] = useState('');
  const [isRouting, setIsRouting] = useState(false);
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
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat to bottom
  const scrollToBottom = () => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
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

  // Clean up on unmount
  useEffect(() => {
    return () => {
      stopSpeech();
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

    setSimState({
      status: 'ringing',
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
      audioTtsEnabled: simState.audioTtsEnabled,
      activeEdgeId: null,
    });

    setTimeout(() => {
      telephoneAudio.stopRingback();
      telephoneAudio.playConnect();

      setSimState((prev) => ({
        ...prev,
        status: 'connected',
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
    setShowInputDrawer(false);
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
          variables: simState.variables,
          language: callLanguage,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setIsRouting(false);

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

  // Generate dynamic kinetic wave bars based on real-time VAD voice activity or AI speech
  const waveBars = useMemo(() => {
    return Array.from({ length: 12 }).map((_, i) => {
      if (isUserSpeaking && userVoiceLevel > 0) {
        const variance = Math.sin((i / 11) * Math.PI) * 0.8 + 0.2;
        const h = Math.min(24, Math.max(4, (userVoiceLevel / 100) * 24 * variance));
        return Math.round(h);
      } else if (simState.isAiSpeaking) {
        const wave = Math.sin((i / 11) * Math.PI * 2 + Date.now() / 200) * 0.5 + 0.5;
        return Math.round(5 + wave * 16);
      }
      return 3;
    });
  }, [isUserSpeaking, userVoiceLevel, simState.isAiSpeaking]);

  return (
    <div className="minimal-call-canvas">
      {/* Sleek Top Navigation Bar */}
      <header className="minimal-call-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          <button className="minimal-btn-back" onClick={onBackToCanvas} title="Return to Studio">
            <ArrowLeft size={16} />
            <span>Studio</span>
          </button>
          <WiseBrandLogo size="sm" showTagline={false} textColor="#f8fafc" />
        </div>

        <div className="minimal-header-center">
          <span className="callee-name-title">{knowledge.leadProfile.name}</span>
          <div className="call-status-pill">
            <span
              className={`status-dot ${
                simState.status === 'connected' ? 'connected' : simState.status === 'ringing' ? 'ringing' : 'idle'
              }`}
            />
            <span>
              {simState.status === 'connected'
                ? formatTime(simState.callDurationSeconds)
                : simState.status === 'ringing'
                ? 'Calling...'
                : 'Ready'}
            </span>
          </div>
        </div>

        <div className="minimal-header-actions" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
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
            className={`minimal-icon-btn ${simState.audioTtsEnabled ? 'active' : ''}`}
            onClick={() => {
              stopSpeech();
              setSimState((prev) => ({ ...prev, audioTtsEnabled: !prev.audioTtsEnabled }));
            }}
            title={simState.audioTtsEnabled ? 'Sound Enabled' : 'Sound Muted'}
          >
            {simState.audioTtsEnabled ? <Volume2 size={17} /> : <VolumeX size={17} />}
          </button>
        </div>
      </header>

      {/* Top Compact Visualizer & Voice Activity Ribbon */}
      <div className="minimal-voice-ribbon">
        <div
          className={`mini-kinetic-orb ${
            isUserSpeaking
              ? 'user-active'
              : simState.isAiSpeaking
              ? 'ai-active'
              : simState.status === 'connected'
              ? 'listening'
              : ''
          }`}
        >
          <Phone size={14} className="mini-phone-icon" />
        </div>

        <div className="mini-wave-bars">
          {waveBars.map((height, i) => (
            <span
              key={i}
              className={`mini-wave-bar ${
                isUserSpeaking ? 'user' : simState.isAiSpeaking ? 'agent' : 'quiet'
              }`}
              style={{ height: `${height}px` }}
            />
          ))}
        </div>

        <span className="mini-status-text">
          {isTranscribing
            ? 'Transcribing speech...'
            : isRouting
            ? 'Thinking...'
            : isUserSpeaking
            ? 'You are speaking...'
            : simState.isAiSpeaking
            ? `${knowledge.agentPersona.name} speaking...`
            : simState.status === 'connected'
            ? 'Listening (hands-free)...'
            : simState.status === 'ringing'
            ? 'Connecting...'
            : 'Press Call to begin'}
        </span>
      </div>

      {/* Main Real-time Chat Stream: Left (Agent) and Right (User) */}
      <main className="realtime-chat-scroller" ref={chatScrollRef}>
        {simState.transcript.length === 0 ? (
          <div className="chat-empty-hint">
            <p>Ready to start call. Press the green call button below to begin.</p>
          </div>
        ) : (
          simState.transcript.map((msg) => {
            const isAgent = msg.speaker === 'agent';
            const isLead = msg.speaker === 'lead';
            const isCurrentlyStreaming = msg.id === activeStreamingMsgId;
            const displayText = isCurrentlyStreaming ? streamingText || '...' : msg.text;

            return (
              <div
                key={msg.id}
                className={`chat-msg-row ${isAgent ? 'left-agent' : isLead ? 'right-user' : 'center-system'}`}
              >
                <div className="chat-bubble">
                  <div className="bubble-meta">
                    <span className="bubble-speaker">
                      {isAgent
                        ? knowledge.agentPersona.name
                        : isLead
                        ? knowledge.leadProfile.name
                        : 'System'}
                    </span>
                    <span className="bubble-timestamp">{msg.timestamp}</span>
                  </div>

                  <p className="bubble-text">
                    {displayText}
                    {isCurrentlyStreaming && <span className="stream-cursor">▌</span>}
                  </p>
                </div>
              </div>
            );
          })
        )}

        {/* Live Left Agent Thinking Bubble */}
        {isRouting && (
          <div className="chat-msg-row left-agent">
            <div className="chat-bubble thinking">
              <div className="typing-dots">
                <span />
                <span />
                <span />
              </div>
              <span className="thinking-hint">Routing...</span>
            </div>
          </div>
        )}

        {/* Live Right User Speaking Bubble (VAD Active) */}
        {isUserSpeaking && (
          <div className="chat-msg-row right-user">
            <div className="chat-bubble user-speaking-bubble">
              <div className="speaking-wave-dots">
                <span />
                <span />
                <span />
                <span />
              </div>
              <span className="user-live-hint">Speaking...</span>
            </div>
          </div>
        )}

        {/* Right User Transcribing Bubble */}
        {isTranscribing && (
          <div className="chat-msg-row right-user">
            <div className="chat-bubble user-transcribing-bubble">
              <Sparkles size={13} className="spin" />
              <span>Transcribing voice...</span>
            </div>
          </div>
        )}
      </main>

      {/* Quick Suggestion Chips (Minimalist) */}
      {simState.status === 'connected' && !simState.isAiSpeaking && !isUserSpeaking && (
        <div className="minimal-chips-row">
          {quickSuggestions.map((text) => (
            <button
              key={text}
              className="minimal-chip"
              onClick={() => handleCallerResponse(text)}
            >
              "{text}"
            </button>
          ))}
        </div>
      )}

      {/* Optional Minimalist Text Input Drawer */}
      {showInputDrawer && simState.status === 'connected' && (
        <div className="minimal-text-bar-container">
          <div className="minimal-text-bar">
            <input
              type="text"
              className="minimal-text-input"
              placeholder="Type reply and press Enter..."
              value={inputText}
              autoFocus
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCallerResponse(inputText);
              }}
            />
            <button
              className="minimal-btn-send"
              disabled={!inputText.trim()}
              onClick={() => handleCallerResponse(inputText)}
            >
              <Send size={15} />
            </button>
          </div>
        </div>
      )}

      {/* Floating Bottom Control Island */}
      <footer className="minimal-call-controls">
        {simState.status === 'connected' && (
          <button
            className={`control-btn ${micEnabled ? (isUserSpeaking ? 'speaking' : 'active') : 'muted'}`}
            onClick={toggleMic}
            title={micEnabled ? 'Mute Microphone' : 'Unmute Microphone'}
          >
            {micEnabled ? <Mic size={20} /> : <MicOff size={20} />}
          </button>
        )}

        {simState.status === 'idle' || simState.status === 'ended' ? (
          <button className="control-btn call-start" onClick={startCall} title="Start Call">
            <Phone size={22} />
          </button>
        ) : (
          <button className="control-btn call-end" onClick={endCall} title="End Call">
            <PhoneOff size={22} />
          </button>
        )}

        {simState.status === 'connected' && (
          <button
            className={`control-btn ${showInputDrawer ? 'active' : ''}`}
            onClick={() => setShowInputDrawer((prev) => !prev)}
            title="Type Response"
          >
            <Keyboard size={20} />
          </button>
        )}
      </footer>
    </div>
  );
};
