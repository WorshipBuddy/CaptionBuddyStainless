import { useState, useEffect, useRef, useCallback } from 'react';
import { ControlAPI } from '../../preload/control';
import { TranscriptSegment } from '../../shared/types/transcript';
import {
  AudioDevice,
  NetworkStatus,
  AppStatusEvent,
  ScreenInfo,
  DisplayWindowState,
} from '../../shared/types/ipc';
import {
  TranslationSettings,
  DEFAULT_SETTINGS,
  LanguageMode,
  DISPLAY_THEMES,
  DisplayThemeKey,
} from '../../shared/types/settings';
import { parseBibleReferences } from '../../shared/bibleReferences';
import logoSrc from '../../assets/logo.png';

declare global {
  interface Window {
    autoscribe: ControlAPI;
  }
}

const LANGUAGE_LABELS: Record<LanguageMode, string> = {
  english: 'EN',
  spanish: 'ES',
  both: 'BOTH',
};

/**
 * Status/latency indicator. The design system reuses the semantic states here
 * rather than inventing colours: Info = listening, Success = live/synced,
 * Warning = lagging, Error = disconnected.
 */
const STATUS_PRESENTATION: Record<
  'idle' | 'recording' | 'paused',
  { label: string; color: string; pulse: boolean }
> = {
  idle: { label: 'Standby', color: 'var(--ui-faint)', pulse: false },
  recording: { label: 'Live', color: 'var(--success)', pulse: true },
  paused: { label: 'Paused', color: 'var(--warning)', pulse: false },
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return <h3 className="eyebrow mb-3">{children}</h3>;
}

// ─── Operator UI theme ──────────────────────────────────────────────────────

type UiTheme = 'light' | 'dark';

const UI_THEME_STORAGE_KEY = 'captionbuddy-ui-theme';

/**
 * The design system prescribes the dark palette for the operator view, so that
 * is the default — but the panel also gets used in daylit rooms and at
 * rehearsal, so the operator can switch and the choice sticks per machine.
 */
function readStoredTheme(): UiTheme {
  try {
    const saved = localStorage.getItem(UI_THEME_STORAGE_KEY);
    if (saved === 'light' || saved === 'dark') return saved;
  } catch {
    /* private mode / storage disabled */
  }
  return 'dark';
}

/** Outlined icons, consistent 1.5 stroke — the system's iconography rule. */
function ThemeToggle({ theme, onToggle }: { theme: UiTheme; onToggle: () => void }) {
  const goingTo = theme === 'dark' ? 'light' : 'dark';
  return (
    <button
      className="btn btn-ghost btn-icon"
      onClick={onToggle}
      title={`Switch to ${goingTo} mode`}
      aria-label={`Switch to ${goingTo} mode`}
    >
      <svg
        width="16"
        height="16"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {theme === 'dark' ? (
          // Currently dark → offer the sun
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : (
          // Currently light → offer the moon
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
        )}
      </svg>
    </button>
  );
}

function FormattedSegment({ text, className }: { text: string; className?: string }) {
  const parts = parseBibleReferences(text);
  const hasRef = parts.some((p) => p.isReference);

  if (!hasRef) {
    return <p className={className}>{text}</p>;
  }

  return (
    <div className={className}>
      {parts.map((part, i) =>
        part.isReference ? (
          <p key={i} className="font-semibold my-2 text-ui-accent">{part.text}</p>
        ) : (
          <p key={i}>{part.text}</p>
        )
      )}
    </div>
  );
}

function EditableSegment({
  segment,
  className,
  isLive,
  onCommit,
}: {
  segment: TranscriptSegment;
  className?: string;
  isLive: boolean;
  onCommit: (id: string, text: string) => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState(segment.text);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const beginEdit = () => {
    setDraft(segment.text);
    setIsEditing(true);
  };

  const commit = () => {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== segment.text) {
      onCommit(segment.id, trimmed);
    }
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(segment.text);
    setIsEditing(false);
  };

  useEffect(() => {
    if (!isEditing) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    el.setSelectionRange(el.value.length, el.value.length);
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }, [isEditing]);

  if (isEditing) {
    return (
      <div className="mb-2">
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            e.target.style.height = 'auto';
            e.target.style.height = `${e.target.scrollHeight}px`;
          }}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              commit();
            } else if (e.key === 'Escape') {
              e.preventDefault();
              cancel();
            }
          }}
          rows={1}
          aria-label="Edit transcript line"
          className="input resize-none leading-relaxed"
        />
        <p className="input-hint font-mono">
          Enter to save · Shift+Enter for new line · Esc to cancel
        </p>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title="Click to edit"
      onClick={beginEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          beginEdit();
        }
      }}
      /* The line currently on the screens carries a CapB Violet edge, the same
         way PresenterBuddy's confidence monitor marks the live slide. */
      className={`group relative cursor-text rounded-md px-4 py-1 -mx-1 border-l-2 transition-colors ${
        isLive ? 'border-capb bg-ui-live' : 'border-transparent'
      } hover:bg-ui-hover`}
    >
      <FormattedSegment text={segment.text} className={className} />
      {segment.editedAt !== undefined && (
        <span className="absolute top-1 right-1 font-mono text-mono-sm uppercase tracking-widest text-ui-faint opacity-0 group-hover:opacity-100">
          edited
        </span>
      )}
    </div>
  );
}

// ─── Settings Modal ─────────────────────────────────────────────────────────

function SettingsModal({
  open,
  onClose,
  audioDevices,
  selectedDevice,
  setSelectedDevice,
  inputType,
  setInputType,
  wpm,
  setWpm,
  fontFamily,
  setFontFamily,
  fontSize,
  setFontSize,
  displayTheme,
  setDisplayTheme,
  translation,
  updateTranslation,
  networkStatus,
  toggleNetwork,
  qrCode,
  screens,
  windowState,
  audioTesting,
  setAudioTesting,
  audioLevel,
  status,
  sendDisplaySettings,
}: {
  open: boolean;
  onClose: () => void;
  audioDevices: AudioDevice[];
  selectedDevice: string;
  setSelectedDevice: (d: string) => void;
  inputType: 'microphone' | 'line-in';
  setInputType: (t: 'microphone' | 'line-in') => void;
  wpm: number;
  setWpm: (w: number) => void;
  fontFamily: string;
  setFontFamily: (f: string) => void;
  fontSize: number;
  setFontSize: (s: number) => void;
  displayTheme: DisplayThemeKey;
  setDisplayTheme: (t: DisplayThemeKey) => void;
  translation: TranslationSettings;
  updateTranslation: (partial: Partial<TranslationSettings>) => void;
  networkStatus: NetworkStatus | null;
  toggleNetwork: () => void;
  qrCode: string | null;
  screens: ScreenInfo[];
  windowState: DisplayWindowState;
  audioTesting: boolean;
  setAudioTesting: (t: boolean) => void;
  audioLevel: number;
  status: 'idle' | 'recording' | 'paused';
  sendDisplaySettings: (partial: Record<string, unknown>) => void;
}) {
  const wpmDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm pt-2xl px-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="settings-title"
      onClick={onClose}
    >
      <div
        className="card w-full max-w-2xl max-h-[80vh] overflow-y-auto !p-0 shadow-hover"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-md py-sm border-b border-ui-border sticky top-0 bg-ui-surface z-10">
          <h2 id="settings-title" className="section-title text-heading text-white">
            Settings
          </h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="btn btn-ghost btn-sm !px-2"
          >
            ✕
          </button>
        </div>

        <div className="px-md py-sm space-y-lg">
          {/* Audio */}
          <section>
            <SectionHeading>Audio Input</SectionHeading>
            {status !== 'idle' && (
              <p className="callout callout-warning mb-3" role="status">
                Stop the session to change device.
              </p>
            )}
            <label htmlFor="audio-device" className="input-label">
              Device
            </label>
            <select
              id="audio-device"
              className="input"
              value={selectedDevice}
              disabled={status !== 'idle'}
              onChange={(e) => {
                const deviceId = e.target.value;
                setSelectedDevice(deviceId);
                const device = audioDevices.find((d) => d.deviceId === deviceId);
                const detectedType = device?.inputType ?? 'microphone';
                setInputType(detectedType);
                window.autoscribe.updateSettings({ audio: { deviceId, inputType: detectedType } as any });
              }}
            >
              {audioDevices.map((d) => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
            <div className="mt-md">
              <span className="input-label">Input level</span>
              <div className="flex items-center gap-xs">
                <div
                  className="flex-1 h-2 bg-ui-border-strong rounded-sm overflow-hidden"
                  role="meter"
                  aria-label="Audio input level"
                  aria-valuenow={Math.round(Math.min(100, audioLevel * 500))}
                  aria-valuemin={0}
                  aria-valuemax={100}
                >
                  <div
                    className="h-full transition-all duration-100"
                    style={{
                      width: `${Math.min(100, audioLevel * 500)}%`,
                      // Semantic states, not decorative colours: hot → Error,
                      // warm → Warning, healthy → Success.
                      backgroundColor:
                        audioLevel > 0.15
                          ? 'var(--error)'
                          : audioLevel > 0.05
                          ? 'var(--warning)'
                          : 'var(--success)',
                    }}
                  />
                </div>
                {status === 'idle' && (
                  <button
                    className={`btn btn-sm ${audioTesting ? 'btn-danger' : 'btn-ghost'}`}
                    onClick={async () => {
                      if (audioTesting) {
                        await window.autoscribe.stopAudioTest();
                        setAudioTesting(false);
                      } else {
                        await window.autoscribe.startAudioTest();
                        setAudioTesting(true);
                      }
                    }}
                  >
                    {audioTesting ? 'Stop test' : 'Test'}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Pacing */}
          <section>
            <SectionHeading>Pacing</SectionHeading>
            <label htmlFor="pacing-wpm" className="input-label">
              Speed <span className="font-mono text-mono-md text-ui-accent">{wpm} WPM</span>
            </label>
            <input
              id="pacing-wpm"
              type="range"
              min={150}
              max={300}
              value={wpm}
              onChange={(e) => {
                const newWpm = Number(e.target.value);
                setWpm(newWpm);
                if (wpmDebounceRef.current) clearTimeout(wpmDebounceRef.current);
                wpmDebounceRef.current = setTimeout(() => {
                  window.autoscribe.updateSettings({ pacing: { mode: 'sentence', wpm: newWpm, sentenceDelay: 500 } });
                }, 100);
              }}
              className="w-full accent-capb"
            />
            <div className="flex justify-between font-mono text-mono-sm text-ui-faint">
              <span>SLOWER · 150</span>
              <span>FASTER · 300</span>
            </div>
          </section>

          {/* Display */}
          <section>
            <SectionHeading>Caption Output</SectionHeading>
            <div className="grid grid-cols-2 gap-sm">
              <div>
                <label htmlFor="display-font" className="input-label">Font</label>
                <select
                  id="display-font"
                  className="input"
                  value={fontFamily}
                  onChange={(e) => {
                    setFontFamily(e.target.value);
                    sendDisplaySettings({ fontFamily: e.target.value });
                  }}
                >
                  {/* Satoshi is the system's caption-display face — Instrument
                      Serif is never used for live caption text. */}
                  <option value="Satoshi, system-ui, sans-serif">Satoshi (recommended)</option>
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Verdana, sans-serif">Verdana</option>
                  <option value="OpenDyslexic, sans-serif">OpenDyslexic</option>
                </select>
              </div>
              <div>
                <label htmlFor="display-size" className="input-label">
                  Size <span className="font-mono text-mono-md text-ui-accent">{fontSize}px</span>
                </label>
                <input
                  id="display-size"
                  type="number"
                  min={24}
                  max={200}
                  value={fontSize}
                  onChange={(e) => {
                    const size = Math.min(200, Math.max(24, Number(e.target.value)));
                    setFontSize(size);
                    sendDisplaySettings({ fontSize: size });
                  }}
                  className="input"
                />
              </div>
            </div>
            <span className="input-label mt-md">Theme</span>
            <div className="flex gap-xs">
              {(Object.keys(DISPLAY_THEMES) as DisplayThemeKey[]).map((key) => {
                const theme = DISPLAY_THEMES[key];
                return (
                  <button
                    key={key}
                    aria-pressed={displayTheme === key}
                    className={`seg flex-1 ${displayTheme === key ? 'seg-active' : ''}`}
                    onClick={() => {
                      setDisplayTheme(key);
                      sendDisplaySettings({
                        textColor: theme.textColor,
                        backgroundColor: theme.backgroundColor,
                        highContrast: theme.highContrast,
                      });
                    }}
                  >
                    {theme.label}
                  </button>
                );
              })}
            </div>
            <p className="input-hint">
              Broadcast convention is white on pure black — the congregation sees only the words.
            </p>
          </section>

          {/* Screens */}
          <section>
            <SectionHeading>Screens</SectionHeading>
            {(['primary', 'secondary'] as const).map((role) => {
              const isOpen = role === 'primary' ? windowState.primaryOpen : windowState.secondaryOpen;
              const currentScreen = role === 'primary' ? windowState.primaryScreenId : windowState.secondaryScreenId;
              const label = role === 'primary' ? 'Display 1' : 'Display 2';
              return (
                <div key={role} className="mb-md">
                  <div className="flex items-center justify-between mb-1">
                    <span className="input-label !mb-0">{label}</span>
                    <button
                      className={`btn btn-sm ${isOpen ? 'btn-ghost' : 'btn-capb'}`}
                      onClick={() => {
                        if (role === 'primary') {
                          isOpen ? window.autoscribe.closeDisplay() : window.autoscribe.openDisplay();
                        } else {
                          isOpen ? window.autoscribe.closeSecondaryDisplay() : window.autoscribe.openSecondaryDisplay();
                        }
                      }}
                    >
                      {isOpen ? 'Close' : 'Open'}
                    </button>
                  </div>
                  <select
                    aria-label={`Screen for ${label}`}
                    className="input"
                    disabled={!isOpen || screens.length === 0}
                    value={currentScreen ?? ''}
                    onChange={(e) => {
                      const screenId = Number(e.target.value);
                      if (!isNaN(screenId)) window.autoscribe.moveDisplayToScreen(role, screenId);
                    }}
                  >
                    {!isOpen && <option value="">Window not open</option>}
                    {screens.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} — {s.width}×{s.height}{s.isPrimary ? ' (main)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              );
            })}
          </section>

          {/* Languages / Translation */}
          <section>
            <SectionHeading>Languages</SectionHeading>
            <label className="flex items-center gap-xs cursor-pointer mb-2">
              <input
                type="checkbox"
                className="accent-capb w-4 h-4"
                checked={translation.enabled}
                onChange={(e) => updateTranslation({ enabled: e.target.checked })}
              />
              <span className="text-body-sm text-ui-text">Enable Spanish translation</span>
            </label>
            {translation.enabled && (
              <div className="space-y-md pl-md">
                {([
                  ['displayLanguage', 'Display 1 shows'],
                  ['secondaryLanguage', 'Display 2 shows'],
                  ['viewerDefaultLanguage', 'Phones default to'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <span className="input-label">{label}</span>
                    <div className="flex gap-xs" role="group" aria-label={label}>
                      {(['english', 'spanish', 'both'] as const).map((mode) => (
                        <button
                          key={mode}
                          aria-pressed={translation[key] === mode}
                          className={`seg flex-1 ${translation[key] === mode ? 'seg-active' : ''}`}
                          onClick={() => updateTranslation({ [key]: mode })}
                        >
                          {LANGUAGE_LABELS[mode]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Network */}
          <section className="pb-sm">
            <SectionHeading>Network Viewers</SectionHeading>
            <button
              className={`btn ${networkStatus?.running ? 'btn-ghost' : 'btn-capb'}`}
              onClick={toggleNetwork}
            >
              {networkStatus?.running ? 'Stop server' : 'Start server'}
            </button>
            {networkStatus?.running && (
              <div className="mt-md space-y-xs">
                <p className="flex items-center gap-xs">
                  <span className="eyebrow-muted">URL</span>
                  <span className="font-mono text-mono-md text-ui-accent">{networkStatus.url}</span>
                </p>
                <p className="flex items-center gap-xs">
                  <span className="eyebrow-muted">Viewers</span>
                  <span className="font-mono text-mono-md text-white">{networkStatus.connectedClients}</span>
                </p>
                {qrCode && (
                  <div className="flex justify-center pt-xs">
                    <img
                      src={qrCode}
                      alt="QR code linking to the viewer page"
                      className="w-32 h-32 rounded-md bg-white p-2"
                    />
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}

// ─── Main App ───────────────────────────────────────────────────────────────

export function ControlApp() {
  const [splash, setSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [wpm, setWpm] = useState(150);
  const [fontFamily, setFontFamily] = useState(DEFAULT_SETTINGS.display.fontFamily);
  const [fontSize, setFontSize] = useState(DEFAULT_SETTINGS.display.fontSize);
  const [displayTheme, setDisplayTheme] = useState<DisplayThemeKey>('caption');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [appErrors, setAppErrors] = useState<string[]>([]);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDevice, setSelectedDevice] = useState('default');
  const [inputType, setInputType] = useState<'microphone' | 'line-in'>('microphone');
  const [audioTesting, setAudioTesting] = useState(false);
  const [translation, setTranslation] = useState<TranslationSettings>(DEFAULT_SETTINGS.translation);
  const [screens, setScreens] = useState<ScreenInfo[]>([]);
  const [windowState, setWindowState] = useState<DisplayWindowState>({
    primaryOpen: false,
    secondaryOpen: false,
    primaryScreenId: null,
    secondaryScreenId: null,
  });
  const [showSettings, setShowSettings] = useState(false);
  const [uiTheme, setUiTheme] = useState<UiTheme>(readStoredTheme);

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const spanishEndRef = useRef<HTMLDivElement>(null);

  // Applied to <html> rather than the app root so the browser paints the page
  // background in the right theme before React mounts anything.
  useEffect(() => {
    document.documentElement.setAttribute('data-ui-theme', uiTheme);
    try {
      localStorage.setItem(UI_THEME_STORAGE_KEY, uiTheme);
    } catch {
      /* private mode / storage disabled */
    }
  }, [uiTheme]);

  const toggleTheme = useCallback(() => {
    setUiTheme((prev) => (prev === 'dark' ? 'light' : 'dark'));
  }, []);

  // Splash screen timer
  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 2700);
    const hideTimer = setTimeout(() => setSplash(false), 3000);
    return () => { clearTimeout(fadeTimer); clearTimeout(hideTimer); };
  }, []);

  // Subscribe to errors and model load progress
  useEffect(() => {
    const unsub = window.autoscribe.onAppStatus((event: AppStatusEvent) => {
      if (event.type === 'error' || event.type === 'warning') {
        setAppErrors((prev) => [...prev, event.message]);
      } else if (event.type === 'progress') {
        const pct = event.progress ?? 0;
        setModelProgress(pct >= 1 ? null : pct);
      } else if (event.type === 'info' && event.message.includes('loaded')) {
        setModelProgress(null);
      }
    });
    return unsub;
  }, []);

  // Hydrate from persisted settings
  useEffect(() => {
    window.autoscribe.getSettings().then((settings) => {
      if (settings.display) {
        setFontFamily(settings.display.fontFamily);
        setFontSize(settings.display.fontSize);
        if (settings.display.highContrast) setDisplayTheme('high-contrast');
        else if (settings.display.backgroundColor === DISPLAY_THEMES.caption.backgroundColor)
          setDisplayTheme('caption');
        else setDisplayTheme('light');
      }
      if (settings.pacing) setWpm(settings.pacing.wpm);
      if (settings.audio) {
        setSelectedDevice(settings.audio.deviceId);
        setInputType(settings.audio.inputType);
      }
      if (settings.translation) {
        setTranslation({ ...DEFAULT_SETTINGS.translation, ...settings.translation });
      }
    });
  }, []);

  useEffect(() => { window.autoscribe.getAudioDevices().then(setAudioDevices); }, []);

  useEffect(() => {
    const unsub = window.autoscribe.onAudioLevel((level) => setAudioLevel(level));
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = window.autoscribe.onTranscriptSegment((segment) => {
      setSegments((prev) => [...prev, segment].slice(-500));
    });
    return unsub;
  }, []);

  // Auto-scroll
  const newestSegmentId = segments.length > 0 ? segments[segments.length - 1].id : null;
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    spanishEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [newestSegmentId]);

  const handleSegmentEdit = useCallback((id: string, text: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, text, editedAt: Date.now() } : s))
    );
    window.autoscribe.updateSegment(id, text);
  }, []);

  // Translations
  useEffect(() => {
    const unsub = window.autoscribe.onTranslationSegment(({ id, translation: text }) => {
      setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, translation: text } : s)));
    });
    return unsub;
  }, []);

  // Window state
  useEffect(() => {
    const refresh = () => {
      window.autoscribe.getScreens().then(setScreens);
      window.autoscribe.getDisplayWindowState().then(setWindowState);
    };
    refresh();
    const unsub = window.autoscribe.onDisplayWindowState((state) => {
      setWindowState(state);
      window.autoscribe.getScreens().then(setScreens);
    });
    return unsub;
  }, []);

  const updateTranslation = useCallback(async (partial: Partial<TranslationSettings>) => {
    setTranslation((prev) => ({ ...prev, ...partial }));
    const applied = await window.autoscribe.updateTranslationSettings(partial);
    if (applied) setTranslation(applied);
  }, []);

  const sendDisplaySettings = (partial: Record<string, unknown>) => {
    window.autoscribe.updateSettings({ display: partial as any });
  };

  const toggleNetwork = useCallback(async () => {
    if (networkStatus?.running) {
      await window.autoscribe.stopNetwork();
      setNetworkStatus(null);
      setQrCode(null);
    } else {
      await window.autoscribe.startNetwork();
      const ns = await window.autoscribe.getNetworkStatus();
      setNetworkStatus(ns);
      const qr = await window.autoscribe.getNetworkQR();
      setQrCode(qr);
    }
  }, [networkStatus]);

  const startSession = useCallback(async () => {
    if (audioTesting) {
      await window.autoscribe.stopAudioTest();
      setAudioTesting(false);
    }
    await window.autoscribe.startSession();
    setStatus('recording');
  }, [audioTesting]);

  const pauseSession = useCallback(async () => {
    await window.autoscribe.pauseSession();
    setStatus('paused');
  }, []);

  const resumeSession = useCallback(async () => {
    await window.autoscribe.resumeSession();
    setStatus('recording');
  }, []);

  const stopSession = useCallback(async () => {
    await window.autoscribe.stopSession();
    setStatus('idle');
    setAudioLevel(0);
  }, []);

  const handleExport = useCallback(async () => {
    await window.autoscribe.exportTranscript();
    setSegments([]);
  }, []);

  const handleDiscard = useCallback(() => {
    setSegments([]);
  }, []);

  if (splash) {
    return (
      <div
        className={`h-screen bg-ui-bg flex items-center justify-center transition-opacity duration-300 ${
          splashFading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <img src={logoSrc} alt="CaptionBuddy" className="max-w-md w-3/4" />
      </div>
    );
  }

  const statusPresentation = STATUS_PRESENTATION[status];
  const liveSegmentId = status === 'recording' ? newestSegmentId : null;

  return (
    /* Operator / confidence view — dark UI palette, per the CaptionBuddy
       desktop patterns in the design system. */
    <div className="h-screen bg-ui-bg text-ui-text flex flex-col">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-lg h-[60px] shrink-0 border-b border-ui-border">
        <div className="flex items-center gap-md">
          <div className="w-7 h-7 bg-capb rounded-md flex items-center justify-center shrink-0">
            <span className="text-white font-bold text-body-sm leading-none">C</span>
          </div>
          <div>
            <h1 className="font-bold text-[15px] leading-tight text-ui-text">CaptionBuddy</h1>
            <p className="eyebrow-muted !text-[10px]">Live Caption &amp; Translation</p>
          </div>
        </div>

        <div className="flex items-center gap-md">
          {/* Status indicator */}
          <div className="flex items-center gap-2" role="status" aria-live="polite">
            <span
              className={`badge-dot ${status === 'recording' ? 'animate-pulse' : ''}`}
              style={{ backgroundColor: statusPresentation.color }}
            />
            <span className="eyebrow-muted">{statusPresentation.label}</span>
          </div>

          {/* Network badge */}
          {networkStatus?.running && (
            <span className="badge badge-neutral">
              <span className="badge-dot" style={{ backgroundColor: 'var(--success)' }} />
              {networkStatus.url.replace('http://', '')}
            </span>
          )}

          <ThemeToggle theme={uiTheme} onToggle={toggleTheme} />

          <button className="btn btn-ghost btn-sm" onClick={() => setShowSettings(true)}>
            Settings
          </button>
        </div>
      </header>

      {/* ─── Toolbar ────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-sm px-lg py-md shrink-0 border-b border-ui-border bg-ui-surface">
        <div className="flex items-center gap-xs">
          {status === 'idle' ? (
            <button className="btn btn-capb" onClick={startSession}>
              <span className="badge-dot bg-white/70" />
              Start Captioning
            </button>
          ) : status === 'recording' ? (
            <>
              <button className="btn btn-warning" onClick={pauseSession}>Pause</button>
              <button className="btn btn-danger" onClick={stopSession}>Stop</button>
            </>
          ) : (
            <>
              <button className="btn btn-capb" onClick={resumeSession}>Resume</button>
              <button className="btn btn-danger" onClick={stopSession}>Stop</button>
            </>
          )}

          {/* Save Transcript */}
          {status === 'idle' && segments.length > 0 ? (
            <>
              <button className="btn btn-ghost" onClick={handleExport}>Save Transcript</button>
              <button className="btn btn-ghost !border-transparent" onClick={handleDiscard}>
                Discard
              </button>
            </>
          ) : (
            <button className="btn btn-ghost" disabled>Save Transcript</button>
          )}
        </div>

        {/* Language selector — CaptionBuddy's signature control. Mono language
            codes laid out as SOURCE → TARGET with a Violet active state. */}
        <div className="flex items-center gap-md shrink-0">
          <div className="flex items-center gap-2">
            <span className="eyebrow-muted">Source</span>
            <span className="seg seg-active cursor-default">EN</span>
          </div>
          <span aria-hidden="true" className="text-ui-faint">→</span>
          <div className="flex items-center gap-2">
            <span className="eyebrow-muted">Target</span>
            <div className="flex gap-1" role="group" aria-label="Target language">
              <button
                aria-pressed={translation.enabled}
                className={`seg ${translation.enabled ? 'seg-active' : ''}`}
                onClick={() => updateTranslation({ enabled: true })}
              >
                ES
              </button>
              <button
                aria-pressed={!translation.enabled}
                className={`seg ${!translation.enabled ? 'seg-active' : ''}`}
                onClick={() => updateTranslation({ enabled: false })}
              >
                OFF
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* ─── Model progress ─────────────────────────────────── */}
      {modelProgress !== null && (
        <div className="flex items-center gap-md px-lg py-2 shrink-0 bg-capb-dark text-white">
          <span className="eyebrow !text-white/70">Loading model</span>
          <div
            className="flex-1 h-1.5 bg-white/20 rounded-sm overflow-hidden"
            role="progressbar"
            aria-label="Model download progress"
            aria-valuenow={Math.round(modelProgress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${Math.round(modelProgress * 100)}%` }}
            />
          </div>
          <span className="font-mono text-mono-md tabular-nums">
            {Math.round(modelProgress * 100)}%
          </span>
        </div>
      )}

      {/* Error banners */}
      {appErrors.map((msg, i) => (
        <div
          key={i}
          role="alert"
          className="callout callout-error mx-lg mt-md flex items-center justify-between gap-sm shrink-0"
        >
          <span>{msg}</span>
          <button
            aria-label="Dismiss error"
            className="text-ui-muted hover:text-ui-text shrink-0"
            onClick={() => setAppErrors((prev) => prev.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}

      {/* ─── Split Transcript Panes ─────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: source transcript */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-ui-border">
          <div className="px-lg py-2 border-b border-ui-border shrink-0">
            <h2 className="eyebrow-muted">
              Source <span className="text-ui-muted">· EN</span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-lg py-md">
            {segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <p className="section-title text-title text-ui-text">Ready when you are</p>
                <p className="font-mono text-mono-sm uppercase tracking-widest text-ui-faint">
                  Press Start Captioning to begin
                </p>
              </div>
            ) : (
              segments.map((seg) => (
                <EditableSegment
                  key={seg.id}
                  segment={seg}
                  isLive={seg.id === liveSegmentId}
                  className="text-ui-text leading-relaxed text-body"
                  onCommit={handleSegmentEdit}
                />
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Right: target translation */}
        <div className="flex-1 flex flex-col min-w-0 bg-ui-surface">
          <div className="px-lg py-2 border-b border-ui-border shrink-0">
            <h2 className="eyebrow">
              Target <span className="text-ui-accent">· ES</span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-lg py-md">
            {!translation.enabled ? (
              <div className="flex flex-col items-center justify-center h-full text-center gap-2">
                <p className="section-title text-heading text-ui-muted">Translation is off</p>
                <p className="font-mono text-mono-sm uppercase tracking-widest text-ui-faint">
                  Switch target to ES to turn it on
                </p>
              </div>
            ) : segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="font-mono text-mono-sm uppercase tracking-widest text-ui-faint">
                  Translations appear here
                </p>
              </div>
            ) : (
              segments.map((seg) => (
                <div
                  key={seg.id}
                  className={`px-4 py-1 -mx-1 border-l-2 ${
                    seg.id === liveSegmentId ? 'border-capb bg-ui-live' : 'border-transparent'
                  }`}
                >
                  <p className="text-ui-text leading-relaxed text-body">
                    {seg.translation || (
                      /* Not-yet-certain text renders muted and italic so the
                         operator can spot it at a glance. */
                      <span className="italic text-ui-faint">Translating…</span>
                    )}
                  </p>
                </div>
              ))
            )}
            <div ref={spanishEndRef} />
          </div>
        </div>
      </div>

      {/* ─── Settings Modal ─────────────────────────────────── */}
      <SettingsModal
        open={showSettings}
        onClose={() => setShowSettings(false)}
        audioDevices={audioDevices}
        selectedDevice={selectedDevice}
        setSelectedDevice={setSelectedDevice}
        inputType={inputType}
        setInputType={setInputType}
        wpm={wpm}
        setWpm={setWpm}
        fontFamily={fontFamily}
        setFontFamily={setFontFamily}
        fontSize={fontSize}
        setFontSize={setFontSize}
        displayTheme={displayTheme}
        setDisplayTheme={setDisplayTheme}
        translation={translation}
        updateTranslation={updateTranslation}
        networkStatus={networkStatus}
        toggleNetwork={toggleNetwork}
        qrCode={qrCode}
        screens={screens}
        windowState={windowState}
        audioTesting={audioTesting}
        setAudioTesting={setAudioTesting}
        audioLevel={audioLevel}
        status={status}
        sendDisplaySettings={sendDisplaySettings}
      />
    </div>
  );
}
