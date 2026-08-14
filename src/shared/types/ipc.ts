import { TranscriptSegment } from './transcript';

// IPC channel names
export const IPC_CHANNELS = {
  // Transcript
  TRANSCRIPT_SEGMENT: 'transcript:segment',
  TRANSCRIPT_CLEAR: 'transcript:clear',
  TRANSCRIPT_EXPORT: 'transcript:export',
  /** Operator correction: control → main, then main → display + network viewers */
  TRANSCRIPT_UPDATE: 'transcript:update',

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
  /** Secondary display window, for putting a second language on its own screen */
  DISPLAY_SECONDARY_OPEN: 'display:secondary:open',
  DISPLAY_SECONDARY_CLOSE: 'display:secondary:close',
  /** Monitor enumeration and per-window placement */
  DISPLAY_SCREENS: 'display:screens',
  DISPLAY_MOVE_TO_SCREEN: 'display:move-to-screen',
  DISPLAY_WINDOW_STATE: 'display:window-state',

  // Translation
  TRANSLATION_SETTINGS_UPDATE: 'translation:settings:update',
  /** Translation for a segment, pushed once the model finishes with it */
  TRANSLATION_SEGMENT: 'translation:segment',
  /** Tells a display window which language(s) to render */
  TRANSLATION_LANGUAGE_SET: 'translation:language:set',

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

/** An operator's correction to a segment that is already on screen. */
export interface SegmentUpdate {
  id: string;
  text: string;
}

/** A finished translation, delivered after the segment it belongs to. */
export interface SegmentTranslation {
  id: string;
  translation: string;
}

/** A monitor the operator can send a display window to. */
export interface ScreenInfo {
  id: number;
  label: string;
  width: number;
  height: number;
  isPrimary: boolean;
  /** True if a display window is currently on this screen. */
  occupiedBy: ('primary' | 'secondary')[];
}

/** Which display windows are open, so the control panel can reflect reality. */
export interface DisplayWindowState {
  primaryOpen: boolean;
  secondaryOpen: boolean;
  primaryScreenId: number | null;
  secondaryScreenId: number | null;
}
