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
} from '../../shared/types/settings';
import { parseBibleReferences } from '../../shared/bibleReferences';
import logoSrc from '../../assets/logo.png';

declare global {
  interface Window {
    autoscribe: ControlAPI;
  }
}

const LANGUAGE_LABELS: Record<LanguageMode, string> = {
  english: 'English',
  spanish: 'Spanish',
  both: 'Both',
};

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
          <p key={i} className="font-bold my-2">{part.text}</p>
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
  onCommit,
}: {
  segment: TranscriptSegment;
  className?: string;
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
          className="w-full resize-none rounded border border-gray-300 px-3 py-2 leading-relaxed text-gray-900 focus:outline-none focus:ring-2 focus:ring-purple-500"
        />
        <p className="text-xs mt-1 text-gray-400">
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
      className="group relative cursor-text rounded px-3 py-1 -mx-3 hover:bg-purple-50 focus:outline-none focus:ring-2 focus:ring-purple-500"
    >
      <FormattedSegment text={segment.text} className={className} />
      {segment.editedAt !== undefined && (
        <span className="absolute top-1 right-1 text-[10px] uppercase tracking-wide text-gray-400 opacity-0 group-hover:opacity-100">
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
  displayTheme: 'light' | 'dark' | 'high-contrast';
  setDisplayTheme: (t: 'light' | 'dark' | 'high-contrast') => void;
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

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/30 pt-16">
      <div className="bg-white rounded-lg shadow-2xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 sticky top-0 bg-white z-10">
          <h2 className="text-lg font-semibold text-gray-900">Settings</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-xl leading-none"
          >
            ✕
          </button>
        </div>

        <div className="px-6 py-4 space-y-6">
          {/* Audio */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Audio Input</h3>
            {status !== 'idle' && (
              <p className="text-xs text-amber-600 mb-2">Stop session to change device.</p>
            )}
            <label className="block text-sm text-gray-600 mb-1">Device</label>
            <select
              className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 disabled:opacity-50"
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
            <div className="mt-3">
              <label className="block text-sm text-gray-600 mb-1">Audio Level</label>
              <div className="flex items-center gap-2">
                <div className="flex-1 h-2 bg-gray-200 rounded overflow-hidden">
                  <div
                    className="h-full transition-all duration-100"
                    style={{
                      width: `${Math.min(100, audioLevel * 500)}%`,
                      backgroundColor: audioLevel > 0.15 ? '#ef4444' : audioLevel > 0.05 ? '#eab308' : '#22c55e',
                    }}
                  />
                </div>
                {status === 'idle' && (
                  <button
                    className={`text-xs px-3 py-1 rounded font-medium ${
                      audioTesting ? 'bg-red-500 text-white' : 'bg-blue-500 text-white'
                    }`}
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
                    {audioTesting ? 'Stop Test' : 'Test'}
                  </button>
                )}
              </div>
            </div>
          </section>

          {/* Pacing */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Pacing</h3>
            <label className="block text-sm text-gray-600 mb-1">
              Speed: <span className="font-medium">{wpm} WPM</span>
            </label>
            <input
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
              className="w-full"
            />
            <div className="flex justify-between text-xs text-gray-400">
              <span>Slower (150)</span>
              <span>Faster (300)</span>
            </div>
          </section>

          {/* Display */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Display</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm text-gray-600 mb-1">Font</label>
                <select
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
                  value={fontFamily}
                  onChange={(e) => {
                    setFontFamily(e.target.value);
                    sendDisplaySettings({ fontFamily: e.target.value });
                  }}
                >
                  <option value="Arial, sans-serif">Arial</option>
                  <option value="Verdana, sans-serif">Verdana</option>
                  <option value="Georgia, serif">Georgia</option>
                  <option value="OpenDyslexic, sans-serif">OpenDyslexic</option>
                </select>
              </div>
              <div>
                <label className="block text-sm text-gray-600 mb-1">Size ({fontSize}px)</label>
                <input
                  type="number"
                  min={24}
                  max={200}
                  value={fontSize}
                  onChange={(e) => {
                    const size = Math.min(200, Math.max(24, Number(e.target.value)));
                    setFontSize(size);
                    sendDisplaySettings({ fontSize: size });
                  }}
                  className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900"
                />
              </div>
            </div>
            <label className="block text-sm text-gray-600 mt-3 mb-1">Theme</label>
            <div className="flex gap-2">
              {([
                ['light', 'Light', '#000000', '#FFFFFF'],
                ['dark', 'Dark', '#E5E7EB', '#1F2937'],
                ['high-contrast', 'Contrast', '#FFFF00', '#000000'],
              ] as const).map(([key, label, textColor, bgColor]) => (
                <button
                  key={key}
                  className={`flex-1 px-3 py-2 text-sm border rounded ${
                    displayTheme === key
                      ? 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                  onClick={() => {
                    setDisplayTheme(key);
                    sendDisplaySettings({ textColor, backgroundColor: bgColor, highContrast: key === 'high-contrast' });
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>

          {/* Screens */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Screens</h3>
            {(['primary', 'secondary'] as const).map((role) => {
              const isOpen = role === 'primary' ? windowState.primaryOpen : windowState.secondaryOpen;
              const currentScreen = role === 'primary' ? windowState.primaryScreenId : windowState.secondaryScreenId;
              return (
                <div key={role} className="mb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-sm text-gray-600">{role === 'primary' ? 'Display 1' : 'Display 2'}</span>
                    <button
                      className={`text-xs font-medium ${isOpen ? 'text-orange-500' : 'text-blue-500'}`}
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
                    className="w-full border border-gray-300 rounded px-3 py-2 text-sm text-gray-900 disabled:opacity-40"
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
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Languages</h3>
            <label className="flex items-center gap-2 cursor-pointer mb-2">
              <input
                type="checkbox"
                checked={translation.enabled}
                onChange={(e) => updateTranslation({ enabled: e.target.checked })}
              />
              <span className="text-sm text-gray-700">Enable Spanish translation</span>
            </label>
            {translation.enabled && (
              <div className="space-y-3 pl-6">
                {([
                  ['displayLanguage', 'Display 1 shows'],
                  ['secondaryLanguage', 'Display 2 shows'],
                  ['viewerDefaultLanguage', 'Phones default to'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className="block text-xs text-gray-500 mb-1">{label}</label>
                    <div className="flex gap-1.5">
                      {(['english', 'spanish', 'both'] as const).map((mode) => (
                        <button
                          key={mode}
                          className={`flex-1 px-2 py-1 text-xs border rounded ${
                            translation[key] === mode
                              ? 'border-purple-500 bg-purple-50 text-purple-700'
                              : 'border-gray-300 text-gray-500'
                          }`}
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
          <section>
            <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wide mb-3">Network Viewers</h3>
            <button
              className={`px-4 py-2 rounded text-white text-sm font-medium ${
                networkStatus?.running ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-500 hover:bg-blue-600'
              }`}
              onClick={toggleNetwork}
            >
              {networkStatus?.running ? 'Stop Server' : 'Start Server'}
            </button>
            {networkStatus?.running && (
              <div className="mt-3 space-y-2">
                <p className="text-sm text-gray-600">
                  <span className="font-medium">URL:</span>{' '}
                  <span className="text-blue-500">{networkStatus.url}</span>
                </p>
                <p className="text-sm text-gray-600">
                  <span className="font-medium">Viewers:</span> {networkStatus.connectedClients}
                </p>
                {qrCode && (
                  <div className="flex justify-center">
                    <img src={qrCode} alt="QR Code" className="w-32 h-32" />
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
  const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
  const [fontSize, setFontSize] = useState(32);
  const [displayTheme, setDisplayTheme] = useState<'light' | 'dark' | 'high-contrast'>('light');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [appErrors, setAppErrors] = useState<string[]>([]);
  const [modelProgress, setModelProgress] = useState<number | null>(null);
  const [sttLanguage, setSTTLanguage] = useState('en');
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
  const [targetLanguage, setTargetLanguage] = useState('Spanish');

  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const spanishEndRef = useRef<HTMLDivElement>(null);

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
        else if (settings.display.backgroundColor === '#1F2937') setDisplayTheme('dark');
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
        className={`h-screen bg-white flex items-center justify-center transition-opacity duration-300 ${
          splashFading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <img src={logoSrc} alt="CaptionBuddy" className="max-w-md w-3/4" />
      </div>
    );
  }

  return (
    <div className="h-screen bg-white flex flex-col">
      {/* ─── Header ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between px-5 py-3 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-purple-600 rounded-lg flex items-center justify-center">
            <span className="text-white font-bold text-sm">C</span>
          </div>
          <div>
            <h1 className="text-base font-bold text-gray-900 leading-tight">CaptionBuddy</h1>
            <p className="text-[10px] text-gray-400 uppercase tracking-widest">Live Caption & Translation</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {/* Status indicator */}
          <div className="flex items-center gap-1.5">
            <div className={`w-2 h-2 rounded-full ${
              status === 'recording' ? 'bg-red-500 animate-pulse' :
              status === 'paused' ? 'bg-yellow-500' : 'bg-gray-400'
            }`} />
            <span className="text-xs text-gray-500 uppercase">{status}</span>
          </div>
          {/* Network badge */}
          {networkStatus?.running && (
            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
              {networkStatus.url.replace('http://', '')}
            </span>
          )}
          {/* Settings */}
          <button
            className="px-3 py-1.5 text-sm border border-gray-300 rounded hover:bg-gray-50 text-gray-700"
            onClick={() => setShowSettings(true)}
          >
            Settings
          </button>
        </div>
      </header>

      {/* ─── Toolbar ────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100">
        <div className="flex items-center gap-3">
          {status === 'idle' ? (
            <button
              className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm"
              onClick={startSession}
            >
              <span className="w-2.5 h-2.5 bg-green-300 rounded-full" />
              Start Captioning
            </button>
          ) : status === 'recording' ? (
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-2 px-5 py-2.5 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg font-medium text-sm"
                onClick={pauseSession}
              >
                Pause
              </button>
              <button
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm"
                onClick={stopSession}
              >
                Stop
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                className="flex items-center gap-2 px-5 py-2.5 bg-green-600 hover:bg-green-700 text-white rounded-lg font-medium text-sm"
                onClick={resumeSession}
              >
                Resume
              </button>
              <button
                className="flex items-center gap-2 px-5 py-2.5 bg-red-600 hover:bg-red-700 text-white rounded-lg font-medium text-sm"
                onClick={stopSession}
              >
                Stop
              </button>
            </div>
          )}

          {/* Save Transcript */}
          {status === 'idle' && segments.length > 0 ? (
            <div className="flex items-center gap-2">
              <button
                className="px-4 py-2.5 text-sm border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50 font-medium"
                onClick={handleExport}
              >
                Save Transcript
              </button>
              <button
                className="px-4 py-2.5 text-sm text-gray-400 hover:text-gray-600"
                onClick={handleDiscard}
              >
                Discard
              </button>
            </div>
          ) : (
            <button
              className="px-4 py-2.5 text-sm border border-gray-200 rounded-lg text-gray-400 cursor-default"
              disabled
            >
              Save Transcript
            </button>
          )}
        </div>

        {/* Language selector */}
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500">EN → SP</span>
          <select
            className="border border-gray-300 rounded px-3 py-1.5 text-sm text-gray-700"
            value={targetLanguage}
            onChange={(e) => {
              setTargetLanguage(e.target.value);
              // Enable/disable translation based on selection
              if (e.target.value === 'None') {
                updateTranslation({ enabled: false });
              } else {
                updateTranslation({ enabled: true });
              }
            }}
          >
            <option value="Spanish">Spanish</option>
            <option value="None">None</option>
          </select>
        </div>
      </div>

      {/* ─── Model progress ─────────────────────────────────── */}
      {modelProgress !== null && (
        <div className="bg-purple-700 text-white px-5 py-2 text-sm flex items-center gap-3">
          <span>Loading model…</span>
          <div className="flex-1 h-2 bg-purple-500 rounded overflow-hidden">
            <div className="h-full bg-white transition-all duration-300" style={{ width: `${Math.round(modelProgress * 100)}%` }} />
          </div>
          <span className="tabular-nums">{Math.round(modelProgress * 100)}%</span>
        </div>
      )}

      {/* Error banners */}
      {appErrors.map((msg, i) => (
        <div key={i} className="bg-red-600 text-white px-5 py-2 text-sm flex items-center justify-between">
          <span>{msg}</span>
          <button
            className="ml-4 text-white hover:text-red-200 font-bold"
            onClick={() => setAppErrors((prev) => prev.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}

      {/* ─── Split Transcript Panes ─────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left: Original English */}
        <div className="flex-1 flex flex-col border-r border-gray-200">
          <div className="px-5 py-2 border-b border-gray-100">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider font-mono">
              Original <span className="text-gray-800">EN</span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6 bg-gray-50/50">
            {segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-2xl text-gray-700 font-light italic">Ready when you are</p>
                <p className="text-sm text-gray-400 mt-2">Press Start Captioning to begin.</p>
              </div>
            ) : (
              segments.map((seg) => (
                <EditableSegment
                  key={seg.id}
                  segment={seg}
                  className="text-gray-900 leading-relaxed text-base"
                  onCommit={handleSegmentEdit}
                />
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>

        {/* Right: Spanish Translation */}
        <div className="flex-1 flex flex-col">
          <div className="px-5 py-2 border-b border-purple-200 bg-purple-50">
            <h2 className="text-xs font-semibold text-purple-500 uppercase tracking-wider font-mono">
              Spanish <span className="text-purple-800">SP</span>
            </h2>
          </div>
          <div className="flex-1 overflow-y-auto px-8 py-6 bg-purple-100/40">
            {!translation.enabled ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-sm text-purple-500 italic">Translation model not installed.</p>
                <p className="text-sm text-purple-400 mt-1">Open Settings → Languages to download it.</p>
              </div>
            ) : segments.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <p className="text-sm text-purple-400 italic">Translations will appear here.</p>
              </div>
            ) : (
              segments.map((seg) => (
                <div key={seg.id} className="mb-2 px-3 py-1">
                  <p className="text-gray-700 leading-relaxed text-base">
                    {seg.translation || (
                      <span className="text-purple-300 italic">Translating…</span>
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
