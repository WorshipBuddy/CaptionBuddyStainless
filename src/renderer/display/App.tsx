import { useState, useEffect, useRef } from 'react';
import { DisplayAPI } from '../../preload/display';
import { DisplaySettings, DEFAULT_SETTINGS, LanguageMode } from '../../shared/types/settings';
import { parseBibleReferences } from '../../shared/bibleReferences';

declare global {
  interface Window {
    autoscribe: DisplayAPI;
  }
}

interface DisplayLine {
  id: string;
  text: string;
  translation?: string;
}

/** Renders one line with Bible references pulled out and bolded. */
function LineBody({ text }: { text: string }) {
  const parts = parseBibleReferences(text);
  return (
    <>
      {parts.map((part, pi) =>
        part.isReference ? (
          /* Satoshi 500 rather than 700 — bold weights render heavier on
             Windows ClearType than on macOS. */
          <p key={pi} className="font-medium my-2">{part.text}</p>
        ) : (
          <span key={pi}>{part.text}</span>
        )
      )}
    </>
  );
}

export function DisplayApp() {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_SETTINGS.display);
  const [lines, setLines] = useState<DisplayLine[]>([]);
  const [languageMode, setLanguageMode] = useState<LanguageMode>('english');
  const bottomRef = useRef<HTMLDivElement>(null);
  const spanishBottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.autoscribe.getSettings().then((settings) => {
      setDisplaySettings(settings.display);
      // Each window asks for the language belonging to its own role, which is
      // what allows English on one projector and Spanish on another.
      const translation = settings.translation ?? DEFAULT_SETTINGS.translation;
      setLanguageMode(
        window.autoscribe.role === 'secondary'
          ? translation.secondaryLanguage
          : translation.displayLanguage
      );
    });

    const unsubSettings = window.autoscribe.onDisplaySettingsUpdate((settings) => {
      setDisplaySettings(settings);
    });

    const unsubLanguage = window.autoscribe.onLanguageModeSet((mode) => {
      setLanguageMode(mode);
    });

    const unsubTranscript = window.autoscribe.onTranscriptSegment((paced) => {
      const { id, text } = paced.segment;

      setLines((prev) => {
        // Check if this segment ID already exists (streaming mode updates)
        const existingIndex = prev.findIndex((line) => line.id === id);
        if (existingIndex !== -1) {
          // Update existing line in place, keeping any translation already in
          const updated = [...prev];
          updated[existingIndex] = { ...updated[existingIndex], id, text };
          return updated;
        }

        // New segment - append and cap at 20 lines
        const updated = [...prev, { id, text }];
        if (updated.length > 20) {
          return updated.slice(-20);
        }
        return updated;
      });
    });

    const unsubUpdate = window.autoscribe.onTranscriptUpdate(({ id, text }) => {
      setLines((prev) => {
        const index = prev.findIndex((line) => line.id === id);
        if (index === -1) return prev;
        const updated = [...prev];
        // The correction invalidates the old translation; it will be replaced
        // when the retranslation lands.
        updated[index] = { id, text, translation: undefined };
        return updated;
      });
    });

    const unsubTranslation = window.autoscribe.onTranslationSegment(({ id, translation }) => {
      setLines((prev) => {
        const index = prev.findIndex((line) => line.id === id);
        if (index === -1) return prev;
        const updated = [...prev];
        updated[index] = { ...updated[index], translation };
        return updated;
      });
    });

    const unsubClear = window.autoscribe.onTranscriptClear(() => {
      setLines([]);
    });

    return () => {
      unsubSettings();
      unsubLanguage();
      unsubTranscript();
      unsubUpdate();
      unsubTranslation();
      unsubClear();
    };
  }, []);

  // Keep the most recent line in view. Re-runs on new lines AND on settings
  // changes (e.g. font size) so a mid-session resize doesn't lose scroll position.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    spanishBottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, displaySettings, languageMode]);

  // Toggle fullscreen on double-click
  const handleDoubleClick = () => {
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else {
      document.documentElement.requestFullscreen();
    }
  };

  const containerStyle: React.CSSProperties = {
    fontFamily: displaySettings.fontFamily,
    fontSize: `${displaySettings.fontSize}px`,
    color: displaySettings.textColor,
    backgroundColor: displaySettings.backgroundColor,
    lineHeight: displaySettings.lineHeight,
    textAlign: displaySettings.textAlign as React.CSSProperties['textAlign'],
  };

  // In Spanish-only mode a line is held back until its translation arrives,
  // so the congregation never sees English on a screen labelled Spanish.
  const spanishLines = lines.filter((line) => !!line.translation);

  const renderColumn = (
    columnLines: DisplayLine[],
    pick: (line: DisplayLine) => string,
    endRef: React.RefObject<HTMLDivElement>,
    emptyLabel: string,
    heading?: string
  ) => (
    <div className="flex-1 overflow-y-auto p-xl min-w-0" style={containerStyle}>
      {heading && (
        /* Column label is the only chrome the congregation ever sees, so it is
           held to a mono eyebrow at the system's smallest size. */
        <div
          className="sticky top-0 font-mono uppercase tracking-[0.12em] opacity-40 pb-2"
          style={{ fontSize: '11px', fontWeight: 500, lineHeight: 1.4 }}
        >
          {heading}
        </div>
      )}
      <div className="flex-grow" style={{ minHeight: 'calc(100vh - 12rem)' }} />
      {columnLines.length === 0 ? (
        <p className="opacity-20 text-center">{emptyLabel}</p>
      ) : (
        columnLines.map((line, i) => {
          const recency = (i + 1) / columnLines.length;
          const opacity = Math.max(0.3, recency);
          return (
            <div key={line.id} className="mb-3 transition-opacity duration-500" style={{ opacity }}>
              <LineBody text={pick(line)} />
            </div>
          );
        })
      )}
      <div ref={endRef} />
    </div>
  );

  return (
    <div
      className="h-screen flex flex-col cursor-default select-none"
      style={{ backgroundColor: displaySettings.backgroundColor }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Caption output carries no chrome — this bar only exists on hover, for
          the operator, and uses the standard broadcast lower-third scrim. */}
      <div
        className="opacity-0 hover:opacity-100 transition-opacity duration-300 absolute top-0 left-0 right-0 z-10 px-sm py-1 flex justify-between items-center font-mono uppercase tracking-[0.12em]"
        style={{ background: 'rgba(0,0,0,0.6)', fontSize: '11px', fontWeight: 500 }}
      >
        <span className="text-white/60">
          CaptionBuddy Display{window.autoscribe.role === 'secondary' ? ' 2' : ''}
        </span>
        <span className="text-white/60">Double-click for fullscreen</span>
      </div>

      {languageMode === 'both' ? (
        <div
          className="flex-1 flex flex-row min-h-0 [&>*+*]:border-l"
          /* Neutral grey reads as a hairline against both the black caption
             theme and the light theme, without knowing the text colour. */
          style={{ borderColor: 'rgba(127,127,127,0.25)' }}
        >
          {renderColumn(lines, (l) => l.text, bottomRef, 'Waiting for transcription...', 'English')}
          {renderColumn(
            spanishLines,
            (l) => l.translation ?? '',
            spanishBottomRef,
            'Esperando traducción...',
            'Español'
          )}
        </div>
      ) : languageMode === 'spanish' ? (
        renderColumn(
          spanishLines,
          (l) => l.translation ?? '',
          spanishBottomRef,
          'Esperando traducción...'
        )
      ) : (
        renderColumn(lines, (l) => l.text, bottomRef, 'Waiting for transcription...')
      )}
    </div>
  );
}
