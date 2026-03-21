# Atlas Companion

Safety-first local companion app for controlled desktop automation.

## Highlights
- Localhost-only service (`127.0.0.1`)
- Safe mode default
- Approval workflow for risky actions
- Panic STOP control
- Audit export
- Electron desktop wrapper + Windows NSIS packaging flow

## Quick start
```bash
npm install
npm test
npm run companion:build
npm run companion:package:win
```

Installer output on Windows:
- `dist/Skillmaster Companion Setup 0.1.0.exe`
