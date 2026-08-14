import { EventEmitter } from 'events';
import { app } from 'electron';
import path from 'path';

// Dynamic import for ESM-only @huggingface/transformers
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let pipeline: any = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let env: any = null;

async function loadTransformers() {
  const mod = await import('@huggingface/transformers');
  pipeline = mod.pipeline;
  env = mod.env;
}

export interface TranslationResult {
  /** id of the segment this translation belongs to. */
  id: string;
  text: string;
}

/**
 * English → Spanish translation using Helsinki-NLP's MarianMT model via
 * Transformers.js. Runs entirely offline once the model is cached.
 *
 * This exists because Whisper cannot do it: Whisper's "translate" task only
 * ever produces English, so translating *out of* English needs a second model.
 * opus-mt-en-es is small (~75MB quantized) and purpose-built for this pair,
 * which matters when it shares a CPU with Whisper — including on a Pi.
 *
 * Requests are queued and processed one at a time. Running two ONNX sessions
 * concurrently on a shared CPU makes both slower, and transcription is the one
 * that must not fall behind.
 */
export class TranslationEngine extends EventEmitter {
  readonly name = 'opus-mt-en-es';
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private translator: any = null;
  private _isReady = false;
  private _isLoading = false;
  private readonly modelId: string;
  private queue: { id: string; text: string }[] = [];
  private processing = false;

  get isReady(): boolean {
    return this._isReady;
  }

  get isLoading(): boolean {
    return this._isLoading;
  }

  get queueLength(): number {
    return this.queue.length;
  }

  constructor(modelId = 'Xenova/opus-mt-en-es') {
    super();
    this.modelId = modelId;
  }

  /**
   * Load the model. Safe to call repeatedly — concurrent callers await the
   * same load rather than kicking off a second download.
   */
  async init(): Promise<void> {
    if (this._isReady || this._isLoading) return;
    this._isLoading = true;

    this.emit('status', 'Loading Spanish translation model (first run downloads ~75MB)...');
    this.emit('progress', 0);

    try {
      await loadTransformers();

      env.cacheDir = this.getCacheDir();
      env.allowLocalModels = true;

      this.translator = await pipeline('translation', this.modelId, {
        dtype: 'q8',
        device: 'cpu',
        progress_callback: (progressInfo: { status: string; progress?: number }) => {
          if (progressInfo.status === 'progress' && progressInfo.progress !== undefined) {
            this.emit('progress', progressInfo.progress / 100);
          }
        },
      });

      this._isReady = true;
      this.emit('progress', 1);
      this.emit('status', 'Spanish translation model loaded');
      this.emit('ready');
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)));
      throw err;
    } finally {
      this._isLoading = false;
    }
  }

  /**
   * Queue a segment for translation. Results arrive later on the 'result'
   * event, tagged with the segment id — translation takes long enough that
   * blocking the transcript on it would stall the English display.
   */
  translate(id: string, text: string): void {
    if (!this._isReady) return;
    const trimmed = text.trim();
    if (!trimmed) return;

    this.queue.push({ id, text: trimmed });
    void this.drain();
  }

  /** Drop anything still waiting (session stop, or translation turned off). */
  clearQueue(): void {
    this.queue = [];
  }

  destroy(): void {
    this.translator = null;
    this._isReady = false;
    this.queue = [];
  }

  private async drain(): Promise<void> {
    if (this.processing) return;
    this.processing = true;

    try {
      while (this.queue.length > 0) {
        const next = this.queue.shift()!;
        try {
          const output = await this.translator(next.text);
          const translated = Array.isArray(output)
            ? (output[0]?.translation_text ?? '')
            : (output?.translation_text ?? '');
          const trimmed = String(translated).trim();
          if (trimmed) {
            this.emit('result', { id: next.id, text: trimmed } as TranslationResult);
          }
        } catch (err) {
          // One bad segment should not stop the rest of the service being
          // translated, so log and carry on rather than tearing down the queue.
          console.error('[Translate] Segment failed:', err);
          this.emit('error', err instanceof Error ? err : new Error(String(err)));
        }
      }
    } finally {
      this.processing = false;
    }
  }

  private getCacheDir(): string {
    return path.join(app.getPath('userData'), 'models');
  }
}
