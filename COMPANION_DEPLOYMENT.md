# Atlas Companion Deployment Guide

This guide covers deploying the Atlas Companion Service on your Windows machine for desktop automation via natural language commands.

## Prerequisites

- **Windows 10 or later** (Windows 11 recommended)
- **Node.js 18+** (LTS version recommended)
- **AutoHotkey v2.0+** (auto-installed if missing)
- **Network access** between Atlas and your Windows machine (if remote)

## Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/herbert051281/AtlasCompanion.git
cd AtlasCompanion
```

### 2. Install Dependencies

```bash
npm install
```

### 3. Build the Service

```bash
npm run companion:build
```

### 4. Start the Service

```bash
npm run companion:start
```

You should see:
```
🚀 Companion Service listening on http://127.0.0.1:9999
🔒 Safe mode: enabled (UI control blocked by default)
📋 Audit log: enabled
Ready for Atlas commands.
```

## Usage

Once the service is running, interact with Atlas via Telegram:

### Grant Control

Before executing commands, grant Atlas control:

```
Grant me control for 5 minutes
```

Atlas will respond with a confirmation and token.

### Execute Commands

With control granted, you can issue commands:

**Mouse:**
```
Move mouse to 500,300
Click at 100,200
Double click at 250,250
Right click at 300,400
```

**Keyboard:**
```
Type hello world
Press Ctrl+A
Press Alt+Tab
Press Enter
```

**Apps & Windows:**
```
Open Notepad
Open Chrome
Focus Discord
List windows
```

**Chained Commands:**
```
Move mouse to 500,300, click
Open Notepad, wait 2s, type hello world
```

### Revoke Control

When done, revoke control:

```
Revoke control
```

### Check Status

```
Control status
```

## Firewall Configuration (Optional)

By default, the service binds to `127.0.0.1` (localhost only). If Atlas runs on a different machine:

### Open Port in Windows Firewall

**PowerShell (Run as Administrator):**
```powershell
New-NetFirewallRule -DisplayName "Atlas Companion" `
  -Direction Inbound `
  -LocalPort 9999 `
  -Protocol TCP `
  -Action Allow
```

### Bind to All Interfaces

Edit `apps/companion-service/src/server.ts`:
```typescript
const host = '0.0.0.0';  // Instead of '127.0.0.1'
```

Rebuild after changes:
```bash
npm run companion:build
```

⚠️ **WARNING:** Binding to `0.0.0.0` exposes desktop control over the network. Use only on trusted networks with proper authentication.

## Security Features

The Companion Service includes several safety mechanisms:

### 1. Control Window

- Commands only execute with an active control token
- Tokens expire after the specified duration (default: 5 minutes)
- Auto-revoke on timeout (deadman switch)

### 2. Safe Mode

- UI control actions blocked by default until explicitly enabled
- High-risk operations require approval

### 3. Panic Stop

- Press `Ctrl+Alt+Pause` to immediately halt all actions
- Clears the task queue and revokes control

### 4. Audit Logging

- All commands logged to SQLite database
- Exportable for review via `/api/audit/export`

### 5. Localhost Binding

- Service binds to `127.0.0.1` by default
- Prevents remote access unless explicitly configured

## Troubleshooting

### Service Won't Start

**Port already in use:**
```cmd
netstat -ano | findstr :9999
taskkill /PID <PID> /F
```

**Node.js not found:**
```cmd
node --version
```
If not installed, download from https://nodejs.org/

### Atlas Can't Reach Service

1. Check service is running (console output)
2. Verify firewall allows port 9999
3. Test connectivity: `curl http://127.0.0.1:9999/health`

### Commands Not Executing

1. Check console for errors
2. Verify AutoHotkey 2.0+ is installed
3. Try a simple command: `move mouse to 100,100`
4. Check control is granted: `control status`

### AutoHotkey Missing

The service will attempt to download AutoHotkey if missing. If auto-install fails:

1. Download from https://www.autohotkey.com/download/
2. Install to default location
3. Restart the service

## Advanced Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `COMPANION_PORT` | `9999` | Service port |
| `COMPANION_HOST` | `127.0.0.1` | Bind address |
| `CONTROL_WINDOW_MS` | `300000` | Default control duration (5 min) |
| `SAFE_MODE` | `true` | Enable safe mode |
| `AUDIT_LOG_PATH` | `./audit.db` | SQLite audit log path |

### Running as a Windows Service

To run the companion as a background service:

**Using NSSM (Non-Sucking Service Manager):**
```cmd
nssm install AtlasCompanion "C:\path\to\node.exe" "C:\path\to\AtlasCompanion\dist\server.js"
nssm start AtlasCompanion
```

**Using PM2:**
```bash
npm install -g pm2
pm2 start npm --name "atlas-companion" -- run companion:start
pm2 save
pm2 startup
```

### Packaging as Electron App

For a standalone desktop application:

```bash
npm run companion:package:win
```

This creates an installer in `dist/` directory.

## API Reference

### Health Check

```
GET /health
```

Returns `{ status: "ok" }` if service is running.

### Execute Primitive

```
POST /execute-primitive
{
  "primitive": "mouse.move",
  "params": { "x": 100, "y": 100 },
  "approved": true
}
```

### Execute Operation

```
POST /execute-operation
{
  "operation": "app.launch",
  "params": { "appPath": "notepad.exe" },
  "approved": true
}
```

### Control Grant

```
POST /control/grant
Authorization: Bearer <token>
{
  "durationMs": 300000
}
```

### Control Revoke

```
POST /control/revoke
Authorization: Bearer <token>
```

### Control Status

```
GET /control/status
```

### Audit Export

```
GET /api/audit/export?limit=100
Authorization: Bearer <token>
```

## Support

- **Issues:** https://github.com/herbert051281/AtlasCompanion/issues
- **Discussions:** https://github.com/herbert051281/AtlasCompanion/discussions

---

*Last updated: March 2026*
