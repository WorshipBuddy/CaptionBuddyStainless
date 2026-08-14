export type PacingMode = 'sentence' | 'streaming' | 'instant';
export type TextAlign = 'left' | 'center' | 'right';
export type AudioInputType = 'microphone' | 'line-in';

/** Which language(s) a display surface shows. */
export type LanguageMode = 'english' | 'spanish' | 'both';

export interface TranslationSettings {
  /** Master switch — when off, no translation model is loaded at all. */
  enabled: boolean;
  /** What the main display window shows. */
  displayLanguage: LanguageMode;
  /** What the secondary translation window shows, when it is open. */
  secondaryLanguage: LanguageMode;
  /** Default language for a phone that has not chosen one itself. */
  viewerDefaultLanguage: LanguageMode;
}

export interface DisplaySettings {
  fontFamily: string;
  fontSize: number;
  textColor: string;
  backgroundColor: string;
  lineHeight: number;
  textAlign: TextAlign;
  highContrast: boolean;
}

export interface PacingSettings {
  mode: PacingMode;
  wpm: number;
  sentenceDelay: number;
}

export interface AudioSettings {
  deviceId: string;
  inputType: AudioInputType;
  sampleRate: number;
  noiseGate: boolean;
  noiseThreshold: number;
}

export interface NetworkSettings {
  enabled: boolean;
  port: number;
}

export interface AppSettings {
  display: DisplaySettings;
  pacing: PacingSettings;
  audio: AudioSettings;
  network: NetworkSettings;
  translation: TranslationSettings;
}

export const DEFAULT_SETTINGS: AppSettings = {
  display: {
    fontFamily: 'Arial, sans-serif',
    fontSize: 32,
    textColor: '#000000',
    backgroundColor: '#FFFFFF',
    lineHeight: 1.6,
    textAlign: 'left',
    highContrast: false,
  },
  pacing: {
    mode: 'sentence',
    wpm: 150,
    sentenceDelay: 500,
  },
  audio: {
    deviceId: 'default',
    inputType: 'microphone',
    sampleRate: 16000,
    noiseGate: false,
    noiseThreshold: 0.005,
  },
  network: {
    enabled: false,
    port: 8080,
  },
  translation: {
    enabled: false,
    displayLanguage: 'english',
    secondaryLanguage: 'spanish',
    viewerDefaultLanguage: 'english',
  },
};
