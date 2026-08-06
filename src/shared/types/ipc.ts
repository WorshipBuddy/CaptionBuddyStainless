import { TranscriptSegment } from './transcript';

// IPC channel names
export const IPC_CHANNELS = {
  // Transcript
  TRANSCRIPT_SEGMENT: 'transcript:segment',
  TRANSCRIPT_CLEAR: 'transcript:clear',
  TRANSCRIPT_EXPORT: 'transcript:export',

  // Session
  SESSION_START: 'session:start',
  SESSION_STOP: 'session:stop',
  SESSION_PAUSE: 'session:pause',
  SESSION_RESUME: 'session:resume',
  SESSION_STATUS: 'session:status',

  // Settings
  SETTINGS_GET: 'settings:get',
  SETTINGS_UPDATE: 'settings:update',
  SETTINGS_DISPLAY_UPDATE: 'settings:display:update',
  SETTINGS_PACING_UPDATE: 'settings:pacing:update',

  // Audio
  AUDIO_DEVICES: 'audio:devices',
  AUDIO_LEVEL: 'audio:level',
  AUDIO_TEST_START: 'audio:test:start',
  AUDIO_TEST_STOP: 'audio:test:stop',

  // Display window
  DISPLAY_OPEN: 'display:open',
  DISPLAY_CLOSE: 'display:close',

  // STT
  STT_SET_TASK: 'stt:set-task',
  STT_GET_TASK: 'stt:get-task',

  // Network
  NETWORK_START: 'network:start',
  NETWORK_STOP: 'network:stop',
  NETWORK_STATUS: 'network:status',
  NETWORK_QR: 'network:qr',

  // App status / errors pushed from main → control window
  APP_STATUS: 'app:status',
} as const;

export interface AppStatusEvent {
  type: 'error' | 'warning' | 'progress' | 'info';
  message: string;
  /** 0–1 for type === 'progress', omitted otherwise */
  progress?: number;
}

export type SessionStatus = 'idle' | 'recording' | 'paused';

export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput';
  /** Best-guess input type inferred from device name and transport. */
  inputType?: 'microphone' | 'line-in';
}

export interface NetworkStatus {
  running: boolean;
  port: number;
  url: string;
  connectedClients: number;
}

// Paced segment sent to display
export interface PacedSegment {
  segment: TranscriptSegment;
  displayDuration: number;
}
