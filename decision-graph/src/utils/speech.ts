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

// Active audio playback element for WiseAI TTS
let activeAudioElement: HTMLAudioElement | null = null;

export interface SpeakOptions {
  language?: 'eng' | 'nep';
  voiceId?: string;
  speed?: number;
  pitch?: number;
  onEnd?: () => void;
  onError?: (err: any) => void;
}

// Fallback browser speech synthesis
const fallbackBrowserSpeech = (
  cleanText: string,
  language: 'eng' | 'nep' = 'eng',
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
 * Synthesizes and plays speech using WiseAI TTS endpoint (/generate_from_text).
 * Supports English ('eng') and Nepali ('nep').
 * Falls back to browser synthesis if API is unreachable.
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

  const lang: 'eng' | 'nep' = options?.language || (
    /[\u0900-\u097F]/.test(cleanText) ? 'nep' : 'eng'
  );

  // Attempt WiseAI TTS via FastAPI backend proxy
  (async () => {
    try {
      const response = await fetch('/api/call/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: cleanText,
          language: lang,
          voice_id: options?.voiceId || 'Prakash_0',
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
            console.warn('Audio playback error, falling back:', e);
            activeAudioElement = null;
            fallbackBrowserSpeech(cleanText, lang, rate, pitch, onEnd);
          };

          await audio.play();
          return;
        }
      }
    } catch (err) {
      console.warn('WiseAI TTS fetch error, falling back to browser speech:', err);
    }

    // Fallback if API response had no audio or request failed
    fallbackBrowserSpeech(cleanText, lang, rate, pitch, onEnd);
  })();
};

export const stopSpeech = () => {
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
