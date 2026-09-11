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

  const handleCallerResponse = (userText: string) => {
    if (!userText.trim() || simState.status !== 'connected') return;

    const userMsg: SimulationMessage = {
      id: `lead-${Date.now()}`,
      speaker: 'lead',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    const newTranscript = [...simState.transcript, userMsg];
    setInputText('');

    const lower = userText.toLowerCase();

    // 1. GLOBAL OBJECTIONS
    const matchedObj = knowledge.globalObjections.find((obj) =>
      lower.includes(obj.trigger.toLowerCase().replace(/[?.,!]/g, '')) ||
      (obj.trigger.toLowerCase().includes('ai') && (lower.includes('robot') || lower.includes('ai'))) ||
      (obj.trigger.toLowerCase().includes('busy') && lower.includes('busy'))
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

    // 2. FAQS
    const matchedFaq = knowledge.faqs.find((faq) =>
      faq.keywords.some((kw) => lower.includes(kw.toLowerCase()))
    );

    if (matchedFaq) {
      const faqMsg: SimulationMessage = {
        id: `ai-faq-${Date.now()}`,
        speaker: 'agent',
        text: matchedFaq.answer,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        intentMatched: `FAQ: ${matchedFaq.question}`,
      };

      setSimState((prev) => ({
        ...prev,
        transcript: [...newTranscript, faqMsg],
        isAiSpeaking: true,
      }));

      if (simState.audioTtsEnabled) {
        speakText(matchedFaq.answer, knowledge.agentPersona.speakingRate || 1.0, 1.0, () => {
          setSimState((prev) => ({ ...prev, isAiSpeaking: false }));
        });
      } else {
        setTimeout(() => setSimState((prev) => ({ ...prev, isAiSpeaking: false })), 1000);
      }
      return;
    }

    // 3. GRAPH TRAVERSAL
    const currentNode = nodes.find((n) => n.id === simState.activeNodeId);
    if (!currentNode) return;

    // Greeting AMD
    if (currentNode.data.type === 'greeting') {
      const isVoicemail =
        lower.includes('voicemail') ||
        lower.includes('leave a message') ||
        lower.includes('tone') ||
        lower.includes('beep');

      const targetHandle = isVoicemail ? 'voicemail' : 'human';
      const edge = edges.find(
        (e) => e.source === currentNode.id && (e.sourceHandle === targetHandle || !e.sourceHandle)
      );

      if (edge) {
        const nextNode = nodes.find((n) => n.id === edge.target);
        if (nextNode) {
          setSimState((prev) => ({ ...prev, transcript: newTranscript }));
          setTimeout(() => executeNode(nextNode, simState.variables), 400);
          return;
        }
      }
    }

    // Scenario Router
    const outgoingEdges = edges.filter((e) => e.source === currentNode.id);
    const branchEdge = outgoingEdges.find((e) => {
      const target = nodes.find((n) => n.id === e.target);
      return target?.data.type === 'scenarioBranch';
    });

    let nodeToEvaluate = currentNode;
    if (branchEdge) {
      const branchNode = nodes.find((n) => n.id === branchEdge.target);
      if (branchNode) nodeToEvaluate = branchNode;
    }

    if (nodeToEvaluate.data.type === 'scenarioBranch') {
      const branchData = nodeToEvaluate.data as any;
      const branches = branchData.branches || [];

      let matchedBranch = null;

      if (lower.includes('budget') || lower.includes('cost') || lower.includes('expensive') || lower.includes('price')) {
        matchedBranch = branches.find((b: any) => b.intentKey?.includes('cost') || b.intentKey?.includes('price') || b.label?.toLowerCase().includes('cost'));
      } else if (lower.includes('reschedule') || lower.includes('different day') || lower.includes('later') || lower.includes('busy') || lower.includes('meeting')) {
        matchedBranch = branches.find((b: any) => b.intentKey?.includes('reschedule') || b.intentKey?.includes('busy') || b.label?.toLowerCase().includes('reschedule'));
      } else if (lower.includes('cancel') || lower.includes('not interested') || lower.includes('remove') || lower.includes('stop')) {
        matchedBranch = branches.find((b: any) => b.intentKey?.includes('cancel') || b.intentKey?.includes('not') || b.intentKey?.includes('dnc'));
      } else {
        matchedBranch = branches[0];
      }

      if (matchedBranch) {
        const edge = edges.find(
          (e) =>
            e.source === nodeToEvaluate.id &&
            (e.sourceHandle === matchedBranch.targetHandle || e.sourceHandle === matchedBranch.id)
        ) || edges.find((e) => e.source === nodeToEvaluate.id);

        if (edge) {
          const nextNode = nodes.find((n) => n.id === edge.target);
          if (nextNode) {
            setSimState((prev) => ({
              ...prev,
              transcript: newTranscript,
              variables: {
                ...prev.variables,
                customer_intent: matchedBranch.label,
              },
            }));
            setTimeout(() => executeNode(nextNode, simState.variables), 400);
            return;
          }
        }
      }
    }

    // Rebuttal Loop
    if (currentNode.data.type === 'knowledge') {
      const rebuttalAccepted =
        lower.includes('ok') ||
        lower.includes('sure') ||
        lower.includes('yes') ||
        lower.includes('thursday') ||
        lower.includes('tuesday') ||
        lower.includes('sounds good');

      if (rebuttalAccepted) {
        const edge = edges.find((e) => e.source === currentNode.id);
        if (edge) {
          const nextNode = nodes.find((n) => n.id === edge.target);
          if (nextNode) {
            setSimState((prev) => ({ ...prev, transcript: newTranscript }));
            setTimeout(() => executeNode(nextNode, simState.variables), 400);
            return;
          }
        }
      }
    }

    if (outgoingEdges.length > 0) {
      const nextNode = nodes.find((n) => n.id === outgoingEdges[0].target);
      if (nextNode) {
        setSimState((prev) => ({ ...prev, transcript: newTranscript }));
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
        'Who is calling?',
        'Leave a message (Voicemail)',
        'I am in a meeting right now',
      ];
    }
    if (currentNode.data.type === 'question') {
      return [
        'Yes, that time works perfectly',
        'I need to reschedule for next week',
        'How much will this cost?',
        'Are you an AI robot?',
        'Cancel appointment, not interested',
      ];
    }
    if (currentNode.data.type === 'knowledge') {
      return [
        'That makes sense, keep my slot',
        'Still need to reschedule',
        'Where are you located?',
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
