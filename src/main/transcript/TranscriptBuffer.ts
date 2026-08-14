import { TranscriptSegment } from '../../shared/types/transcript';

/**
 * Circular buffer for transcript segments.
 * Stores the most recent segments in memory and supports export.
 */
export class TranscriptBuffer {
  private segments: TranscriptSegment[] = [];
  private readonly maxSegments: number;

  constructor(maxSegments = 1000) {
    this.maxSegments = maxSegments;
  }

  add(segment: TranscriptSegment): void {
    this.segments.push(segment);
    // Trim oldest segments if over capacity
    if (this.segments.length > this.maxSegments) {
      this.segments = this.segments.slice(this.segments.length - this.maxSegments);
    }
  }

  /**
   * Replace the text of an already-buffered segment (operator correction).
   * Returns the updated segment, or null if it has aged out of the buffer.
   */
  update(id: string, text: string): TranscriptSegment | null {
    const index = this.segments.findIndex((s) => s.id === id);
    if (index === -1) return null;
    const updated = { ...this.segments[index], text, editedAt: Date.now() };
    this.segments[index] = updated;
    return updated;
  }

  /**
   * Attach a translation to a buffered segment. Returns the updated segment,
   * or null if it aged out while the translation model was working.
   */
  setTranslation(id: string, translation: string): TranscriptSegment | null {
    const index = this.segments.findIndex((s) => s.id === id);
    if (index === -1) return null;
    const updated = { ...this.segments[index], translation };
    this.segments[index] = updated;
    return updated;
  }

  getAll(): TranscriptSegment[] {
    return [...this.segments];
  }

  getRecent(count: number): TranscriptSegment[] {
    return this.segments.slice(-count);
  }

  clear(): void {
    this.segments = [];
  }

  get length(): number {
    return this.segments.length;
  }

  /**
   * Export as plain text, one segment per line.
   */
  exportText(): string {
    return this.segments
      .filter((s) => s.isFinal)
      .map((s) => s.text)
      .join('\n');
  }

  /**
   * Export as timestamped text.
   */
  exportTimestamped(): string {
    return this.segments
      .filter((s) => s.isFinal)
      .map((s) => {
        const time = new Date(s.timestamp).toLocaleTimeString();
        return `[${time}] ${s.text}`;
      })
      .join('\n');
  }
}
