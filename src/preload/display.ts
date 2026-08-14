import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, PacedSegment, SegmentUpdate, SegmentTranslation } from '../shared/types/ipc';
import { DisplaySettings, PacingSettings, LanguageMode } from '../shared/types/settings';

/**
 * Which window this is. Both display windows load the same bundle, so the
 * role travels in the URL hash and decides which language setting applies.
 */
const role: 'primary' | 'secondary' =
  window.location.hash.includes('role=secondary') ? 'secondary' : 'primary';

const displayAPI = {
  /** 'primary' or 'secondary' — which projected window this renderer is. */
  role,
  // Receive paced transcript segments
  onTranscriptSegment: (callback: (paced: PacedSegment) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, paced: PacedSegment) => callback(paced);
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPT_SEGMENT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSCRIPT_SEGMENT, listener);
  },

  // Receive operator corrections to segments already on screen
  onTranscriptUpdate: (callback: (update: SegmentUpdate) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, update: SegmentUpdate) => callback(update);
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPT_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSCRIPT_UPDATE, listener);
  },

  // Receive display settings updates
  onDisplaySettingsUpdate: (callback: (settings: DisplaySettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: DisplaySettings) => callback(settings);
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_DISPLAY_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_DISPLAY_UPDATE, listener);
  },

  // Receive pacing settings updates
  onPacingSettingsUpdate: (callback: (settings: PacingSettings) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, settings: PacingSettings) => callback(settings);
    ipcRenderer.on(IPC_CHANNELS.SETTINGS_PACING_UPDATE, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.SETTINGS_PACING_UPDATE, listener);
  },

  // Receive translations as the model finishes each segment
  onTranslationSegment: (callback: (update: SegmentTranslation) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, update: SegmentTranslation) => callback(update);
    ipcRenderer.on(IPC_CHANNELS.TRANSLATION_SEGMENT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSLATION_SEGMENT, listener);
  },

  // Receive the language mode this particular window should render
  onLanguageModeSet: (callback: (mode: LanguageMode) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, mode: LanguageMode) => callback(mode);
    ipcRenderer.on(IPC_CHANNELS.TRANSLATION_LANGUAGE_SET, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSLATION_LANGUAGE_SET, listener);
  },

  // Clear transcript display
  onTranscriptClear: (callback: () => void) => {
    const listener = () => callback();
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPT_CLEAR, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSCRIPT_CLEAR, listener);
  },

  // Request initial settings
  getSettings: () => ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
};

contextBridge.exposeInMainWorld('autoscribe', displayAPI);

export type DisplayAPI = typeof displayAPI;
