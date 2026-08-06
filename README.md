# AutoScribe

AutoScribe is an offline, AI-powered transcription tool designed for churches to help hearing-impaired attendees follow along with sermons and services in real time. It runs entirely on-device with no internet connection required after initial setup.

## Features

- **Real-time speech-to-text** using Whisper (via Transformers.js) running locally on CPU
- **Multilingual support** with English and Spanish transcription, plus Spanish-to-English translation
- **Readable pacing** with sentence-by-sentence, word-by-word, and instant display modes (150 to 300 WPM)
- **Customizable display** including font family, size, color themes (light, dark, high contrast), and line height
- **Multiple viewing options**: operator control panel, fullscreen display window, and networked viewers for phones and tablets via WebSocket
- **Bible reference detection** that automatically formats spoken references (e.g., "John 316", "John chapter 3 verse 16") into a standardized bold display
- **QR code generation** for easy connection from mobile devices on the same network
- **Session management** with start, pause, resume, stop, and transcript export to text file
- **Audio input testing** to verify microphone or line-in levels before starting a session
- **Cross-platform** support for macOS, Windows, Linux, and Raspberry Pi

## Requirements

- **Node.js** 18 or later
- **SoX** (Sound eXchange) for audio capture — must be on your `PATH`

### Installing SoX

**macOS**

```bash
brew install sox
```

**Ubuntu / Debian / Raspberry Pi OS**

```bash
sudo apt install sox
```

**Windows**

Either use a package manager:

```powershell
winget install --id ChrisBagwell.SoX
# or
choco install sox
```

Or [download the installer from SourceForge](https://sourceforge.net/projects/sox/files/sox/) and run it.

If you used the installer, add SoX to your `PATH` so AutoScribe can find it. The default install location is `C:\Program Files (x86)\sox-14-4-2`:

1. Open **Settings → System → About → Advanced system settings → Environment Variables**
2. Under **User variables**, select `Path` → **Edit** → **New**
3. Paste the SoX install folder, then click OK on each dialog
4. Open a **new** terminal (PATH changes do not apply to already-open windows)

Verify the install on any platform:

```
sox --version
```

You should see something like `sox: SoX v14.4.2`. If you get "command not found" or "not recognized as an internal or external command," SoX is not on your `PATH` yet.

> **Tip:** If SoX is not found at launch, a red error banner appears in the control panel with a clear message. The app will not crash.

## Getting Started

### Install dependencies

```bash
npm install
```

### Run in development mode

```bash
npm start
```

Works the same on macOS, Windows, and Linux. On Windows, run this from PowerShell, Command Prompt, or Windows Terminal in the project folder.

On first launch, AutoScribe will download the Whisper speech recognition model (approximately 250 MB). A progress bar in the control panel shows download progress. This only happens once; the model is cached locally for future use.

The first time you start a session, your OS may prompt for microphone permission (macOS) or show a Windows Defender Firewall dialog when the network viewer server starts. Allow both — the firewall rule only needs to cover **private networks**.

### Build a distributable

Run the build on the platform you are targeting — Electron Forge builds for the machine it runs on:

```bash
npm run make
```

| Platform | Output | Format |
|----------|--------|--------|
| macOS | `out/make/zip/darwin/` | `.zip` |
| Windows | `out/make/squirrel.windows/x64/` | `.exe` installer + `.nupkg` |
| Linux | `out/make/deb/x64/`, `out/make/rpm/x64/` | `.deb`, `.rpm` |

### Build for Raspberry Pi (Linux arm64)

```bash
npm run make:pi
```

> **Windows note:** the Squirrel maker needs .NET Framework 4.5+ (present on Windows 8 and later). Building an unsigned installer is fine for internal church use; Windows SmartScreen will show a "More info → Run anyway" prompt on first run.

### Lint

```bash
npm run lint
```

Runs ESLint with `@typescript-eslint/recommended` rules across all `src/` TypeScript and TSX files.

### Tests

```bash
npm test
```

Runs the Jest test suite. Tests cover the Bible reference parser across standard, spoken, range, and edge-case formats.

## Architecture

AutoScribe is built with Electron and uses a multi-window architecture:

```
Main Process
  ├── Audio Capture (node-record-lpcm16 + SoX)
  ├── Whisper STT Engine (@huggingface/transformers, ONNX)
  ├── Pacing Controller (WPM throttling and sentence segmentation)
  ├── Control Window (operator interface)
  ├── Display Window (fullscreen paced output)
  └── Network Server (Express + WebSocket for remote viewers)
```

### Audio Pipeline

Audio is captured from a microphone or soundboard input at 16kHz mono PCM, then fed into the Whisper model which produces transcription segments. These segments flow through the pacing controller before reaching the display.

### Display System

The operator always sees transcription output immediately. The display window and network viewers receive paced output according to the configured WPM setting, giving the audience time to read comfortably.

### Network Viewers

When the network server is enabled, any device on the same local network can connect via a web browser to view the live transcription. The viewer page is fully self-contained and adjusts to the display settings configured by the operator.

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Framework | Electron 40, TypeScript 5 |
| UI | React 18, TailwindCSS 3 |
| Speech-to-Text | Whisper (onnx-community/whisper-small) via @huggingface/transformers |
| Audio Capture | node-record-lpcm16, SoX |
| Network | Express 5, WebSocket (ws) |
| Build | electron-forge, Webpack |
| NLP | compromise (sentence segmentation) |
| Settings Persistence | electron-store |
| Testing | Jest, ts-jest |
| Linting | ESLint 10, @typescript-eslint |

## Project Structure

```
src/
  main/                  # Electron main process
    audio/               # Audio capture and processing
    stt/                 # Speech-to-text engine (Whisper)
    transcript/          # Buffer, pacing controller, storage
    server/              # HTTP + WebSocket server for network viewers
    ipc/                 # IPC handler registration
    index.ts             # App entry point, window management
  renderer/
    control/             # Operator control panel (React)
    display/             # Fullscreen display window (React)
  shared/
    types/               # Shared TypeScript interfaces
    __tests__/           # Jest unit tests
    bibleData.ts         # Verse count data for reference validation
    bibleReferences.ts   # Bible reference detection and normalization
  preload/               # Context bridge scripts
  assets/                # Logo and app icon
```

## Configuration

All settings are adjustable from the control panel at runtime and are **automatically persisted** between sessions — no manual save required.

| Setting | Options |
|---------|---------|
| Pacing Mode | Sentence-by-sentence, Word-by-word, Instant |
| WPM | 150 to 300 |
| Font | Arial, Verdana, Georgia, OpenDyslexic |
| Font Size | 16px to 72px |
| Display Theme | Light, Dark, High Contrast |
| Control Panel Theme | Light, Dark, High Contrast |
| Language | English, Spanish, Spanish to English translation |
| Audio Input | Microphone or Line-in, with device selection |

### Where files are stored

Settings are stored via `electron-store` in the OS user-data directory, and the downloaded Whisper model is cached in a `models` subfolder of that same directory:

| Platform | User data directory |
|----------|--------------------|
| macOS | `~/Library/Application Support/AutoScribe/` |
| Windows | `%APPDATA%\AutoScribe\` (i.e. `C:\Users\<you>\AppData\Roaming\AutoScribe\`) |
| Linux | `~/.config/AutoScribe/` |

Deleting `config.json` in that folder resets all settings to defaults. Deleting the `models` folder forces a fresh model download on next launch.

## Error Handling

The control panel surfaces runtime errors as dismissible red banners:

- **SoX not found** — shown if the audio capture process fails to start
- **Transcription errors** — shown if the Whisper model encounters a problem
- **Model download progress** — a progress bar is shown the first time the model is downloaded

No error silently swallowed by the main process will go unnoticed by the operator.

## Troubleshooting

**"SoX not found" banner (all platforms)**
SoX is either not installed or not on your `PATH`. Run `sox --version` in a terminal to confirm. On Windows, remember that PATH changes only apply to newly opened terminals — close and reopen your terminal, and fully quit and relaunch AutoScribe.

**No audio levels in the input test (Windows)**
Check **Settings → System → Sound → Input** and confirm the right device is set as default and its level is up. Then in **Settings → Privacy & security → Microphone**, make sure "Let desktop apps access your microphone" is on. AutoScribe records through SoX's default Windows audio device, so the Windows default input is what it picks up.

**Device dropdown only shows "System Default" (Windows)**
Device enumeration uses PowerShell (`Get-WmiObject Win32_SoundDevice`). If PowerShell is restricted by policy, the list falls back to the system default only — audio capture still works, it just uses whatever Windows has set as the default input.

**Network viewers can't connect**
The server listens on port 8080. Allow AutoScribe through Windows Defender Firewall on private networks, and confirm phones are on the same network (not a guest SSID that blocks client-to-client traffic). If port 8080 is already in use, the control panel reports it.

**Model download stalls on first launch**
The initial ~250 MB download needs internet access; corporate or church filtering may block it. Once cached, AutoScribe runs fully offline.

## License

MIT
