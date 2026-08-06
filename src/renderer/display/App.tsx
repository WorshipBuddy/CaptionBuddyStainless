import { useState, useEffect, useRef } from 'react';
import { DisplayAPI } from '../../preload/display';
import { DisplaySettings, DEFAULT_SETTINGS } from '../../shared/types/settings';
import { parseBibleReferences } from '../../shared/bibleReferences';

declare global {
  interface Window {
    autoscribe: DisplayAPI;
  }
}

interface DisplayLine {
  id: string;
  text: string;
}

export function DisplayApp() {
  const [displaySettings, setDisplaySettings] = useState<DisplaySettings>(DEFAULT_SETTINGS.display);
  const [lines, setLines] = useState<DisplayLine[]>([]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    window.autoscribe.getSettings().then((settings) => {
      setDisplaySettings(settings.display);
    });

    const unsubSettings = window.autoscribe.onDisplaySettingsUpdate((settings) => {
      setDisplaySettings(settings);
    });

    const unsubTranscript = window.autoscribe.onTranscriptSegment((paced) => {
      const { id, text } = paced.segment;

      setLines((prev) => {
        // Check if this segment ID already exists (streaming mode updates)
        const existingIndex = prev.findIndex((line) => line.id === id);
        if (existingIndex !== -1) {
          // Update existing line in place
          const updated = [...prev];
          updated[existingIndex] = { id, text };
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

    const unsubClear = window.autoscribe.onTranscriptClear(() => {
      setLines([]);
    });

    return () => {
      unsubSettings();
      unsubTranscript();
      unsubClear();
    };
  }, []);

  // Keep the most recent line in view. Re-runs on new lines AND on settings
  // changes (e.g. font size) so a mid-session resize doesn't lose scroll position.
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [lines, displaySettings]);

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

  return (
    <div
      className="h-screen flex flex-col cursor-default select-none"
      style={{ backgroundColor: displaySettings.backgroundColor }}
      onDoubleClick={handleDoubleClick}
    >
      {/* Minimal top bar - only visible on hover */}
      <div className="opacity-0 hover:opacity-100 transition-opacity duration-300 absolute top-0 left-0 right-0 z-10 bg-black/20 px-4 py-1 flex justify-between items-center">
        <span className="text-white/60 text-xs">AutoScribe Display</span>
        <span className="text-white/60 text-xs">Double-click for fullscreen</span>
      </div>

      {/* Transcript display */}
      <div
        className="flex-1 overflow-y-auto p-8"
        style={containerStyle}
      >
        {/* Spacer pushes content to bottom when there's little text */}
        <div className="flex-grow" style={{ minHeight: 'calc(100vh - 8rem)' }} />
        {lines.length === 0 ? (
          <p className="opacity-20 text-center">Waiting for transcription...</p>
        ) : (
          lines.map((line, i) => {
            // Most recent lines are fully opaque, older ones fade
            const recency = (i + 1) / lines.length;
            const opacity = Math.max(0.3, recency);
            const parts = parseBibleReferences(line.text);
            return (
              <div
                key={line.id}
                className="mb-3 transition-opacity duration-500"
                style={{ opacity }}
              >
                {parts.map((part, pi) =>
                  part.isReference ? (
                    <p key={pi} className="font-bold my-2">{part.text}</p>
                  ) : (
                    <span key={pi}>{part.text}</span>
                  )
                )}
              </div>
            );
          })
        )}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
