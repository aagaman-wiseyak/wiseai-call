import React, { useState, useEffect, useRef } from 'react';
import {
  ArrowLeft,
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Mic,
  Send,
  Sparkles,
  Clock,
  Variable,
  Wand2,
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

  const [inputText, setInputText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<any>(null);

  // Auto-scroll transcript
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [simState.transcript]);

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
      scriptToSpeak = `Executing action: ${nodeData.label || 'Action'}`;
    } else if (node.data.type === 'hangup') {
      scriptToSpeak = interpolate(nodeData.closingScript || 'Thank you, goodbye!', vars);
    }

    const msg: SimulationMessage = {
      id: `msg-${Date.now()}`,
      speaker: node.data.type === 'action' ? 'system' : 'agent',
      text: scriptToSpeak,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
      nodeId: node.id,
    };

    setSimState((prev) => ({
      ...prev,
      transcript: [...prev.transcript, msg],
    }));

    if (simState.audioTtsEnabled && node.data.type !== 'action') {
      speakText(scriptToSpeak, knowledge.agentPersona.speakingRate || 1.0, 1.0, () => {
        setSimState((prev) => ({ ...prev, isAiSpeaking: false }));
        handlePostSpeech(node, vars);
      });
    } else {
      setTimeout(() => {
        setSimState((prev) => ({ ...prev, isAiSpeaking: false }));
        handlePostSpeech(node, vars);
      }, 1000);
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
    }, 2200);
  };

  const endCall = () => {
    stopSpeech();
    telephoneAudio.stopRingback();
    telephoneAudio.playHangup();

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

  const handleCallerResponse = async (userText: string) => {
    if (!userText.trim() || simState.status !== 'connected') return;

    const userMsg: SimulationMessage = {
      id: `lead-${Date.now()}`,
      speaker: 'lead',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    const newTranscript = [...simState.transcript, userMsg];
    setInputText('');
    setSimState((prev) => ({ ...prev, transcript: newTranscript }));
    setIsRouting(true);

    const currentNode = nodes.find((n) => n.id === simState.activeNodeId);

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
        }),
      });

      if (response.ok) {
        const result = await response.json();
        setIsRouting(false);

        // 1. CAMPAIGN KNOWLEDGE LOOKUP (Packages, Mbps, Discounts, Router FAQs)
        if (result.knowledge_invoked) {
          const knowledgeMsg: SimulationMessage = {
            id: `ai-knowledge-${Date.now()}`,
            speaker: 'agent',
            text: result.ai_response_text,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
            intentMatched: `💡 Campaign Knowledge: ${result.knowledge_topic || 'Inquiry'}`,
          };

          setSimState((prev) => ({
            ...prev,
            transcript: [...newTranscript, knowledgeMsg],
            isAiSpeaking: true,
          }));

          if (simState.audioTtsEnabled) {
            speakText(result.ai_response_text, knowledge.agentPersona.speakingRate || 1.0, 1.0, () => {
              setSimState((prev) => ({ ...prev, isAiSpeaking: false }));
            });
          } else {
            setTimeout(() => setSimState((prev) => ({ ...prev, isAiSpeaking: false })), 1000);
          }
          return;
        }

        // 2. LLM INTENT ROUTING TO NEXT NODE (Q3 vs Q4 vs Action vs Rebuttal)
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
      console.warn('FastAPI backend routing error, engaging client fallback:', apiError);
    }

    setIsRouting(false);

    // CLIENT FALLBACK TRAVERSAL
    const lower = userText.toLowerCase();

    // Global objections
    const matchedObj = knowledge.globalObjections.find((obj) =>
      lower.includes(obj.trigger.toLowerCase().replace(/[?.,!]/g, ''))
    );
    if (matchedObj) {
      const rebuttalMsg: SimulationMessage = {
        id: `ai-rebuttal-${Date.now()}`,
        speaker: 'agent',
        text: interpolate(matchedObj.response, simState.variables),
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intentMatched: 'Global Objection Intercepted',
      };
      setSimState((prev) => ({
        ...prev,
        transcript: [...newTranscript, rebuttalMsg],
        isAiSpeaking: true,
      }));
      if (simState.audioTtsEnabled) {
        speakText(matchedObj.response, knowledge.agentPersona.speakingRate || 1.0, 1.0, () => {
          setSimState((prev) => ({ ...prev, isAiSpeaking: false }));
        });
      } else {
        setTimeout(() => setSimState((prev) => ({ ...prev, isAiSpeaking: false })), 1000);
      }
      return;
    }

    // Outgoing edges fallback
    const outgoingEdges = edges.filter((e) => e.source === simState.activeNodeId);
    if (outgoingEdges.length > 0) {
      const nextNode = nodes.find((n) => n.id === outgoingEdges[0].target);
      if (nextNode) {
        setTimeout(() => executeNode(nextNode, simState.variables), 400);
        return;
      }
    }

    setSimState((prev) => ({
      ...prev,
      transcript: [
        ...newTranscript,
        {
          id: `ai-ack-${Date.now()}`,
          speaker: 'agent',
          text: 'Understood. Could you clarify that for me?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    }));
  };

  const getContextualResponseChips = () => {
    const currentNode = nodes.find((n) => n.id === simState.activeNodeId);
    if (!currentNode) return ['Yes, confirmed', 'Need to reschedule', 'I am busy right now'];

    if (currentNode.data.type === 'greeting') {
      return [
        `Yes, this is ${knowledge.leadProfile.name}`,
        'What is this call about?',
        'Leave a message (Voicemail)',
        'I am in a meeting right now',
      ];
    }
    if (currentNode.data.type === 'question') {
      // Contextual chips for ISP renewal and general decision questions
      if (currentNode.id === 'node-q2-usage') {
        return [
          'What packages and Mbps speeds do you offer?',
          'We stream 4K video and work from home',
          'Just basic browsing for 1-2 people',
          'What discount do I get for annual renewal?',
          'Do I get a new router?',
          'I am not interested in renewing',
        ];
      }
      return [
        'Yes, that sounds great',
        'What speeds are available?',
        'Is there any discount?',
        'How much will this cost?',
        'Do I get a new Wi-Fi router?',
        'Cancel, not interested',
      ];
    }
    if (currentNode.data.type === 'knowledge') {
      return [
        'That makes sense, lock in the discount',
        'Can I get free Wi-Fi 6 router?',
        'Still too expensive for me',
      ];
    }
    return ['Sounds good', 'Thank you', 'Goodbye'];
  };

  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  const toggleSpeechRecognition = () => {
    const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRec) {
      alert('Speech Recognition is not supported in this browser. Please use text input.');
      return;
    }

    if (isRecording) {
      setIsRecording(false);
      return;
    }

    try {
      const recognition = new SpeechRec();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onstart = () => setIsRecording(true);
      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setIsRecording(false);
        if (transcript) {
          handleCallerResponse(transcript);
        }
      };
      recognition.onerror = () => setIsRecording(false);
      recognition.onend = () => setIsRecording(false);

      recognition.start();
    } catch (e) {
      setIsRecording(false);
    }
  };

  const activeNode = nodes.find((n) => n.id === simState.activeNodeId);

  return (
    <div className="voice-call-page">
      {/* Header Bar */}
      <header className="voice-header">
        <button className="btn-clean-back" onClick={onBackToCanvas}>
          <ArrowLeft size={14} /> Back to Flow Canvas
        </button>

        <div className="voice-header-center">
          <div className="call-info-block">
            <span className="callee-name">{knowledge.leadProfile.name}</span>
            <span className="callee-phone">{knowledge.leadProfile.phone}</span>
          </div>
          <div className="call-persona-block">
            <span className="persona-label">Agent:</span>
            <span className="persona-name">{knowledge.agentPersona.name} ({knowledge.agentPersona.company})</span>
          </div>
        </div>

        <div className="voice-header-right">
          <div className={`backend-indicator ${backendStatus}`} title="FastAPI Python Backend Status">
            <span className="indicator-dot" />
            <span>FastAPI Backend: {backendStatus}</span>
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
            {/* Status Visualizer Circle */}
            <div className={`avatar-status-circle ${simState.status}`}>
              {simState.isAiSpeaking ? (
                <div className="voice-wave-bars">
                  <span />
                  <span />
                  <span />
                  <span />
                  <span />
                </div>
              ) : (
                <Phone size={28} className="phone-icon-center" />
              )}
            </div>

            <div className="call-status-headline">
              {simState.status === 'idle' && 'Ready to Dial'}
              {simState.status === 'ringing' && 'Ringing Outbound...'}
              {simState.status === 'connected' && 'Call Connected'}
              {simState.status === 'ended' && 'Call Concluded'}
            </div>

            <div className="call-timer-badge">
              <Clock size={13} />
              <span>{formatTime(simState.callDurationSeconds)}</span>
            </div>

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
              simState.transcript.map((msg) => (
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
                    <p className="msg-content">{msg.text}</p>
                    {msg.intentMatched && (
                      <span className="intent-matched-pill">{msg.intentMatched}</span>
                    )}
                  </div>
                </div>
              ))
            )}
            {isRouting && (
              <div className="clean-msg-row agent thinking-row">
                <div className="clean-msg-bubble thinking-bubble">
                  <Sparkles size={12} className="thinking-icon spin" />
                  <span className="thinking-text">FastAPI LLM Intent Router evaluating customer response & campaign knowledge...</span>
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
                  {getContextualResponseChips().map((chip) => (
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
                className={`btn-icon-clean ${isRecording ? 'recording' : ''}`}
                onClick={toggleSpeechRecognition}
                title="Speak using microphone"
                disabled={simState.status !== 'connected'}
              >
                <Mic size={16} />
              </button>

              <input
                type="text"
                className="transcript-input"
                placeholder={
                  simState.status === 'connected'
                    ? 'Type lead response or select a quick response above...'
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
