import { app } from 'electron';
import path from 'path';
import { mkdir, writeFile, readFile, rm } from 'fs/promises';
import { existsSync } from 'fs';

export interface AudioSegmentEntry {
  /** Transcript segment ID (uuid) */
  segmentId: string;
  /** Filename of the WAV file on disk (relative to session dir) */
  audioFile: string;
  /** Transcribed text */
  text: string;
  /** Timestamp when the segment was recorded */
  timestamp: number;
  /** Duration in seconds */
  durationSeconds: number;
}

export interface AudioSegmentManifest {
  sessionId: string;
  createdAt: number;
  sampleRate: number;
  entries: AudioSegmentEntry[];
}

/**
 * Saves each audio segment to disk as a WAV file and maintains a JSON manifest
 * that maps segment IDs <-> audio filenames <-> transcript text.
 *
 * Storage layout:
 *   <userData>/audio-segments/<sessionId>/
 *     manifest.json
 *     segment-0001.wav
 *     segment-0002.wav
 *     ...
 */
export class AudioSegmentStore {
  private sessionDir: string | null = null;
  private manifest: AudioSegmentManifest | null = null;
  private segmentCounter = 0;
  private readonly sampleRate: number;

  constructor(sampleRate = 16000) {
    this.sampleRate = sampleRate;
  }

  /**
   * Start a new session. Creates the directory on disk.
   */
  async startSession(sessionId: string): Promise<string> {
    const baseDir = path.join(app.getPath('userData'), 'audio-segments');
    this.sessionDir = path.join(baseDir, sessionId);
    await mkdir(this.sessionDir, { recursive: true });

    this.segmentCounter = 0;
    this.manifest = {
      sessionId,
      createdAt: Date.now(),
      sampleRate: this.sampleRate,
      entries: [],
    };

    await this.saveManifest();
    return this.sessionDir;
  }

  /**
   * Save a Float32Array audio segment to disk as a WAV file and add it to the manifest.
   * Call this AFTER transcription so you have the segment ID and text.
   */
  async saveSegment(segmentId: string, audio: Float32Array, text: string): Promise<AudioSegmentEntry> {
    if (!this.sessionDir || !this.manifest) {
      throw new Error('AudioSegmentStore: no active session. Call startSession() first.');
    }

    this.segmentCounter++;
    const filename = `segment-${String(this.segmentCounter).padStart(4, '0')}.wav`;
    const filePath = path.join(this.sessionDir, filename);

    // Write WAV file
    const wavBuffer = this.encodeWav(audio);
    await writeFile(filePath, wavBuffer);

    const entry: AudioSegmentEntry = {
      segmentId,
      audioFile: filename,
      text,
      timestamp: Date.now(),
      durationSeconds: audio.length / this.sampleRate,
    };

    this.manifest.entries.push(entry);
    await this.saveManifest();

    return entry;
  }

  /**
   * Update the text for an existing entry (e.g. after operator correction).
   */
  async updateText(segmentId: string, newText: string): Promise<boolean> {
    if (!this.manifest) return false;
    const entry = this.manifest.entries.find((e) => e.segmentId === segmentId);
    if (!entry) return false;
    entry.text = newText;
    await this.saveManifest();
    return true;
  }

  /**
   * Look up an entry by segment ID.
   */
  getEntry(segmentId: string): AudioSegmentEntry | undefined {
    return this.manifest?.entries.find((e) => e.segmentId === segmentId);
  }

  /**
   * Get the full path to an audio file by segment ID.
   */
  getAudioPath(segmentId: string): string | null {
    if (!this.sessionDir || !this.manifest) return null;
    const entry = this.manifest.entries.find((e) => e.segmentId === segmentId);
    if (!entry) return null;
    return path.join(this.sessionDir, entry.audioFile);
  }

  /**
   * Get all entries (the full bidirectional map).
   */
  getAllEntries(): AudioSegmentEntry[] {
    return this.manifest?.entries ?? [];
  }

  /**
   * Get the manifest.
   */
  getManifest(): AudioSegmentManifest | null {
    return this.manifest ? { ...this.manifest } : null;
  }

  /**
   * Get the session directory path.
   */
  getSessionDir(): string | null {
    return this.sessionDir;
  }

  /**
   * End the current session (flushes manifest, resets state).
   */
  async endSession(): Promise<void> {
    if (this.manifest) {
      await this.saveManifest();
    }
    this.sessionDir = null;
    this.manifest = null;
    this.segmentCounter = 0;
  }

  /**
   * Load a manifest from a previous session.
   */
  static async loadSession(sessionId: string): Promise<AudioSegmentManifest | null> {
    const baseDir = path.join(app.getPath('userData'), 'audio-segments');
    const manifestPath = path.join(baseDir, sessionId, 'manifest.json');
    if (!existsSync(manifestPath)) return null;
    const data = await readFile(manifestPath, 'utf-8');
    return JSON.parse(data) as AudioSegmentManifest;
  }

  /**
   * List all session IDs that have audio stored on disk.
   */
  static async listSessions(): Promise<string[]> {
    const baseDir = path.join(app.getPath('userData'), 'audio-segments');
    if (!existsSync(baseDir)) return [];
    const { readdir } = await import('fs/promises');
    const entries = await readdir(baseDir, { withFileTypes: true });
    return entries.filter((e) => e.isDirectory()).map((e) => e.name);
  }

  /**
   * Delete a session's audio files from disk.
   */
  static async deleteSession(sessionId: string): Promise<void> {
    const baseDir = path.join(app.getPath('userData'), 'audio-segments');
    const sessionDir = path.join(baseDir, sessionId);
    if (existsSync(sessionDir)) {
      await rm(sessionDir, { recursive: true });
    }
  }

  // --- Private helpers ---

  private async saveManifest(): Promise<void> {
    if (!this.sessionDir || !this.manifest) return;
    const manifestPath = path.join(this.sessionDir, 'manifest.json');
    await writeFile(manifestPath, JSON.stringify(this.manifest, null, 2), 'utf-8');
  }

  /**
   * Encode a Float32Array as a 16-bit PCM WAV file.
   */
  private encodeWav(samples: Float32Array): Buffer {
    const numChannels = 1;
    const bitsPerSample = 16;
    const bytesPerSample = bitsPerSample / 8;
    const dataSize = samples.length * bytesPerSample;
    const headerSize = 44;
    const buffer = Buffer.alloc(headerSize + dataSize);

    // RIFF header
    buffer.write('RIFF', 0);
    buffer.writeUInt32LE(36 + dataSize, 4);
    buffer.write('WAVE', 8);

    // fmt sub-chunk
    buffer.write('fmt ', 12);
    buffer.writeUInt32LE(16, 16);              // Sub-chunk size
    buffer.writeUInt16LE(1, 20);               // PCM format
    buffer.writeUInt16LE(numChannels, 22);     // Mono
    buffer.writeUInt32LE(this.sampleRate, 24); // Sample rate
    buffer.writeUInt32LE(this.sampleRate * numChannels * bytesPerSample, 28); // Byte rate
    buffer.writeUInt16LE(numChannels * bytesPerSample, 32); // Block align
    buffer.writeUInt16LE(bitsPerSample, 34);   // Bits per sample

    // data sub-chunk
    buffer.write('data', 36);
    buffer.writeUInt32LE(dataSize, 40);

    // Convert Float32 [-1, 1] to Int16
    for (let i = 0; i < samples.length; i++) {
      const clamped = Math.max(-1, Math.min(1, samples[i]));
      const int16 = clamped < 0 ? clamped * 32768 : clamped * 32767;
      buffer.writeInt16LE(Math.round(int16), headerSize + i * 2);
    }

    return buffer;
  }
}
