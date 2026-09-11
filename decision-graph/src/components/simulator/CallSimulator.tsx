import React, { useState, useEffect, useRef } from 'react';
import {
  Phone,
  PhoneOff,
  Volume2,
  VolumeX,
  Mic,
  Send,
  Sparkles,
  RotateCcw,
  CheckCircle,
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

interface CallSimulatorProps {
  nodes: CustomFlowNode[];
  edges: CustomFlowEdge[];
  knowledge: CampaignKnowledge;
  onActiveNodeChange: (nodeId: string | null) => void;
  onClose: () => void;
}

export const CallSimulator: React.FC<CallSimulatorProps> = ({
  nodes,
  edges,
  knowledge,
  onActiveNodeChange,
  onClose,
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

  // Interpolate variables in text
  const interpolate = (text: string, currentVars: Record<string, any>) => {
    let result = text;
    Object.entries(currentVars).forEach(([k, v]) => {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, 'g'), String(v));
    });
    // Fallback for missing template keys
    result = result.replace(/\{\{lead_name\}\}/g, knowledge.leadProfile.name);
    result = result.replace(/\{\{company\}\}/g, knowledge.leadProfile.company);
    result = result.replace(/\{\{phone\}\}/g, knowledge.leadProfile.phone);
    return result;
  };

  // Find root greeting node
  const getGreetingNode = () => {
    return nodes.find((n) => n.data.type === 'greeting') || nodes[0];
  };

  // Trigger AI speech and handle node execution
  const executeNode = (node: CustomFlowNode, vars = simState.variables) => {
    setSimState((prev) => ({ ...prev, activeNodeId: node.id, isAiSpeaking: true }));
    onActiveNodeChange(node.id);

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

    // Add to transcript
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

    // If audio is enabled, speak text
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

  // Handle automatic transitions for action nodes or terminal hangup nodes
  const handlePostSpeech = (node: CustomFlowNode, vars: Record<string, any>) => {
    if (node.data.type === 'action') {
      // Action node finishes and automatically moves to the next node
      const nextEdge = edges.find((e) => e.source === node.id);
      if (nextEdge) {
        const nextNode = nodes.find((n) => n.id === nextEdge.target);
        if (nextNode) {
          setTimeout(() => executeNode(nextNode, vars), 800);
          return;
        }
      }
    } else if (node.data.type === 'hangup') {
      // Call finishes
      const disp = (node.data as any).disposition || 'completed';
      setSimState((prev) => ({
        ...prev,
        status: 'ended',
        disposition: disp,
      }));
      telephoneAudio.playHangup();

      if (disp === 'meeting_booked') {
        confetti({ particleCount: 80, spread: 60, origin: { y: 0.7 } });
      }
    }
  };

  // Start outbound call
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

    // Simulate phone pickup after 2.4 seconds
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
            text: `[Call Connected] ${knowledge.leadProfile.name} picked up.`,
            timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          },
        ],
      }));

      const greetingNode = getGreetingNode();
      if (greetingNode) {
        executeNode(greetingNode);
      }
    }, 2400);
  };

  // End call
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
          text: '[Call Terminated by User]',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    }));
    onActiveNodeChange(null);
  };

  // Process caller response and transition state
  const handleCallerResponse = (userText: string) => {
    if (!userText.trim() || simState.status !== 'connected') return;

    // Add user message to transcript
    const userMsg: SimulationMessage = {
      id: `lead-${Date.now()}`,
      speaker: 'lead',
      text: userText,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    };

    const newTranscript = [...simState.transcript, userMsg];
    setInputText('');

    const lower = userText.toLowerCase();

    // 1. CHECK GLOBAL OBJECTIONS
    const matchedObj = knowledge.globalObjections.find((obj) =>
      lower.includes(obj.trigger.toLowerCase().replace(/[?.,!]/g, '')) ||
      (obj.trigger.toLowerCase().includes('ai') && lower.includes('robot')) ||
      (obj.trigger.toLowerCase().includes('ai') && lower.includes('ai')) ||
      (obj.trigger.toLowerCase().includes('number') && lower.includes('number'))
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

    // 2. CHECK CAMPAIGN FAQS
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

    // 3. GRAPH TRAVERSAL: Find next node based on current node and caller input
    const currentNode = nodes.find((n) => n.id === simState.activeNodeId);
    if (!currentNode) return;

    // A. Greeting Node routing (AMD Voicemail vs Human)
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

    // B. Direct Outgoing edges from Question / Rebuttal
    const outgoingEdges = edges.filter((e) => e.source === currentNode.id);

    // If outgoing edge leads to a ScenarioBranchNode, step into it
    const branchEdge = outgoingEdges.find((e) => {
      const target = nodes.find((n) => n.id === e.target);
      return target?.data.type === 'scenarioBranch';
    });

    let nodeToEvaluate = currentNode;
    if (branchEdge) {
      const branchNode = nodes.find((n) => n.id === branchEdge.target);
      if (branchNode) nodeToEvaluate = branchNode;
    }

    // C. Scenario Branch Evaluation
    if (nodeToEvaluate.data.type === 'scenarioBranch') {
      const branchData = nodeToEvaluate.data as any;
      const branches = branchData.branches || [];

      // Determine intent matching
      let matchedBranch = null;

      if (lower.includes('budget') || lower.includes('cost') || lower.includes('expensive') || lower.includes('price')) {
        matchedBranch = branches.find((b: any) => b.intentKey?.includes('price') || b.label?.toLowerCase().includes('budget'));
      } else if (lower.includes('busy') || lower.includes('meeting') || lower.includes('call back') || lower.includes('later') || lower.includes('driving')) {
        matchedBranch = branches.find((b: any) => b.intentKey?.includes('busy') || b.label?.toLowerCase().includes('busy'));
      } else if (lower.includes('not interested') || lower.includes('remove') || lower.includes('stop calling') || lower.includes('no thank')) {
        matchedBranch = branches.find((b: any) => b.intentKey?.includes('not') || b.intentKey?.includes('dnc') || b.label?.toLowerCase().includes('not'));
      } else if (lower.includes('severe') || lower.includes('fever') || lower.includes('emergency') || lower.includes('8') || lower.includes('9') || lower.includes('10')) {
        matchedBranch = branches.find((b: any) => b.intentKey?.includes('severe') || b.label?.toLowerCase().includes('severe'));
      } else if (lower.includes('renter') || lower.includes('rent')) {
        matchedBranch = branches.find((b: any) => b.intentKey?.includes('renter') || b.label?.toLowerCase().includes('renter'));
      } else {
        // Default to positive / happy path
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
                extracted_intent: matchedBranch.label,
              },
            }));
            setTimeout(() => executeNode(nextNode, simState.variables), 400);
            return;
          }
        }
      }
    }

    // D. Rebuttal Node Return Loop
    if (currentNode.data.type === 'knowledge') {
      const rebuttalAccepted =
        lower.includes('ok') ||
        lower.includes('sure') ||
        lower.includes('yes') ||
        lower.includes('sounds good') ||
        lower.includes('thursday') ||
        lower.includes('tuesday');

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

    // Fallback: Follow the first outgoing edge if available
    if (outgoingEdges.length > 0) {
      const nextNode = nodes.find((n) => n.id === outgoingEdges[0].target);
      if (nextNode) {
        setSimState((prev) => ({ ...prev, transcript: newTranscript }));
        setTimeout(() => executeNode(nextNode, simState.variables), 400);
        return;
      }
    }

    // Default acknowledge
    setSimState((prev) => ({
      ...prev,
      transcript: [
        ...newTranscript,
        {
          id: `ai-ack-${Date.now()}`,
          speaker: 'agent',
          text: 'Understood. Could you share a bit more on that?',
          timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        },
      ],
    }));
  };

  // Quick Response Chips based on active node state
  const getContextualResponseChips = () => {
    const currentNode = nodes.find((n) => n.id === simState.activeNodeId);
    if (!currentNode) return ['Yes, I am interested', 'No thanks', 'Call me back tomorrow'];

    if (currentNode.data.type === 'greeting') {
      return [
        'Yes, this is Alex speaking',
        'Who is calling?',
        'I am in a meeting right now',
        'Wrong number',
      ];
    }
    if (currentNode.data.type === 'question') {
      return [
        'Yes, reducing costs is a top priority',
        'We have zero budget this quarter',
        'Are you an AI or real person?',
        'How did you get my number?',
        'Not interested, remove me',
      ];
    }
    if (currentNode.data.type === 'knowledge') {
      return [
        'That makes sense, Thursday works for me',
        'Still not interested',
        'How much does it cost?',
      ];
    }
    return ['Sounds good', 'Can you text me the info?', 'Thank you'];
  };

  // Format timer MM:SS
  const formatTime = (secs: number) => {
    const m = Math.floor(secs / 60)
      .toString()
      .padStart(2, '0');
    const s = (secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  };

  // Web Speech API recognition
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

  return (
    <div className="simulator-pane">
      {/* Simulator Header */}
      <div className="sim-header">
        <div className="sim-title-wrap">
          <div className={`sim-status-dot ${simState.status}`} />
          <div>
            <h3 className="sim-title">Virtual Outbound Dialer</h3>
            <span className="sim-target-number">
              To: {knowledge.leadProfile.name} • {knowledge.leadProfile.phone}
            </span>
          </div>
        </div>

        <div className="sim-header-controls">
          <button
            className={`btn-icon ${simState.audioTtsEnabled ? 'text-primary' : 'text-muted'}`}
            onClick={() => {
              stopSpeech();
              setSimState((prev) => ({ ...prev, audioTtsEnabled: !prev.audioTtsEnabled }));
            }}
            title={simState.audioTtsEnabled ? 'Voice Audio TTS Enabled' : 'Voice TTS Muted'}
          >
            {simState.audioTtsEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
          </button>
          <button className="btn-icon" onClick={onClose} title="Minimize Simulator">
            &times;
          </button>
        </div>
      </div>

      {/* Call Telephony Controls Bar */}
      <div className="telephony-bar">
        <div className="call-meta-item">
          <Clock size={13} />
          <span>{formatTime(simState.callDurationSeconds)}</span>
        </div>

        <div className="call-status-tag">
          {simState.status === 'idle' && 'READY TO DIAL'}
          {simState.status === 'ringing' && 'OUTBOUND RINGING...'}
          {simState.status === 'connected' && 'CALL ACTIVE'}
          {simState.status === 'ended' && 'CALL TERMINATED'}
        </div>

        {simState.status === 'idle' || simState.status === 'ended' ? (
          <button className="btn-dial" onClick={startCall}>
            <Phone size={14} /> Dial Outbound
          </button>
        ) : (
          <button className="btn-hangup" onClick={endCall}>
            <PhoneOff size={14} /> Hang Up
          </button>
        )}
      </div>

      {/* Live AI Speech Indicator Wave */}
      {simState.isAiSpeaking && (
        <div className="speech-wave-banner">
          <div className="waveform-bars">
            <span />
            <span />
            <span />
            <span />
            <span />
          </div>
          <span className="waveform-label">{knowledge.agentPersona.name} is speaking...</span>
        </div>
      )}

      {/* Live Transcript View */}
      <div className="sim-transcript-view">
        {simState.transcript.length === 0 ? (
          <div className="sim-empty-chat">
            <Sparkles size={24} className="text-primary" />
            <p>Click <strong>"Dial Outbound"</strong> to simulate this campaign flow with voice audio & live node tracking.</p>
          </div>
        ) : (
          simState.transcript.map((msg) => (
            <div key={msg.id} className={`chat-bubble-row ${msg.speaker}`}>
              <div className="chat-bubble">
                <div className="bubble-meta">
                  <span className="speaker-label">
                    {msg.speaker === 'agent'
                      ? knowledge.agentPersona.name
                      : msg.speaker === 'lead'
                      ? knowledge.leadProfile.name
                      : 'SYSTEM'}
                  </span>
                  <span className="msg-time">{msg.timestamp}</span>
                </div>
                <p className="bubble-text">{msg.text}</p>
                {msg.intentMatched && (
                  <span className="matched-intent-tag">{msg.intentMatched}</span>
                )}
              </div>
            </div>
          ))
        )}
        <div ref={transcriptEndRef} />
      </div>

      {/* Live Extracted Session Variables Drawer */}
      <div className="sim-session-variables">
        <div className="session-vars-header">
          <Variable size={13} />
          <span>Call Variables ({Object.keys(simState.variables).length})</span>
          {simState.disposition && (
            <span className="disposition-pill">Tag: {simState.disposition}</span>
          )}
        </div>
        <div className="session-vars-chips">
          {Object.entries(simState.variables).map(([k, v]) => (
            <span key={k} className="var-chip">
              <code>{k}</code>: <strong>{String(v)}</strong>
            </span>
          ))}
        </div>
      </div>

      {/* Quick Response Scenario Chips for User */}
      {simState.status === 'connected' && (
        <div className="quick-responses-container">
          <span className="quick-label">
            <Wand2 size={12} /> Prospect Responses (Click to say):
          </span>
          <div className="chips-scroller">
            {getContextualResponseChips().map((chip) => (
              <button
                key={chip}
                className="quick-chip-btn"
                onClick={() => handleCallerResponse(chip)}
              >
                "{chip}"
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Input Message Area */}
      <div className="sim-input-bar">
        <button
          className={`btn-icon ${isRecording ? 'recording' : ''}`}
          onClick={toggleSpeechRecognition}
          title="Speak using microphone"
          disabled={simState.status !== 'connected'}
        >
          <Mic size={16} />
        </button>

        <input
          type="text"
          className="sim-text-input"
          placeholder={
            simState.status === 'connected'
              ? 'Type response as prospect or select a chip above...'
              : 'Call not active — click Dial Outbound above'
          }
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') handleCallerResponse(inputText);
          }}
          disabled={simState.status !== 'connected'}
        />

        <button
          className="btn-primary btn-sm"
          onClick={() => handleCallerResponse(inputText)}
          disabled={simState.status !== 'connected' || !inputText.trim()}
        >
          <Send size={14} />
        </button>
      </div>
    </div>
  );
};
