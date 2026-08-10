import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, PacedSegment, SegmentUpdate } from '../shared/types/ipc';
import { DisplaySettings, PacingSettings } from '../shared/types/settings';

const displayAPI = {
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
