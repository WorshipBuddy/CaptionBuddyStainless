import { mkdtemp, readFile, readdir, rm } from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { tmpdir } from 'os';

// Mock electron app.getPath to use a temp directory
let testBaseDir: string;

jest.mock('electron', () => ({
  app: { getPath: () => testBaseDir },
}));

import { AudioSegmentStore, AudioSegmentManifest } from '../AudioSegmentStore';

describe('AudioSegmentStore', () => {
  beforeEach(async () => {
    testBaseDir = await mkdtemp(path.join(tmpdir(), 'autoscribe-test-'));
  });

  afterEach(async () => {
    await rm(testBaseDir, { recursive: true, force: true });
  });

  function makeSineWave(durationSeconds: number, sampleRate = 16000): Float32Array {
    const samples = new Float32Array(durationSeconds * sampleRate);
    for (let i = 0; i < samples.length; i++) {
      samples[i] = Math.sin((2 * Math.PI * 440 * i) / sampleRate) * 0.5;
    }
    return samples;
  }

  describe('session lifecycle', () => {
    test('startSession creates a directory and manifest.json', async () => {
      const store = new AudioSegmentStore();
      const dir = await store.startSession('test-session-1');

      expect(existsSync(dir)).toBe(true);
      const manifestPath = path.join(dir, 'manifest.json');
      expect(existsSync(manifestPath)).toBe(true);

      const manifest = JSON.parse(await readFile(manifestPath, 'utf-8')) as AudioSegmentManifest;
      expect(manifest.sessionId).toBe('test-session-1');
      expect(manifest.entries).toEqual([]);
    });

    test('endSession flushes manifest and resets state', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('session-end-test');
      await store.saveSegment('seg1', makeSineWave(1), 'hello world');
      await store.endSession();

      // State is reset
      expect(store.getManifest()).toBeNull();
      expect(store.getSessionDir()).toBeNull();
    });
  });

  describe('saveSegment', () => {
    test('writes a WAV file and adds entry to manifest', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('save-test');

      const audio = makeSineWave(2);
      const entry = await store.saveSegment('seg-abc', audio, 'test transcript line');

      expect(entry.segmentId).toBe('seg-abc');
      expect(entry.text).toBe('test transcript line');
      expect(entry.audioFile).toBe('segment-0001.wav');
      expect(entry.durationSeconds).toBeCloseTo(2, 1);

      // Verify WAV file exists on disk
      const wavPath = path.join(store.getSessionDir()!, entry.audioFile);
      expect(existsSync(wavPath)).toBe(true);

      // Verify it's a valid WAV (check RIFF header)
      const wavData = await readFile(wavPath);
      expect(wavData.slice(0, 4).toString()).toBe('RIFF');
      expect(wavData.slice(8, 12).toString()).toBe('WAVE');
    });

    test('increments filenames for each segment', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('numbering-test');

      await store.saveSegment('a', makeSineWave(1), 'first');
      await store.saveSegment('b', makeSineWave(1), 'second');
      await store.saveSegment('c', makeSineWave(1), 'third');

      const entries = store.getAllEntries();
      expect(entries.map((e) => e.audioFile)).toEqual([
        'segment-0001.wav',
        'segment-0002.wav',
        'segment-0003.wav',
      ]);
    });

    test('throws if no session is active', async () => {
      const store = new AudioSegmentStore();
      await expect(
        store.saveSegment('x', makeSineWave(1), 'oops')
      ).rejects.toThrow('no active session');
    });
  });

  describe('bidirectional lookup', () => {
    test('getEntry finds segment by ID', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('lookup-test');
      await store.saveSegment('seg-1', makeSineWave(1), 'line one');
      await store.saveSegment('seg-2', makeSineWave(1), 'line two');

      const entry = store.getEntry('seg-2');
      expect(entry?.text).toBe('line two');
      expect(entry?.audioFile).toBe('segment-0002.wav');
    });

    test('getAudioPath returns full path for a segment', async () => {
      const store = new AudioSegmentStore();
      const dir = await store.startSession('path-test');
      await store.saveSegment('seg-x', makeSineWave(1), 'some text');

      const audioPath = store.getAudioPath('seg-x');
      expect(audioPath).toBe(path.join(dir, 'segment-0001.wav'));
    });

    test('getAudioPath returns null for unknown segment', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('missing-test');
      expect(store.getAudioPath('nonexistent')).toBeNull();
    });
  });

  describe('updateText', () => {
    test('updates text in manifest and persists to disk', async () => {
      const store = new AudioSegmentStore();
      const dir = await store.startSession('update-test');
      await store.saveSegment('seg-u', makeSineWave(1), 'original text');

      const updated = await store.updateText('seg-u', 'corrected text');
      expect(updated).toBe(true);
      expect(store.getEntry('seg-u')?.text).toBe('corrected text');

      // Verify persisted
      const manifest = JSON.parse(
        await readFile(path.join(dir, 'manifest.json'), 'utf-8')
      ) as AudioSegmentManifest;
      expect(manifest.entries[0].text).toBe('corrected text');
    });

    test('returns false for unknown segment', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('update-miss-test');
      expect(await store.updateText('nonexistent', 'nope')).toBe(false);
    });
  });

  describe('static methods', () => {
    test('listSessions returns session directory names', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('session-a');
      await store.endSession();
      await store.startSession('session-b');
      await store.endSession();

      const sessions = await AudioSegmentStore.listSessions();
      expect(sessions).toContain('session-a');
      expect(sessions).toContain('session-b');
    });

    test('loadSession loads a manifest from disk', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('load-test');
      await store.saveSegment('s1', makeSineWave(1), 'persisted');
      await store.endSession();

      const loaded = await AudioSegmentStore.loadSession('load-test');
      expect(loaded).not.toBeNull();
      expect(loaded!.sessionId).toBe('load-test');
      expect(loaded!.entries).toHaveLength(1);
      expect(loaded!.entries[0].text).toBe('persisted');
    });

    test('deleteSession removes the directory', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('delete-test');
      await store.saveSegment('d1', makeSineWave(1), 'doomed');
      await store.endSession();

      await AudioSegmentStore.deleteSession('delete-test');

      const sessions = await AudioSegmentStore.listSessions();
      expect(sessions).not.toContain('delete-test');
    });
  });

  describe('WAV encoding', () => {
    test('produces correct file size for known duration', async () => {
      const store = new AudioSegmentStore();
      await store.startSession('wav-size-test');

      const sampleRate = 16000;
      const durationSec = 3;
      const audio = makeSineWave(durationSec, sampleRate);
      await store.saveSegment('wv', audio, 'wav test');

      const wavPath = store.getAudioPath('wv')!;
      const wavData = await readFile(wavPath);

      // WAV = 44 byte header + (samples * 2 bytes per Int16 sample)
      const expectedSize = 44 + audio.length * 2;
      expect(wavData.length).toBe(expectedSize);
    });
  });
});
