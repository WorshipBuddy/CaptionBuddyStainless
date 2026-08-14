export interface TranscriptSegment {
  id: string;
  text: string;
  timestamp: number;
  confidence: number;
  isFinal: boolean;
  displayedAt?: number;
  /** Set when an operator corrected this segment's text from the control panel. */
  editedAt?: number;
  /** Spanish translation, filled in asynchronously when translation is enabled. */
  translation?: string;
}

export interface TranscriptSession {
  id: string;
  name: string;
  startTime: number;
  endTime?: number;
  segments: TranscriptSegment[];
}
