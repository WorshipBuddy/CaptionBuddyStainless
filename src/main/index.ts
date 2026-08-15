import { app, BrowserWindow, screen } from 'electron';
import squirrelStartup from 'electron-squirrel-startup';
import { registerIpcHandlers } from './ipc/handlers';
import { ScreenInfo, DisplayWindowState, IPC_CHANNELS } from '../shared/types/ipc';

if (squirrelStartup) {
  app.quit();
}

// Prevent unhandled errors from crashing the app
process.on('uncaughtException', (err) => {
  console.error('[Main] Uncaught exception:', err);
});

process.on('unhandledRejection', (reason) => {
  console.error('[Main] Unhandled rejection:', reason);
});

declare const CONTROL_WINDOW_WEBPACK_ENTRY: string;
declare const CONTROL_WINDOW_PRELOAD_WEBPACK_ENTRY: string;
declare const DISPLAY_WINDOW_WEBPACK_ENTRY: string;
declare const DISPLAY_WINDOW_PRELOAD_WEBPACK_ENTRY: string;

export type DisplayRole = 'primary' | 'secondary';

let controlWindow: BrowserWindow | null = null;
let displayWindow: BrowserWindow | null = null;
/** Second projected window, so a translation can live on its own monitor. */
let secondaryDisplayWindow: BrowserWindow | null = null;

function createControlWindow(): void {
  controlWindow = new BrowserWindow({
    width: 900,
    height: 700,
    title: 'CaptionBuddy — Control Panel',
    webPreferences: {
      preload: CONTROL_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  controlWindow.loadURL(CONTROL_WINDOW_WEBPACK_ENTRY);

  // Block DevTools in production builds
  if (process.env.NODE_ENV !== 'development') {
    controlWindow.webContents.on('devtools-opened', () => {
      controlWindow?.webContents.closeDevTools();
    });
  }

  controlWindow.on('closed', () => {
    controlWindow = null;
    // Close projected windows when the control panel closes
    for (const win of [displayWindow, secondaryDisplayWindow]) {
      if (win && !win.isDestroyed()) win.close();
    }
  });
}

/**
 * Open a projected display window, optionally on a specific monitor.
 *
 * The secondary window exists so a second language can be projected on its own
 * screen. Both windows load the same renderer; a query parameter tells each one
 * which role it is playing so it can ask for the right language.
 */
export function createDisplayWindow(role: DisplayRole = 'primary', screenId?: number): void {
  const existing = role === 'primary' ? displayWindow : secondaryDisplayWindow;
  if (existing && !existing.isDestroyed()) {
    if (screenId !== undefined) moveWindowToScreen(role, screenId);
    existing.focus();
    return;
  }

  const target = screenId !== undefined
    ? screen.getAllDisplays().find((d) => d.id === screenId)
    : undefined;

  const win = new BrowserWindow({
    width: 1024,
    height: 768,
    // Place the window on the requested monitor at creation time, so it never
    // flashes on the operator's screen before being moved.
    ...(target ? { x: target.bounds.x + 40, y: target.bounds.y + 40 } : {}),
    title: role === 'primary' ? 'CaptionBuddy — Display' : 'CaptionBuddy — Display 2',
    webPreferences: {
      preload: DISPLAY_WINDOW_PRELOAD_WEBPACK_ENTRY,
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`${DISPLAY_WINDOW_WEBPACK_ENTRY}#role=${role}`);

  win.on('closed', () => {
    if (role === 'primary') {
      displayWindow = null;
    } else {
      secondaryDisplayWindow = null;
    }
    notifyWindowState();
  });

  if (role === 'primary') {
    displayWindow = win;
  } else {
    secondaryDisplayWindow = win;
  }

  if (target) {
    // Fill the target monitor. Done after creation so the window has its
    // bounds applied before going fullscreen.
    win.setBounds(target.bounds);
  }

  notifyWindowState();
}

export function closeDisplayWindow(role: DisplayRole = 'primary'): void {
  const win = role === 'primary' ? displayWindow : secondaryDisplayWindow;
  if (win && !win.isDestroyed()) {
    win.close();
  }
  if (role === 'primary') {
    displayWindow = null;
  } else {
    secondaryDisplayWindow = null;
  }
  notifyWindowState();
}

export function getDisplayWindow(role: DisplayRole = 'primary'): BrowserWindow | null {
  return role === 'primary' ? displayWindow : secondaryDisplayWindow;
}

/** Both open display windows, for broadcasting transcript traffic. */
export function getDisplayWindows(): { role: DisplayRole; win: BrowserWindow }[] {
  const out: { role: DisplayRole; win: BrowserWindow }[] = [];
  if (displayWindow && !displayWindow.isDestroyed()) out.push({ role: 'primary', win: displayWindow });
  if (secondaryDisplayWindow && !secondaryDisplayWindow.isDestroyed()) {
    out.push({ role: 'secondary', win: secondaryDisplayWindow });
  }
  return out;
}

/** Move a display window onto a given monitor and size it to fill that screen. */
export function moveWindowToScreen(role: DisplayRole, screenId: number): boolean {
  const win = getDisplayWindow(role);
  if (!win || win.isDestroyed()) return false;

  const target = screen.getAllDisplays().find((d) => d.id === screenId);
  if (!target) return false;

  // Leaving fullscreen first, or the window keeps the old monitor's bounds.
  if (win.isFullScreen()) win.setFullScreen(false);
  win.setBounds(target.bounds);
  notifyWindowState();
  return true;
}

function screenIdOf(win: BrowserWindow | null): number | null {
  if (!win || win.isDestroyed()) return null;
  const bounds = win.getBounds();
  return screen.getDisplayMatching(bounds).id;
}

export function listScreens(): ScreenInfo[] {
  const primaryScreenId = screenIdOf(displayWindow);
  const secondaryScreenId = screenIdOf(secondaryDisplayWindow);
  const primaryDisplayId = screen.getPrimaryDisplay().id;

  return screen.getAllDisplays().map((d, index) => {
    const occupiedBy: DisplayRole[] = [];
    if (d.id === primaryScreenId) occupiedBy.push('primary');
    if (d.id === secondaryScreenId) occupiedBy.push('secondary');

    return {
      id: d.id,
      label: d.label && d.label.trim().length > 0
        ? d.label
        : `Screen ${index + 1}${d.id === primaryDisplayId ? ' (main)' : ''}`,
      width: d.bounds.width,
      height: d.bounds.height,
      isPrimary: d.id === primaryDisplayId,
      occupiedBy,
    };
  });
}

export function getDisplayWindowState(): DisplayWindowState {
  return {
    primaryOpen: !!displayWindow && !displayWindow.isDestroyed(),
    secondaryOpen: !!secondaryDisplayWindow && !secondaryDisplayWindow.isDestroyed(),
    primaryScreenId: screenIdOf(displayWindow),
    secondaryScreenId: screenIdOf(secondaryDisplayWindow),
  };
}

/**
 * Push window/monitor state to the control panel. Windows can also be closed
 * directly by the operator, so the panel cannot rely on its own bookkeeping.
 */
function notifyWindowState(): void {
  if (!controlWindow || controlWindow.isDestroyed()) return;
  controlWindow.webContents.send(IPC_CHANNELS.DISPLAY_WINDOW_STATE, getDisplayWindowState());
}

export function getControlWindow(): BrowserWindow | null {
  return controlWindow;
}

app.whenReady().then(() => {
  registerIpcHandlers();
  createControlWindow();

  // Projectors get plugged in and unplugged mid-setup; keep the control
  // panel's monitor list and placement in step with reality.
  screen.on('display-added', notifyWindowState);
  screen.on('display-removed', notifyWindowState);
  screen.on('display-metrics-changed', notifyWindowState);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createControlWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
