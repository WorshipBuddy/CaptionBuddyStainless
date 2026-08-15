import { app } from 'electron';
import path from 'path';
import { STTEngine, STTResult } from './STTEngine';

// Dynamic import for ESM-only @huggingface/transformers
let pipeline: any = null;
let env: any = null;

async function loadTransformers() {
  const mod = await import('@huggingface/transformers');
  pipeline = mod.pipeline;
  env = mod.env;
}

export interface WhisperTask {
  language: string;   // 'en', 'es', etc.
  task: 'transcribe' | 'translate'; // translate = foreign language -> English
}

/**
 * Whisper-based STT engine using Transformers.js (ONNX Runtime).
 * Runs entirely offline after the model is downloaded on first use.
 *
 * Buffers audio into configurable-length segments, then transcribes
 * each segment as a batch. Typical latency is 2-5 seconds depending
 * on model size and hardware.
 */
export class WhisperEngine extends STTEngine {
  readonly name = 'whisper';
  private transcriber: any = null;
  private _isReady = false;
  private audioBuffer: Float32Array[] = [];
  private totalSamples = 0;
  private readonly sampleRate = 16000;
  private readonly segmentSeconds: number;
  private readonly modelId: string;
  private processing = false;
  private headerSkipped = false;
  private readonly WAV_HEADER_SIZE = 44;
  private whisperTask: WhisperTask = { language: 'en', task: 'transcribe' };

  get isReady(): boolean {
    return this._isReady;
  }

  /**
   * @param modelId - HuggingFace model ID (default: whisper-small multilingual)
   * @param segmentSeconds - Audio buffer length before transcribing (default: 5s)
   */
  constructor(modelId = 'onnx-community/whisper-small', segmentSeconds = 5) {
    super();
    this.modelId = modelId;
    this.segmentSeconds = segmentSeconds;
  }

  async init(): Promise<void> {
    this.emit('status', 'Loading Whisper model (this may take a moment on first run)...');
    this.emit('progress', 0);

    await loadTransformers();

    // Configure cache directory for offline use
    env.cacheDir = this.getCacheDir();
    env.allowLocalModels = true;

    this.transcriber = await pipeline(
      'automatic-speech-recognition',
      this.modelId,
      {
        dtype: 'q8',         // Quantized for speed
        device: 'cpu',       // CPU for broadest compatibility (incl. Pi)
        progress_callback: (progressInfo: { status: string; progress?: number }) => {
          if (progressInfo.status === 'progress' && progressInfo.progress !== undefined) {
            this.emit('progress', progressInfo.progress / 100);
          }
        },
      }
    );

    this._isReady = true;
    this.emit('progress', 1);
    this.emit('status', 'Whisper model loaded');
    this.emit('ready');
  }

  /**
   * Update the language and task (transcribe vs translate).
   */
  setTask(task: WhisperTask): void {
    this.whisperTask = { ...task };
    console.log(`[Whisper] Task set to: ${task.task} (${task.language})`);
  }

  getTask(): WhisperTask {
    return { ...this.whisperTask };
  }

  /**
   * Feed raw PCM audio from node-record-lpcm16.
   * Expects 16-bit signed integer PCM, mono, 16kHz, with WAV header on first chunk.
   */
  feedAudio(chunk: Buffer): void {
    if (!this._isReady) return;

    // Strip WAV header from first chunk
    let offset = 0;
    if (!this.headerSkipped) {
      if (chunk.length <= this.WAV_HEADER_SIZE) return;
      offset = this.WAV_HEADER_SIZE;
      this.headerSkipped = true;
    }

    // Convert 16-bit PCM to Float32 [-1, 1]
    const sampleCount = Math.floor((chunk.length - offset) / 2);
    const float32 = new Float32Array(sampleCount);
    for (let i = 0; i < sampleCount; i++) {
      float32[i] = chunk.readInt16LE(offset + i * 2) / 32768;
    }

    this.audioBuffer.push(float32);
    this.totalSamples += sampleCount;

    // When we have enough audio, transcribe
    const segmentSamples = this.sampleRate * this.segmentSeconds;
    if (this.totalSamples >= segmentSamples) {
      const bufferedSeconds = (this.totalSamples / this.sampleRate).toFixed(1);
      console.log(`[Whisper] Buffered ${bufferedSeconds}s of audio, transcribing...`);
      this.transcribeBuffer();
    }
  }

  async flush(): Promise<void> {
    if (this.totalSamples > 0) {
      await this.transcribeBuffer();
    }
  }

  /**
   * Reset per-session state (WAV header flag + audio buffer).
   * Call this at the start of each recording session.
   * Does NOT tear down the loaded transcriber model.
   */
  reset(): void {
    this.headerSkipped = false;
    this.audioBuffer = [];
    this.totalSamples = 0;
  }

  destroy(): void {
    this.transcriber = null;
    this._isReady = false;
    this.audioBuffer = [];
    this.totalSamples = 0;
    this.headerSkipped = false;
  }

  private async transcribeBuffer(): Promise<void> {
    if (this.processing || this.audioBuffer.length === 0) return;
    this.processing = true;

    // Merge buffered chunks into a single Float32Array
    const merged = new Float32Array(this.totalSamples);
    let writeOffset = 0;
    for (const chunk of this.audioBuffer) {
      merged.set(chunk, writeOffset);
      writeOffset += chunk.length;
    }

    // Clear buffer
    this.audioBuffer = [];
    this.totalSamples = 0;

    try {
      const isEnglishOnly = this.modelId.endsWith('.en');
      const options: Record<string, unknown> = {
        sampling_rate: this.sampleRate,
        return_timestamps: false,
      };

      if (!isEnglishOnly) {
        options.language = this.whisperTask.language;
        options.task = this.whisperTask.task;
      }

      const result = await this.transcriber(merged, options);

      const text = (result?.text ?? '').trim();
      console.log(`[Whisper] Transcribed: "${text}"`);
      if (text.length > 0) {
        const sttResult: STTResult = {
          text,
          isFinal: true,
          confidence: 0.85,
          audio: merged,
        };
        this.emit('result', sttResult);
      }
    } catch (err) {
      console.error('[Whisper] Transcription error:', err);
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
    } finally {
      this.processing = false;
    }
  }

  private getCacheDir(): string {
    return path.join(app.getPath('userData'), 'models');
  }
}
