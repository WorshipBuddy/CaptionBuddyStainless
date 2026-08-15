import { EventEmitter } from 'events';

export interface STTResult {
  text: string;
  isFinal: boolean;
  confidence: number;
  /** Raw Float32 PCM audio that produced this result (16kHz mono). */
  audio?: Float32Array;
}

/**
 * Abstract interface for speech-to-text engines.
 * Allows swapping between Whisper, Vosk, or other backends.
 */
export abstract class STTEngine extends EventEmitter {
  abstract readonly name: string;
  abstract readonly isReady: boolean;

  /** Initialize the engine and load the model. */
  abstract init(): Promise<void>;

  /** Feed raw PCM audio data (16kHz, 16-bit, mono). */
  abstract feedAudio(chunk: Buffer): void;

  /** Flush any buffered audio and get final results. */
  abstract flush(): Promise<void>;

  /** Release resources. */
  abstract destroy(): void;
}
