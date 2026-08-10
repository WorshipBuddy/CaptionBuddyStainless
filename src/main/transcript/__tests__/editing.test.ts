import { TranscriptBuffer } from '../TranscriptBuffer';
import { PacingController } from '../PacingController';
import { TranscriptSegment } from '../../../shared/types/transcript';
import { PacedSegment } from '../../../shared/types/ipc';

function segment(id: string, text: string): TranscriptSegment {
  return { id, text, timestamp: Date.now(), confidence: 1, isFinal: true };
}

describe('TranscriptBuffer.update', () => {
  test('replaces the text of a buffered segment', () => {
    const buffer = new TranscriptBuffer();
    buffer.add(segment('a', 'and grace to you'));
    buffer.add(segment('b', 'from Proverbs 2:4'));

    const updated = buffer.update('b', 'from Proverbs 24:11');

    expect(updated?.text).toBe('from Proverbs 24:11');
    expect(buffer.getAll().map((s) => s.text)).toEqual([
      'and grace to you',
      'from Proverbs 24:11',
    ]);
  });

  test('marks the segment as edited', () => {
    const buffer = new TranscriptBuffer();
    buffer.add(segment('a', 'original'));
    expect(buffer.getAll()[0].editedAt).toBeUndefined();

    buffer.update('a', 'corrected');

    expect(buffer.getAll()[0].editedAt).toEqual(expect.any(Number));
  });

  test('preserves the segment id, timestamp and order', () => {
    const buffer = new TranscriptBuffer();
    const original = segment('a', 'original');
    buffer.add(original);
    buffer.add(segment('b', 'second'));

    buffer.update('a', 'corrected');
    const [first, second] = buffer.getAll();

    expect(first.id).toBe('a');
    expect(first.timestamp).toBe(original.timestamp);
    expect(second.id).toBe('b');
  });

  test('returns null for an id that has aged out of the buffer', () => {
    const buffer = new TranscriptBuffer(2);
    buffer.add(segment('a', 'oldest'));
    buffer.add(segment('b', 'middle'));
    buffer.add(segment('c', 'newest'));

    expect(buffer.update('a', 'too late')).toBeNull();
    expect(buffer.getAll().map((s) => s.id)).toEqual(['b', 'c']);
  });

  test('edits are reflected in the exported transcript', () => {
    const buffer = new TranscriptBuffer();
    buffer.add(segment('a', 'turn to Proverbs 2:4'));
    buffer.update('a', 'turn to Proverbs 24:11');

    expect(buffer.exportText()).toBe('turn to Proverbs 24:11');
    expect(buffer.exportTimestamped()).toContain('turn to Proverbs 24:11');
  });
});

describe('PacingController.updateQueued', () => {
  // enqueue() schedules a timer, so every controller has to be stopped or the
  // Jest worker is still holding an active handle when the suite finishes.
  const controllers: PacingController[] = [];

  function makePacing(mode: 'sentence' | 'instant'): PacingController {
    const pacing = new PacingController({
      mode,
      wpm: 150,
      sentenceDelay: mode === 'instant' ? 0 : 500,
    });
    controllers.push(pacing);
    return pacing;
  }

  afterEach(() => {
    while (controllers.length) controllers.pop()!.clear();
  });

  test('corrects a segment that has not been emitted yet', () => {
    const pacing = makePacing('sentence');
    const emitted: PacedSegment[] = [];
    pacing.on('paced', (p: PacedSegment) => emitted.push(p));

    pacing.enqueue(segment('a', 'first'));
    pacing.enqueue(segment('b', 'Proverbs 2:4'));

    // Nothing has drained yet, so the correction should land in the queue.
    expect(pacing.updateQueued('b', 'Proverbs 24:11')).toBe(true);

    pacing.flush();

    expect(emitted.map((p) => p.segment.text)).toContain('Proverbs 24:11');
    expect(emitted.map((p) => p.segment.text)).not.toContain('Proverbs 2:4');
  });

  test('reports false once the segment has left the queue', () => {
    const pacing = makePacing('instant');
    const emitted: PacedSegment[] = [];
    pacing.on('paced', (p: PacedSegment) => emitted.push(p));

    // Instant mode emits straight through without queueing.
    pacing.enqueue(segment('a', 'already on screen'));

    expect(emitted).toHaveLength(1);
    expect(pacing.updateQueued('a', 'corrected')).toBe(false);
  });

  test('reports false for an unknown id', () => {
    const pacing = makePacing('sentence');
    pacing.enqueue(segment('a', 'first'));

    expect(pacing.updateQueued('nope', 'corrected')).toBe(false);
  });

  test('an edit mid-stream is not overwritten word by word', () => {
    jest.useFakeTimers();
    try {
      const pacing = new PacingController({ mode: 'streaming', wpm: 600, sentenceDelay: 0 });
      controllers.push(pacing);
      const emitted: PacedSegment[] = [];
      pacing.on('paced', (p: PacedSegment) => emitted.push(p));

      pacing.enqueue(segment('a', 'turn to Proverbs two four'));

      // Let a couple of words go out, so the segment is mid-stream: out of the
      // queue, but not finished emitting.
      jest.advanceTimersByTime(300);
      expect(emitted.length).toBeGreaterThan(0);
      expect(emitted.length).toBeLessThan(5);

      // Not queued any more, so the caller is told to push the correction.
      expect(pacing.updateQueued('a', 'turn to Proverbs 24:11')).toBe(false);

      const countAtEdit = emitted.length;
      jest.advanceTimersByTime(5000);

      // The abandoned stream must not have emitted any more of the old text.
      expect(emitted.length).toBe(countAtEdit);
    } finally {
      jest.useRealTimers();
    }
  });

  test('does not disturb queue order', () => {
    const pacing = makePacing('sentence');
    const emitted: PacedSegment[] = [];
    pacing.on('paced', (p: PacedSegment) => emitted.push(p));

    pacing.enqueue(segment('a', 'first'));
    pacing.enqueue(segment('b', 'second'));
    pacing.enqueue(segment('c', 'third'));

    pacing.updateQueued('b', 'second corrected');
    pacing.flush();

    expect(emitted.map((p) => p.segment.id)).toEqual(['a', 'b', 'c']);
    expect(emitted[1].segment.text).toBe('second corrected');
  });
});
