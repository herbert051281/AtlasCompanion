# Skillmaster Companion Windows Install & Run

## Prerequisites
- Windows 10/11 x64
- Node.js 20+ and npm (for local build from source)
- PowerShell 5.1+ (for demo script)
- Git (if cloning source)

## Security Defaults (kept from MVP)
- Companion service binds to `127.0.0.1` only.
- Execution mode defaults to `safe`.
- Session token TTL defaults to 30 minutes.
- UI includes a **STOP NOW** panic-stop control.

## Build from source
From repo root:

```powershell
npm install
npm run companion:build
npm run companion:package:win
```

This produces an NSIS installer (`.exe`) using Electron Builder.

## Alternative packaging (portable)
```powershell
npm run companion:package:portable
```

If Smart App Control blocks installer execution, use:
- `dist\win-unpacked\Skillmaster Companion.exe` (internal testing), or
- signed portable executable.

For production distribution, sign binaries first (see `docs/runbooks/windows-code-signing.md`).

## Install steps
1. Open `dist/Skillmaster Companion Setup <version>.exe`.
2. Complete installer wizard (per-user install by default).
3. Launch **Skillmaster Companion** from Start Menu/Desktop shortcut.
4. App starts local service automatically and shows dashboard.

## Dev run (no installer)
```powershell
npm run companion:dev
```

## Operator one-command demo flow
Runs: health → session → create task → start task → panic stop → log export

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\demo-companion.ps1
```

Optional custom log output path:
```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\demo-companion.ps1 -ExportPath .\exports\demo.json
```

## Rollback / Uninstall
### Uninstall app
- Settings → Apps → Installed apps → **Skillmaster Companion** → Uninstall
- or run uninstaller from `%LOCALAPPDATA%\Programs\Skillmaster Companion\Uninstall Skillmaster Companion.exe`

### Roll back to previous version
1. Uninstall current version.
2. Reinstall previous known-good installer artifact from CI/archive.
3. Launch and verify `/health` and `/status` from UI.

## Notes & limitations
- Building Windows installer on Linux is typically unsupported for NSIS without a Windows build environment or Wine/Mono setup.
- Recommended packaging path: run `npm run companion:package:win` on Windows CI runner or Windows workstation.
