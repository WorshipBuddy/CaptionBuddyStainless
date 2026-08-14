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

type ControlTheme = 'light' | 'dark' | 'high-contrast';

const CONTROL_THEMES: Record<ControlTheme, { bg: string; sidebar: string; border: string; text: string; textMuted: string; textFaint: string; input: string; header: string }> = {
  light: {
    bg: 'bg-gray-100', sidebar: 'bg-white', border: 'border-gray-200',
    text: 'text-gray-900', textMuted: 'text-gray-600', textFaint: 'text-gray-400',
    input: 'bg-white border-gray-300 text-gray-900', header: 'bg-white',
  },
  dark: {
    bg: 'bg-gray-900', sidebar: 'bg-gray-800', border: 'border-gray-700',
    text: 'text-gray-100', textMuted: 'text-gray-400', textFaint: 'text-gray-500',
    input: 'bg-gray-700 border-gray-600 text-gray-100', header: 'bg-gray-800',
  },
  'high-contrast': {
    bg: 'bg-black', sidebar: 'bg-black', border: 'border-yellow-400',
    text: 'text-yellow-300', textMuted: 'text-yellow-400', textFaint: 'text-yellow-500',
    input: 'bg-black border-yellow-400 text-yellow-300', header: 'bg-black',
  },
};

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

/**
 * A transcript line the operator can correct in place.
 *
 * Click (or focus and press Enter) to edit; Enter commits, Escape reverts.
 * Committing pushes the correction to the display window and every connected
 * phone. Editing is deliberately not blocked while recording — fixing a
 * misheard name mid-sermon is the whole point.
 */
function EditableSegment({
  segment,
  className,
  inputClassName,
  hintClassName,
  onCommit,
}: {
  segment: TranscriptSegment;
  className?: string;
  inputClassName: string;
  hintClassName: string;
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
    // An empty edit is almost always a slip, and blanking a line on the
    // projector mid-service is worse than leaving the original text.
    if (trimmed && trimmed !== segment.text) {
      onCommit(segment.id, trimmed);
    }
    setIsEditing(false);
  };

  const cancel = () => {
    setDraft(segment.text);
    setIsEditing(false);
  };

  // Focus and size the textarea to its content as soon as it appears.
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
          className={`w-full resize-none rounded border px-2 py-1 leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 ${inputClassName}`}
        />
        <p className={`text-xs mt-1 ${hintClassName}`}>
          Enter to save · Shift+Enter for a new line · Esc to cancel
        </p>
      </div>
    );
  }

  return (
    <div
      role="button"
      tabIndex={0}
      title="Click to edit — the correction appears on the display and on phones"
      onClick={beginEdit}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          beginEdit();
        }
      }}
      className="group relative cursor-text rounded px-2 py-1 -mx-2 hover:bg-blue-500/10 focus:outline-none focus:ring-2 focus:ring-blue-500"
    >
      <FormattedSegment text={segment.text} className={className} />
      {segment.editedAt !== undefined && (
        <span
          className={`absolute top-1 right-1 text-[10px] uppercase tracking-wide opacity-0 group-hover:opacity-100 ${hintClassName}`}
        >
          edited
        </span>
      )}
    </div>
  );
}

export function ControlApp() {
  const [splash, setSplash] = useState(true);
  const [splashFading, setSplashFading] = useState(false);
  const [status, setStatus] = useState<'idle' | 'recording' | 'paused'>('idle');
  const [audioLevel, setAudioLevel] = useState(0);
  const [wpm, setWpm] = useState(150);
  const [fontFamily, setFontFamily] = useState('Arial, sans-serif');
  const [fontSize, setFontSize] = useState(32);
  const [displayTheme, setDisplayTheme] = useState<'light' | 'dark' | 'high-contrast'>('light');
  const [controlTheme, setControlTheme] = useState<ControlTheme>('light');
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [networkStatus, setNetworkStatus] = useState<NetworkStatus | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [showExportPrompt, setShowExportPrompt] = useState(false);
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
  const transcriptEndRef = useRef<HTMLDivElement>(null);
  const wpmDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const t = CONTROL_THEMES[controlTheme];

  // Splash screen timer
  useEffect(() => {
    const fadeTimer = setTimeout(() => setSplashFading(true), 2700);
    const hideTimer = setTimeout(() => setSplash(false), 3000);
    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(hideTimer);
    };
  }, []);

  // Subscribe to errors and model load progress from main process
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

  // Hydrate UI from persisted settings on mount
  useEffect(() => {
    window.autoscribe.getSettings().then((settings) => {
      if (settings.display) {
        setFontFamily(settings.display.fontFamily);
        setFontSize(settings.display.fontSize);
        if (settings.display.highContrast) {
          setDisplayTheme('high-contrast');
        } else if (settings.display.backgroundColor === '#1F2937') {
          setDisplayTheme('dark');
        } else {
          setDisplayTheme('light');
        }
      }
      if (settings.pacing) {
        setWpm(settings.pacing.wpm);
      }
      if (settings.audio) {
        setSelectedDevice(settings.audio.deviceId);
        setInputType(settings.audio.inputType);
      }
      if (settings.translation) {
        setTranslation({ ...DEFAULT_SETTINGS.translation, ...settings.translation });
      }
    });
  }, []);

  // Fetch audio devices on mount
  useEffect(() => {
    window.autoscribe.getAudioDevices().then(setAudioDevices);
  }, []);

  useEffect(() => {
    const unsub = window.autoscribe.onAudioLevel((level) => {
      setAudioLevel(level);
    });
    return unsub;
  }, []);

  useEffect(() => {
    const unsub = window.autoscribe.onTranscriptSegment((segment) => {
      setSegments((prev) => [...prev, segment].slice(-500));
    });
    return unsub;
  }, []);

  // Auto-scroll to bottom when new segments arrive. Keyed on the newest id
  // rather than the array itself, so committing an edit to an older line
  // doesn't yank the operator back down to the bottom of the transcript.
  const newestSegmentId = segments.length > 0 ? segments[segments.length - 1].id : null;
  useEffect(() => {
    transcriptEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [newestSegmentId]);

  /**
   * Commit an operator correction. The local list updates immediately so the
   * control panel never appears to lag; main then fans the change out to the
   * display window and any connected phones.
   */
  const handleSegmentEdit = useCallback((id: string, text: string) => {
    setSegments((prev) =>
      prev.map((s) => (s.id === id ? { ...s, text, editedAt: Date.now() } : s))
    );
    window.autoscribe.updateSegment(id, text);
  }, []);

  // Translations arrive after their segment, so they are merged in by id.
  useEffect(() => {
    const unsub = window.autoscribe.onTranslationSegment(({ id, translation: text }) => {
      setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, translation: text } : s)));
    });
    return unsub;
  }, []);

  // Window/monitor state is pushed from main, since display windows can be
  // closed directly and projectors can be plugged in mid-service.
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
    // Optimistic, so the toggles feel instant even while the model loads.
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
      const status = await window.autoscribe.getNetworkStatus();
      setNetworkStatus(status);
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
    if (segments.length > 0) {
      setShowExportPrompt(true);
    }
  }, [segments.length]);

  const handleExport = useCallback(async () => {
    await window.autoscribe.exportTranscript();
    setShowExportPrompt(false);
    setSegments([]);
  }, []);

  const handleDismissExport = useCallback(() => {
    setShowExportPrompt(false);
    setSegments([]);
  }, []);

  if (splash) {
    return (
      <div
        className={`h-screen bg-white flex items-center justify-center transition-opacity duration-300 ${
          splashFading ? 'opacity-0' : 'opacity-100'
        }`}
      >
        <img src={logoSrc} alt="AutoScribe" className="max-w-md w-3/4" />
      </div>
    );
  }

  return (
    <div className={`h-screen ${t.bg} flex flex-col`}>
      {/* Header */}
      <header className={`${t.header} border-b ${t.border} px-6 py-3 flex items-center justify-between`}>
        <div>
          <h1 className={`text-xl font-bold ${t.text}`}>AutoScribe</h1>
        </div>
        <div className="flex items-center gap-4">
          {/* Control panel theme toggle - cycles light → dark → high-contrast */}
          <button
            aria-label={`Control panel theme: ${controlTheme} (click to cycle)`}
            className={`w-8 h-8 flex items-center justify-center rounded-lg border ${t.border} hover:opacity-80 transition-colors`}
            onClick={() => {
              const cycle: ControlTheme[] = ['light', 'dark', 'high-contrast'];
              const next = cycle[(cycle.indexOf(controlTheme) + 1) % cycle.length];
              setControlTheme(next);
            }}
            title={`Theme: ${controlTheme} (click to cycle)`}
          >
            {controlTheme === 'light' && (
              <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
              </svg>
            )}
            {controlTheme === 'dark' && (
              <svg className="w-4 h-4 text-blue-300" fill="currentColor" viewBox="0 0 20 20">
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            )}
            {controlTheme === 'high-contrast' && (
              <svg className="w-4 h-4 text-yellow-400" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM10 4a6 6 0 100 12V4z" clipRule="evenodd" />
              </svg>
            )}
          </button>
          <button
            aria-label="Open display window"
            className="text-xs px-3 py-1.5 bg-indigo-600 text-white rounded hover:bg-indigo-700"
            onClick={() => window.autoscribe.openDisplay()}
          >
            Open Display
          </button>
          <div className="flex items-center gap-2">
            <div className={`w-2.5 h-2.5 rounded-full ${
              status === 'recording' ? 'bg-red-500 animate-pulse' :
              status === 'paused' ? 'bg-yellow-500' : 'bg-gray-400'
            }`} />
            <span className={`text-sm ${t.textMuted} capitalize`}>{status}</span>
          </div>
        </div>
      </header>

      {/* Model download progress bar */}
      {modelProgress !== null && (
        <div className="bg-indigo-700 text-white px-4 py-2 text-sm flex items-center gap-3">
          <span className="flex-shrink-0">Loading model…</span>
          <div className="flex-1 h-2 bg-indigo-500 rounded overflow-hidden">
            <div
              className="h-full bg-white transition-all duration-300"
              style={{ width: `${Math.round(modelProgress * 100)}%` }}
            />
          </div>
          <span className="flex-shrink-0 tabular-nums">{Math.round(modelProgress * 100)}%</span>
        </div>
      )}

      {/* Error banners */}
      {appErrors.map((msg, i) => (
        <div
          key={i}
          className="bg-red-600 text-white px-4 py-2 text-sm flex items-center justify-between"
        >
          <span>{msg}</span>
          <button
            aria-label="Dismiss error"
            className="ml-4 text-white hover:text-red-200 font-bold leading-none"
            onClick={() => setAppErrors((prev) => prev.filter((_, idx) => idx !== i))}
          >
            ✕
          </button>
        </div>
      ))}

      {/* Export prompt overlay */}
      {showExportPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className={`${t.sidebar} rounded-lg shadow-xl p-6 max-w-sm mx-4 border ${t.border}`}>
            <h3 className={`text-lg font-semibold ${t.text} mb-2`}>Session Ended</h3>
            <p className={`text-sm ${t.textMuted} mb-4`}>
              Would you like to export the transcript from this session?
            </p>
            <div className="flex gap-3 justify-end">
              <button
                className={`px-4 py-2 text-sm ${t.textMuted} rounded border ${t.border} hover:opacity-80`}
                onClick={handleDismissExport}
              >
                Discard
              </button>
              <button
                className="px-4 py-2 text-sm text-white bg-blue-600 hover:bg-blue-700 rounded font-medium"
                onClick={handleExport}
              >
                Export
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Two-column layout */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left column - Controls */}
        <div className={`w-72 flex-shrink-0 ${t.sidebar} border-r ${t.border} overflow-y-auto p-4 space-y-4`}>
          {/* Session */}
          <section>
            <h2 className={`text-xs font-semibold ${t.textFaint} uppercase tracking-wide mb-2`}>Session</h2>
            {status === 'idle' ? (
              <button
                aria-label="Start recording session"
                className="w-full px-4 py-2 rounded text-white text-sm font-medium bg-green-600 hover:bg-green-700"
                onClick={startSession}
              >
                Start Session
              </button>
            ) : (
              <div className="space-y-2">
                {status === 'recording' ? (
                  <button
                    aria-label="Pause recording"
                    className="w-full px-4 py-2 rounded text-white text-sm font-medium bg-yellow-500 hover:bg-yellow-600"
                    onClick={pauseSession}
                  >
                    Pause
                  </button>
                ) : (
                  <button
                    aria-label="Resume recording"
                    className="w-full px-4 py-2 rounded text-white text-sm font-medium bg-green-600 hover:bg-green-700"
                    onClick={resumeSession}
                  >
                    Resume
                  </button>
                )}
                <button
                  aria-label="Stop recording session"
                  className="w-full px-4 py-2 rounded text-white text-sm font-medium bg-red-600 hover:bg-red-700"
                  onClick={stopSession}
                >
                  Stop Session
                </button>
              </div>
            )}
          </section>

          <hr className={t.border} />

          {/* Audio Input */}
          <section>
            <h2 className={`text-xs font-semibold ${t.textFaint} uppercase tracking-wide mb-2`}>Audio Input</h2>
            {status !== 'idle' && (
              <p className="text-xs text-amber-500 mb-2">Stop session to change device or input type.</p>
            )}
            <label className={`block text-xs ${t.textMuted} mb-1`}>Device</label>
            <select
              className={`w-full border rounded px-2 py-1.5 text-sm ${t.input} disabled:opacity-50 disabled:cursor-not-allowed`}
              value={selectedDevice}
              disabled={status !== 'idle'}
              onChange={(e) => {
                const deviceId = e.target.value;
                setSelectedDevice(deviceId);
                // Auto-apply the inferred input type for the selected device
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
            {selectedDevice !== 'default' && (
              <p className={`text-xs ${t.textFaint} mt-1`}>
                Detected as: {inputType === 'line-in' ? 'Soundboard / Line-In' : 'Microphone'}
              </p>
            )}
            <label className={`block text-xs ${t.textMuted} mt-2 mb-1`}>Language</label>
            <select
              className={`w-full border rounded px-2 py-1.5 text-sm ${t.input}`}
              value={sttLanguage}
              onChange={(e) => {
                const lang = e.target.value;
                setSTTLanguage(lang);
                if (lang === 'es-translate') {
                  window.autoscribe.setSTTTask({ language: 'es', task: 'translate' });
                } else {
                  window.autoscribe.setSTTTask({ language: lang, task: 'transcribe' });
                }
              }}
            >
              <option value="en">English</option>
              <option value="es">Spanish (transcribe)</option>
              <option value="es-translate">Spanish to English (translate)</option>
            </select>
            <div className="mt-2">
              <label className={`block text-xs ${t.textMuted} mb-1`}>Level</label>
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
                    className={`text-xs px-2 py-0.5 rounded font-medium ${
                      audioTesting
                        ? 'bg-red-500 hover:bg-red-600 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'
                    }`}
                    onClick={async () => {
                      if (audioTesting) {
                        await window.autoscribe.stopAudioTest();
                        setAudioTesting(false);
                        setAudioLevel(0);
                      } else {
                        await window.autoscribe.startAudioTest();
                        setAudioTesting(true);
                      }
                    }}
                  >
                    {audioTesting ? 'Stop' : 'Test'}
                  </button>
                )}
              </div>
            </div>
          </section>

          <hr className={t.border} />

          {/* Pacing */}
          <section>
            <h2 className={`text-xs font-semibold ${t.textFaint} uppercase tracking-wide mb-2`}>Pacing</h2>
            <label className={`block text-xs ${t.textMuted} mb-1`}>
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
            <div className={`flex justify-between text-xs ${t.textFaint}`}>
              <span>Slower</span>
              <span>Faster</span>
            </div>
          </section>

          <hr className={t.border} />

          {/* Display */}
          <section>
            <h2 className={`text-xs font-semibold ${t.textFaint} uppercase tracking-wide mb-2`}>Display</h2>
            <label className={`block text-xs ${t.textMuted} mb-1`}>Font</label>
            <select
              className={`w-full border rounded px-2 py-1.5 text-sm ${t.input}`}
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
            <label className={`block text-xs ${t.textMuted} mt-2 mb-1`}>Size</label>
            <div className="flex items-center gap-2">
              <button
                aria-label="Decrease font size"
                className={`w-7 h-7 flex items-center justify-center rounded border ${t.border} ${t.textMuted} hover:opacity-80 text-base font-bold flex-shrink-0 disabled:opacity-30`}
                disabled={fontSize <= 24}
                onClick={() => {
                  const size = Math.max(24, fontSize - 4);
                  setFontSize(size);
                  sendDisplaySettings({ fontSize: size });
                }}
              >−</button>
              <input
                type="number"
                min={24}
                max={200}
                value={fontSize}
                onChange={(e) => {
                  const raw = Number(e.target.value);
                  if (!isNaN(raw)) {
                    const size = Math.min(200, Math.max(24, raw));
                    setFontSize(size);
                    sendDisplaySettings({ fontSize: size });
                  }
                }}
                className={`w-full text-center border rounded px-2 py-1 text-sm ${t.input}`}
              />
              <span className={`text-xs ${t.textFaint} flex-shrink-0`}>px</span>
              <button
                aria-label="Increase font size"
                className={`w-7 h-7 flex items-center justify-center rounded border ${t.border} ${t.textMuted} hover:opacity-80 text-base font-bold flex-shrink-0 disabled:opacity-30`}
                disabled={fontSize >= 200}
                onClick={() => {
                  const size = Math.min(200, fontSize + 4);
                  setFontSize(size);
                  sendDisplaySettings({ fontSize: size });
                }}
              >+</button>
            </div>
            <div className="flex gap-1.5 mt-2">
              {([
                ['light', 'Light', '#000000', '#FFFFFF'],
                ['dark', 'Dark', '#E5E7EB', '#1F2937'],
                ['high-contrast', 'Contrast', '#FFFF00', '#000000'],
              ] as const).map(([key, label, textColor, bgColor]) => (
                <button
                  key={key}
                  className={`flex-1 px-2 py-1 text-xs border rounded ${
                    displayTheme === key
                      ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                      : `${t.border} hover:opacity-80 ${t.textMuted}`
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

          <hr className={t.border} />

          {/* Projected screens */}
          <section>
            <h2 className={`text-xs font-semibold ${t.textFaint} uppercase tracking-wide mb-2`}>Screens</h2>

            {(['primary', 'secondary'] as const).map((role) => {
              const isOpen = role === 'primary' ? windowState.primaryOpen : windowState.secondaryOpen;
              const currentScreen =
                role === 'primary' ? windowState.primaryScreenId : windowState.secondaryScreenId;

              return (
                <div key={role} className="mb-3 last:mb-0">
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs ${t.textMuted}`}>
                      {role === 'primary' ? 'Display 1' : 'Display 2'}
                    </span>
                    <button
                      className={`text-xs font-medium ${
                        isOpen ? 'text-orange-400 hover:text-orange-300' : 'text-blue-400 hover:text-blue-300'
                      }`}
                      onClick={() => {
                        if (role === 'primary') {
                          if (isOpen) {
                            window.autoscribe.closeDisplay();
                          } else {
                            window.autoscribe.openDisplay();
                          }
                        } else if (isOpen) {
                          window.autoscribe.closeSecondaryDisplay();
                        } else {
                          window.autoscribe.openSecondaryDisplay();
                        }
                      }}
                    >
                      {isOpen ? 'Close' : 'Open'}
                    </button>
                  </div>
                  <select
                    className={`w-full border rounded px-2 py-1.5 text-sm ${t.input} disabled:opacity-40`}
                    disabled={!isOpen || screens.length === 0}
                    value={currentScreen ?? ''}
                    onChange={(e) => {
                      const screenId = Number(e.target.value);
                      if (!isNaN(screenId)) {
                        window.autoscribe.moveDisplayToScreen(role, screenId);
                      }
                    }}
                  >
                    {!isOpen && <option value="">Window not open</option>}
                    {screens.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label} — {s.width}×{s.height}
                        {s.isPrimary ? ' (main)' : ''}
                      </option>
                    ))}
                  </select>
                  {isOpen && translation.enabled && (
                    <p className={`text-xs ${t.textFaint} mt-1`}>
                      Showing{' '}
                      {LANGUAGE_LABELS[
                        role === 'primary' ? translation.displayLanguage : translation.secondaryLanguage
                      ]}
                    </p>
                  )}
                </div>
              );
            })}

            {screens.length < 2 && (
              <p className={`text-xs ${t.textFaint} mt-1`}>
                Only one screen detected. Connect a projector to send a display to it.
              </p>
            )}
          </section>

          <hr className={t.border} />

          {/* Spanish translation */}
          <section>
            <h2 className={`text-xs font-semibold ${t.textFaint} uppercase tracking-wide mb-2`}>
              Spanish Translation
            </h2>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={translation.enabled}
                onChange={(e) => updateTranslation({ enabled: e.target.checked })}
              />
              <span className={`text-sm ${t.text}`}>Translate to Spanish</span>
            </label>
            <p className={`text-xs ${t.textFaint} mt-1`}>
              {translation.enabled
                ? 'Runs on-device alongside transcription.'
                : 'First use downloads a ~75MB model.'}
            </p>

            {translation.enabled && (
              <div className="mt-3 space-y-3">
                {([
                  ['displayLanguage', 'Display 1 shows'],
                  ['secondaryLanguage', 'Display 2 shows'],
                  ['viewerDefaultLanguage', 'Phones default to'],
                ] as const).map(([key, label]) => (
                  <div key={key}>
                    <label className={`block text-xs ${t.textMuted} mb-1`}>{label}</label>
                    <div className="flex gap-1.5">
                      {(['english', 'spanish', 'both'] as const).map((mode) => (
                        <button
                          key={mode}
                          className={`flex-1 px-2 py-1 text-xs border rounded ${
                            translation[key] === mode
                              ? 'border-blue-500 bg-blue-500/20 text-blue-400'
                              : `${t.border} hover:opacity-80 ${t.textMuted}`
                          }`}
                          onClick={() => updateTranslation({ [key]: mode })}
                        >
                          {LANGUAGE_LABELS[mode]}
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
                <p className={`text-xs ${t.textFaint}`}>
                  Each phone can override its language on the viewer page.
                </p>
              </div>
            )}
          </section>

          <hr className={t.border} />

          {/* Network */}
          <section>
            <h2 className={`text-xs font-semibold ${t.textFaint} uppercase tracking-wide mb-2`}>Network Viewers</h2>
            <button
              className={`w-full px-4 py-2 rounded text-white text-sm font-medium ${
                networkStatus?.running
                  ? 'bg-orange-600 hover:bg-orange-700'
                  : 'bg-blue-600 hover:bg-blue-700'
              }`}
              onClick={toggleNetwork}
            >
              {networkStatus?.running ? 'Stop Server' : 'Start Server'}
            </button>
            {networkStatus?.running && (
              <div className="mt-2 space-y-2">
                <div className={`text-xs ${t.textMuted}`}>
                  <span className="font-medium">URL:</span>{' '}
                  <a
                    className="text-blue-400 hover:underline break-all"
                    href={networkStatus.url}
                    onClick={(e) => {
                      e.preventDefault();
                      navigator.clipboard.writeText(networkStatus.url);
                    }}
                    title="Click to copy"
                  >
                    {networkStatus.url}
                  </a>
                </div>
                <div className={`text-xs ${t.textMuted}`}>
                  <span className="font-medium">Viewers:</span> {networkStatus.connectedClients}
                </div>
                {qrCode && (
                  <div className="flex justify-center">
                    <img src={qrCode} alt="QR Code" className="w-32 h-32" />
                  </div>
                )}
              </div>
            )}
          </section>
        </div>

        {/* Right column - Live Transcript */}
        <div className={`flex-1 flex flex-col ${t.sidebar}`}>
          <div className={`px-6 py-2 border-b ${t.border} flex items-center justify-between`}>
            <h2 className={`text-xs font-semibold ${t.textFaint} uppercase tracking-wide`}>Live Transcript</h2>
            <button
              className="text-xs text-blue-400 hover:text-blue-300 font-medium disabled:opacity-50"
              disabled={segments.length === 0}
              onClick={() => window.autoscribe.exportTranscript()}
            >
              Export
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            {segments.length === 0 ? (
              <p className={`${t.textFaint} italic`}>
                {status === 'idle'
                  ? 'Press "Start Session" to begin transcribing...'
                  : status === 'paused'
                    ? 'Session paused...'
                    : 'Listening for audio...'}
              </p>
            ) : (
              segments.map((seg) => (
                <EditableSegment
                  key={seg.id}
                  segment={seg}
                  className={`${t.text} leading-relaxed`}
                  inputClassName={t.input}
                  hintClassName={t.textFaint}
                  onCommit={handleSegmentEdit}
                />
              ))
            )}
            <div ref={transcriptEndRef} />
          </div>
        </div>
      </div>
    </div>
  );
}
