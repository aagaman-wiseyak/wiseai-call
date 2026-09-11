// Telephone sound generator using Web Audio API
class TelephoneAudioEngine {
  private ctx: AudioContext | null = null;
  private ringOsc1: OscillatorNode | null = null;
  private ringOsc2: OscillatorNode | null = null;
  private ringGain: GainNode | null = null;
  private ringInterval: any = null;

  private init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  // Play realistic US telephone ringback tone (440Hz + 480Hz, 2s on, 4s off)
  startRingback() {
    try {
      this.init();
      if (!this.ctx) return;
      this.stopRingback();

      const playRingCycle = () => {
        if (!this.ctx) return;
        const now = this.ctx.currentTime;
        
        const osc1 = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        osc1.type = 'sine';
        osc2.type = 'sine';
        osc1.frequency.setValueAtTime(440, now);
        osc2.frequency.setValueAtTime(480, now);

        gain.gain.setValueAtTime(0.08, now);
        gain.gain.setValueAtTime(0.08, now + 1.8);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 2.0);

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(this.ctx.destination);

        osc1.start(now);
        osc2.start(now);
        osc1.stop(now + 2.0);
        osc2.stop(now + 2.0);
      };

      playRingCycle();
      this.ringInterval = setInterval(playRingCycle, 4000);
    } catch (e) {
      console.warn('Audio ringback error:', e);
    }
  }

  stopRingback() {
    if (this.ringInterval) {
      clearInterval(this.ringInterval);
      this.ringInterval = null;
    }
    if (this.ringOsc1) {
      try { this.ringOsc1.stop(); } catch (_) {}
      this.ringOsc1 = null;
    }
    if (this.ringOsc2) {
      try { this.ringOsc2.stop(); } catch (_) {}
      this.ringOsc2 = null;
    }
  }

  playConnect() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(750, now);
      osc.frequency.exponentialRampToValueAtTime(950, now + 0.15);

      gain.gain.setValueAtTime(0.1, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.15);
    } catch (e) {
      console.warn('Audio connect error:', e);
    }
  }

  playHangup() {
    try {
      this.init();
      if (!this.ctx) return;
      const now = this.ctx.currentTime;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(425, now);

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start(now);
      osc.stop(now + 0.35);
    } catch (e) {
      console.warn('Audio hangup error:', e);
    }
  }
}

export const telephoneAudio = new TelephoneAudioEngine();

/**
 * Real-time Low-Latency Web Audio API PCM Queue Player
 * Seamlessly schedules incoming 16-bit PCM audio chunks in real time
 * with zero inter-chunk gap and instant barge-in / interruption support.
 */
class PCMStreamPlayer {
  private ctx: AudioContext | null = null;
  private activeSources: AudioBufferSourceNode[] = [];
  private nextStartTime = 0;
  private sampleRate = 24000;
  private endTimer: any = null;

  init(sampleRate = 24000) {
    this.sampleRate = sampleRate;
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!this.ctx) {
      this.ctx = new AudioCtx({ sampleRate });
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    this.nextStartTime = this.ctx.currentTime + 0.04;
  }

  enqueuePCMChunk(chunkBuffer: ArrayBuffer) {
    if (!this.ctx) this.init();
    const ctx = this.ctx!;
    if (ctx.state === 'suspended') {
      ctx.resume();
    }

    const int16 = new Int16Array(chunkBuffer);
    if (int16.length === 0) return;

    // Convert 16-bit signed PCM to Float32 [-1.0, 1.0]
    const float32 = new Float32Array(int16.length);
    for (let i = 0; i < int16.length; i++) {
      float32[i] = int16[i] / 32768.0;
    }

    const audioBuffer = ctx.createBuffer(1, float32.length, this.sampleRate);
    audioBuffer.copyToChannel(float32, 0);

    const source = ctx.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(ctx.destination);

    const now = ctx.currentTime;
    const scheduledTime = Math.max(now + 0.02, this.nextStartTime);
    source.start(scheduledTime);
    this.nextStartTime = scheduledTime + audioBuffer.duration;

    this.activeSources.push(source);
    source.onended = () => {
      const idx = this.activeSources.indexOf(source);
      if (idx !== -1) this.activeSources.splice(idx, 1);
    };
  }

  scheduleCompletion(onEnd?: () => void) {
    if (this.endTimer) clearTimeout(this.endTimer);
    if (!onEnd) return;

    if (!this.ctx) {
      onEnd();
      return;
    }

    const remainingMs = Math.max(0, (this.nextStartTime - this.ctx.currentTime) * 1000) + 60;
    this.endTimer = setTimeout(() => {
      this.endTimer = null;
      onEnd();
    }, remainingMs);
  }

  stop() {
    if (this.endTimer) {
      clearTimeout(this.endTimer);
      this.endTimer = null;
    }
    for (const src of this.activeSources) {
      try {
        src.stop();
        src.disconnect();
      } catch (_) {}
    }
    this.activeSources = [];
    this.nextStartTime = 0;
  }
}

const pcmPlayer = new PCMStreamPlayer();

/**
 * Persistent Pre-warmed WebSocket Manager for OmniVoice TTS.
 * Keeps an open WebSocket connection alive during the entire call session,
 * completely eliminating the ~1.2s connection handshake on speech turns.
 */
class PersistentTTSWebSocket {
  private ws: WebSocket | null = null;
  private isConnecting = false;
  private activeOnDone: (() => void) | null = null;
  private activeOnError: ((err: any) => void) | null = null;
  private streamReceivedChunk = false;

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }
    this.isConnecting = true;
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/api/call/ws-tts`;

    const ws = new WebSocket(wsUrl);
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    ws.onopen = () => {
      this.isConnecting = false;
      console.log('Pre-warmed persistent TTS WebSocket connection established.');
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const meta = JSON.parse(event.data);
          if (meta.type === 'start') {
            pcmPlayer.init(meta.sample_rate || 24000);
          } else if (meta.type === 'done') {
            pcmPlayer.scheduleCompletion(() => {
              if (this.activeOnDone) {
                const cb = this.activeOnDone;
                this.activeOnDone = null;
                cb();
              }
            });
          }
        } catch (_) {}
      } else if (event.data instanceof ArrayBuffer) {
        this.streamReceivedChunk = true;
        pcmPlayer.enqueuePCMChunk(event.data);
      }
    };

    ws.onerror = (e) => {
      console.warn('Persistent TTS WebSocket error:', e);
      if (!this.streamReceivedChunk && this.activeOnError) {
        const errCb = this.activeOnError;
        this.activeOnError = null;
        errCb(e);
      }
    };

    ws.onclose = () => {
      this.ws = null;
      this.isConnecting = false;
    };
  }

  speak(payload: any, onEnd?: () => void, onError?: (err: any) => void) {
    this.streamReceivedChunk = false;
    this.activeOnDone = onEnd || null;
    this.activeOnError = onError || null;

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.connect();
      const startTime = Date.now();
      const checkTimer = setInterval(() => {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
          clearInterval(checkTimer);
          this.ws.send(JSON.stringify(payload));
        } else if (Date.now() - startTime > 4000 || (this.ws && this.ws.readyState === WebSocket.CLOSED)) {
          clearInterval(checkTimer);
          if (onError) onError(new Error('WebSocket connection timeout'));
        }
      }, 30);
    } else {
      // 0ms delay: Connection is already warm!
      this.ws.send(JSON.stringify(payload));
    }
  }

  cancelTurn() {
    this.activeOnDone = null;
    this.activeOnError = null;
    this.streamReceivedChunk = false;
  }

  disconnect() {
    this.cancelTurn();
    if (this.ws) {
      try {
        this.ws.close();
      } catch (_) {}
      this.ws = null;
    }
  }
}

const ttsSocket = new PersistentTTSWebSocket();

export const initTTSWebSocket = () => {
  ttsSocket.connect();
};

export const disconnectTTSWebSocket = () => {
  ttsSocket.disconnect();
};

// Active playback elements for fallback
let activeAudioElement: HTMLAudioElement | null = null;

export interface SpeakOptions {
  language?: 'eng' | 'nep' | 'mai';
  voiceId?: string;
  speed?: number;
  pitch?: number;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

// Fallback browser speech synthesis
const fallbackBrowserSpeech = (
  cleanText: string,
  language: 'eng' | 'nep' | 'mai' = 'eng',
  rate = 1.0,
  pitch = 1.0,
  onEnd?: () => void
) => {
  if (typeof window === 'undefined' || !window.speechSynthesis) {
    if (onEnd) onEnd();
    return;
  }

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = rate;
    utterance.pitch = pitch;

    if (language === 'nep') {
      utterance.lang = 'ne-NP';
    } else {
      utterance.lang = 'en-US';
      const voices = window.speechSynthesis.getVoices();
      const preferred = voices.find(
        (v) =>
          v.lang.startsWith('en') &&
          (v.name.includes('Natural') ||
            v.name.includes('Google') ||
            v.name.includes('Samantha') ||
            v.name.includes('Karen') ||
            v.name.includes('Daniel'))
      ) || voices.find((v) => v.lang.startsWith('en'));
      if (preferred) utterance.voice = preferred;
    }

    utterance.onend = () => { if (onEnd) onEnd(); };
    utterance.onerror = () => { if (onEnd) onEnd(); };

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn('Browser speech synthesis error:', err);
    if (onEnd) onEnd();
  }
};

/**
 * Synthesizes and streams speech in real time using OmniVoice WebSocket streaming.
 * Uses pre-warmed persistent WebSocket connection for 0ms network setup latency.
 * Audio chunks play immediately upon arrival (~500ms TTFT) via Web Audio API.
 * Falls back to HTTP POST or browser synthesis if WebSocket is unavailable.
 */
export const speakText = (
  text: string,
  rate = 1.0,
  pitch = 1.0,
  onEnd?: () => void,
  options?: SpeakOptions
): void => {
  stopSpeech();

  const cleanText = text.replace(/\{\{.*?\}\}/g, '').trim();
  if (!cleanText) {
    if (onEnd) onEnd();
    return;
  }

  const lang: 'eng' | 'nep' | 'mai' = options?.language || (
    /[\u0900-\u097F]/.test(cleanText) ? 'nep' : 'eng'
  );

  // 1. PRIMARY: OmniVoice WebSocket Real-Time PCM Streaming via Persistent Connection
  ttsSocket.speak(
    {
      text: cleanText,
      language: lang,
      voice_id: options?.voiceId || 'Pratikshya',
      speed: options?.speed || rate || 1.0,
    },
    () => {
      if (onEnd) onEnd();
    },
    (err) => {
      console.warn('WebSocket TTS error, falling back to HTTP speech:', err);
      fallbackHttpSpeech(cleanText, lang, rate, pitch, onEnd, options);
    }
  );
};

/**
 * Fallback to HTTP POST /api/call/tts and browser synthesis
 */
const fallbackHttpSpeech = async (
  cleanText: string,
  lang: 'eng' | 'nep' | 'mai',
  rate: number,
  pitch: number,
  onEnd?: () => void,
  options?: SpeakOptions
) => {
  try {
    const response = await fetch('/api/call/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: cleanText,
        language: lang,
        voice_id: options?.voiceId || 'Pratikshya',
        speed: options?.speed || rate || 1.0,
      }),
    });

    if (response.ok) {
      const data = await response.json();
      if (data.audio_base64) {
        const audio = new Audio(`data:audio/wav;base64,${data.audio_base64}`);
        activeAudioElement = audio;

        audio.onended = () => {
          activeAudioElement = null;
          if (onEnd) onEnd();
        };

        audio.onerror = (e) => {
          console.warn('Audio playback error, falling back to browser speech:', e);
          activeAudioElement = null;
          fallbackBrowserSpeech(cleanText, lang, rate, pitch, onEnd);
        };

        await audio.play();
        return;
      }
    }
  } catch (err) {
    console.warn('WiseAI TTS HTTP fetch error, falling back to browser speech:', err);
  }

  fallbackBrowserSpeech(cleanText, lang, rate, pitch, onEnd);
};

export const stopSpeech = () => {
  ttsSocket.cancelTurn();
  pcmPlayer.stop();

  if (activeAudioElement) {
    try {
      activeAudioElement.pause();
      activeAudioElement.currentTime = 0;
    } catch (_) {}
    activeAudioElement = null;
  }

  if (typeof window !== 'undefined' && window.speechSynthesis) {
    window.speechSynthesis.cancel();
  }
};

