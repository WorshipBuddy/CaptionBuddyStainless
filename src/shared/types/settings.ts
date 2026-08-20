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

export type DisplayThemeKey = 'caption' | 'light' | 'high-contrast';

export interface DisplayTheme {
  label: string;
  textColor: string;
  backgroundColor: string;
  highContrast: boolean;
}

/**
 * Caption output themes. `caption` is the broadcast convention the design
 * system calls for — white on pure black, no chrome — and is the default.
 * `light` uses the system's warm-white/ink neutrals rather than pure #FFF/#000.
 */
export const DISPLAY_THEMES: Record<DisplayThemeKey, DisplayTheme> = {
  caption: {
    label: 'Caption',
    textColor: '#FFFFFF',
    backgroundColor: '#000000',
    highContrast: false,
  },
  light: {
    label: 'Light',
    textColor: '#18181B',
    backgroundColor: '#FAFAF9',
    highContrast: false,
  },
  'high-contrast': {
    label: 'Contrast',
    textColor: '#FFFF00',
    backgroundColor: '#000000',
    highContrast: true,
  },
};

export const DEFAULT_SETTINGS: AppSettings = {
  display: {
    // Satoshi is the design system's caption-display face; 1.4 is its
    // prescribed line height for caption output.
    fontFamily: 'Satoshi, system-ui, sans-serif',
    fontSize: 48,
    textColor: DISPLAY_THEMES.caption.textColor,
    backgroundColor: DISPLAY_THEMES.caption.backgroundColor,
    lineHeight: 1.4,
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
