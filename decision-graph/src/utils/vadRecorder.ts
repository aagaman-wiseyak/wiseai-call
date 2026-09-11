/**
 * Voice Activity Detection (VAD) & 16kHz WAV Recorder
 * Captures microphone audio, monitors user voice activity level in real time,
 * automatically detects speech start and silence cessation, and exports 16kHz PCM WAV.
 */

export interface VADConfig {
  sampleRate?: number;
  energyThreshold?: number; // 0 to 100 RMS percentage
  silenceDurationMs?: number; // time after speaking to trigger completion
  minSpeechDurationMs?: number; // ignore clicks/pops shorter than this
  onVoiceActivity?: (level: number, isSpeaking: boolean) => void;
  onSpeechStart?: () => void;
  onSpeechEnd?: (wavBlob: Blob) => void;
  onError?: (error: Error) => void;
}

export class VADAudioEngine {
  private audioCtx: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private analyserNode: AnalyserNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;

  private isListening = false;
  private isSpeaking = false;
  private speechStartTime = 0;
  private silenceTimer: any = null;
  private pcmBuffers: Float32Array[] = [];

  private config: Required<VADConfig>;

  constructor(config: VADConfig = {}) {
    this.config = {
      sampleRate: config.sampleRate || 16000,
      energyThreshold: config.energyThreshold ?? 12,
      silenceDurationMs: config.silenceDurationMs ?? 1100,
      minSpeechDurationMs: config.minSpeechDurationMs ?? 400,
      onVoiceActivity: config.onVoiceActivity || (() => {}),
      onSpeechStart: config.onSpeechStart || (() => {}),
      onSpeechEnd: config.onSpeechEnd || (() => {}),
      onError: config.onError || (() => {}),
    };
  }

  async start(): Promise<boolean> {
    if (this.isListening) return true;

    try {
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
        },
      });

      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      this.audioCtx = new AudioContextClass({ sampleRate: this.config.sampleRate });
      if (this.audioCtx.state === 'suspended') {
        await this.audioCtx.resume();
      }

      this.sourceNode = this.audioCtx.createMediaStreamSource(this.mediaStream);
      this.analyserNode = this.audioCtx.createAnalyser();
      this.analyserNode.fftSize = 512;
      this.analyserNode.smoothingTimeConstant = 0.3;

      // Use ScriptProcessor for raw PCM collection
      this.processorNode = this.audioCtx.createScriptProcessor(2048, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isListening) return;

        const input = e.inputBuffer.getChannelData(0);
        // Calculate RMS Energy
        let sum = 0;
        for (let i = 0; i < input.length; i++) {
          sum += input[i] * input[i];
        }
        const rms = Math.sqrt(sum / input.length);
        const level = Math.min(100, Math.round(rms * 500));

        const now = Date.now();

        if (level >= this.config.energyThreshold) {
          // Voice activity detected
          if (this.silenceTimer) {
            clearTimeout(this.silenceTimer);
            this.silenceTimer = null;
          }

          if (!this.isSpeaking) {
            this.isSpeaking = true;
            this.speechStartTime = now;
            this.pcmBuffers = [];
            this.config.onSpeechStart();
          }

          // Accumulate raw PCM samples
          this.pcmBuffers.push(new Float32Array(input));
          this.config.onVoiceActivity(level, true);
        } else {
          // Below threshold
          this.config.onVoiceActivity(level, this.isSpeaking);

          if (this.isSpeaking) {
            // Collect trailing audio for buffer completeness
            this.pcmBuffers.push(new Float32Array(input));

            if (!this.silenceTimer) {
              this.silenceTimer = setTimeout(() => {
                const speechDuration = Date.now() - this.speechStartTime;
                this.isSpeaking = false;
                this.silenceTimer = null;

                if (speechDuration >= this.config.minSpeechDurationMs && this.pcmBuffers.length > 0) {
                  const mergedPcm = this.mergeBuffers(this.pcmBuffers);
                  const wavBlob = this.encodeWAV(mergedPcm, this.audioCtx?.sampleRate || this.config.sampleRate);
                  this.pcmBuffers = [];
                  this.config.onSpeechEnd(wavBlob);
                } else {
                  this.pcmBuffers = [];
                }
              }, this.config.silenceDurationMs);
            }
          }
        }
      };

      this.sourceNode.connect(this.analyserNode);
      this.analyserNode.connect(this.processorNode);
      this.processorNode.connect(this.audioCtx.destination);

      this.isListening = true;
      return true;
    } catch (err: any) {
      console.warn('VAD Audio start error:', err);
      this.config.onError(err);
      return false;
    }
  }

  stop() {
    this.isListening = false;
    this.isSpeaking = false;
    if (this.silenceTimer) {
      clearTimeout(this.silenceTimer);
      this.silenceTimer = null;
    }
    this.pcmBuffers = [];

    if (this.processorNode) {
      try {
        this.processorNode.disconnect();
      } catch (_) {}
      this.processorNode = null;
    }

    if (this.analyserNode) {
      try {
        this.analyserNode.disconnect();
      } catch (_) {}
      this.analyserNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch (_) {}
      this.sourceNode = null;
    }

    if (this.audioCtx) {
      try {
        this.audioCtx.close();
      } catch (_) {}
      this.audioCtx = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }
  }

  private mergeBuffers(buffers: Float32Array[]): Float32Array {
    let totalLength = 0;
    for (const b of buffers) totalLength += b.length;
    const result = new Float32Array(totalLength);
    let offset = 0;
    for (const b of buffers) {
      result.set(b, offset);
      offset += b.length;
    }
    return result;
  }

  private encodeWAV(samples: Float32Array, sampleRate: number): Blob {
    const buffer = new ArrayBuffer(44 + samples.length * 2);
    const view = new DataView(buffer);

    const writeString = (offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    // RIFF identifier
    writeString(0, 'RIFF');
    // file length
    view.setUint32(4, 36 + samples.length * 2, true);
    // RIFF type
    writeString(8, 'WAVE');
    // format chunk identifier
    writeString(12, 'fmt ');
    // format chunk length
    view.setUint32(16, 16, true);
    // sample format (raw PCM)
    view.setUint16(20, 1, true);
    // channel count (1 = mono)
    view.setUint16(22, 1, true);
    // sample rate
    view.setUint32(24, sampleRate, true);
    // byte rate (sampleRate * blockAlign)
    view.setUint32(28, sampleRate * 2, true);
    // block align (channelCount * bytesPerSample)
    view.setUint16(32, 2, true);
    // bits per sample
    view.setUint16(34, 16, true);
    // data chunk identifier
    writeString(36, 'data');
    // data chunk length
    view.setUint32(40, samples.length * 2, true);

    // Float32 to Int16 PCM
    let offset = 44;
    for (let i = 0; i < samples.length; i++, offset += 2) {
      const s = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }

    return new Blob([view], { type: 'audio/wav' });
  }
}
