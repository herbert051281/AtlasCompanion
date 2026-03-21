# Atlas Companion

Safety-first local companion app for controlled desktop automation. Control your Windows machine via natural language commands through Atlas (Telegram).

## Highlights

- 🔒 **Localhost-only** by default (`127.0.0.1`)
- 🛡️ **Safe mode** blocks risky actions without approval
- ⏱️ **Control window** with auto-expiry (deadman switch)
- 🚨 **Panic STOP** with `Ctrl+Alt+Pause`
- 📋 **Full audit logging** to SQLite
- 🖥️ **Electron wrapper** + Windows NSIS packaging

## Quick Start

```bash
npm install
npm test
npm run companion:build
npm run companion:start
```

## Block 3: Natural Language Desktop Control

Atlas can now control your Windows machine via natural language commands.

### Setup

1. Start the companion service on Windows:
   ```bash
   npm run companion:start
   ```

2. In Telegram, grant control:
   ```
   Grant me control for 5 minutes
   ```

3. Issue commands:
   ```
   Move mouse to 500,300 and click
   Open Notepad, type hello world
   Focus Chrome, press Ctrl+A
   ```

### Supported Commands

| Category | Examples |
|----------|----------|
| **Mouse** | `move mouse to X,Y`, `click at X,Y`, `double click`, `right click` |
| **Keyboard** | `type hello world`, `press Ctrl+A`, `press Alt+Tab`, `press Enter` |
| **Apps** | `open Notepad`, `open Chrome`, `open Calculator` |
| **Windows** | `focus Discord`, `list windows` |
| **Control** | `grant control`, `revoke control`, `control status` |
| **Chaining** | `move to 500,300, click`, `open Notepad, wait 2s, type hi` |

### Full Deployment Guide

See **[COMPANION_DEPLOYMENT.md](./COMPANION_DEPLOYMENT.md)** for detailed setup instructions, security configuration, troubleshooting, and API reference.

## Architecture

```
┌─────────────┐     HTTP      ┌─────────────────────────────┐
│   Atlas     │──────────────▶│   Companion Service         │
│  (Telegram) │               │   ├── Command Parser (NLP)  │
└─────────────┘               │   ├── Control Window        │
                              │   ├── Executor              │
                              │   └── Adapters              │
                              │       ├── AutoHotkey        │
                              │       ├── PowerShell        │
                              │       └── Playwright        │
                              └─────────────────────────────┘
```

## Development

### Run Tests

```bash
npm test
```

### Build Service

```bash
npm run companion:build
```

### Package for Windows

```bash
npm run companion:package:win
```

Installer output: `dist/Skillmaster Companion Setup 0.1.0.exe`

## Security

- **Control tokens** expire after configurable duration
- **Safe mode** requires explicit unlock for UI actions
- **Audit log** records all executed commands
- **Panic stop** halts execution immediately
- **Localhost binding** prevents remote access by default

## License

MIT
