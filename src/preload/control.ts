import { contextBridge, ipcRenderer } from 'electron';
import { IPC_CHANNELS, SessionStatus, AudioDevice, NetworkStatus, AppStatusEvent } from '../shared/types/ipc';
import { AppSettings } from '../shared/types/settings';
import { TranscriptSegment } from '../shared/types/transcript';

const controlAPI = {
  // Settings
  getSettings: (): Promise<AppSettings> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_GET),
  updateSettings: (settings: Partial<AppSettings>): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SETTINGS_UPDATE, settings),

  // Session
  startSession: (name?: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_START, name),
  stopSession: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_STOP),
  pauseSession: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_PAUSE),
  resumeSession: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_RESUME),
  getSessionStatus: (): Promise<SessionStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.SESSION_STATUS),
  exportTranscript: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_EXPORT),

  // Transcript editing — pushes the correction to the display and viewers
  updateSegment: (id: string, text: string): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.TRANSCRIPT_UPDATE, { id, text }),

  // Audio
  getAudioDevices: (): Promise<AudioDevice[]> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIO_DEVICES),
  startAudioTest: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIO_TEST_START),
  stopAudioTest: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.AUDIO_TEST_STOP),

  // STT
  setSTTTask: (task: { language: string; task: 'transcribe' | 'translate' }): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.STT_SET_TASK, task),
  getSTTTask: (): Promise<{ language: string; task: 'transcribe' | 'translate' }> =>
    ipcRenderer.invoke(IPC_CHANNELS.STT_GET_TASK),

  // Display window
  openDisplay: (): void =>
    ipcRenderer.send(IPC_CHANNELS.DISPLAY_OPEN),
  closeDisplay: (): void =>
    ipcRenderer.send(IPC_CHANNELS.DISPLAY_CLOSE),

  // Network
  startNetwork: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.NETWORK_START),
  stopNetwork: (): Promise<void> =>
    ipcRenderer.invoke(IPC_CHANNELS.NETWORK_STOP),
  getNetworkStatus: (): Promise<NetworkStatus> =>
    ipcRenderer.invoke(IPC_CHANNELS.NETWORK_STATUS),
  getNetworkQR: (): Promise<string> =>
    ipcRenderer.invoke(IPC_CHANNELS.NETWORK_QR),

  // Event listeners
  onTranscriptSegment: (callback: (segment: TranscriptSegment) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, segment: TranscriptSegment) => callback(segment);
    ipcRenderer.on(IPC_CHANNELS.TRANSCRIPT_SEGMENT, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.TRANSCRIPT_SEGMENT, listener);
  },
  onAudioLevel: (callback: (level: number) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, level: number) => callback(level);
    ipcRenderer.on(IPC_CHANNELS.AUDIO_LEVEL, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.AUDIO_LEVEL, listener);
  },
  onAppStatus: (callback: (event: AppStatusEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, statusEvent: AppStatusEvent) => callback(statusEvent);
    ipcRenderer.on(IPC_CHANNELS.APP_STATUS, listener);
    return () => ipcRenderer.removeListener(IPC_CHANNELS.APP_STATUS, listener);
  },
};

contextBridge.exposeInMainWorld('autoscribe', controlAPI);

export type ControlAPI = typeof controlAPI;
