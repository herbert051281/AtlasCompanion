# Block 3: Atlas Command Integration — Design Document

**Date:** 2026-03-22  
**Status:** Design Phase  
**Goal:** Wire Atlas (you, via Telegram) to the helper service so you can command me to control your Windows machine via natural language.

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│ You (Telegram Chat)                                             │
│ "move mouse to 500,300 and click"                               │
└────────────────────────────┬────────────────────────────────────┘
                             │
                    ┌────────▼─────────┐
                    │ Atlas Handler    │
                    │ (NLP → Primitives)
                    └────────┬─────────┘
                             │
                    ┌────────▼──────────────┐
                    │ Helper Service Client │
                    │ (TypeScript)          │
                    └────────┬──────────────┘
                             │
                ┌────────────▼────────────────┐
                │ HTTP (Direct)               │
                │ POST /execute-primitive     │
                │ POST /execute-operation     │
                └────────────┬────────────────┘
                             │
            ┌────────────────▼────────────────────┐
            │ Companion Service (Windows)         │
            │ - AutoHotkey Primitives             │
            │ - PowerShell Operations             │
            │ - Approval Workflow + Audit         │
            └─────────────────────────────────────┘
```

---

## 2. Components & Responsibilities

### 2.1 Atlas Handler (`src/atlas-handler.ts`)
**Responsibility:** Parse natural language commands and translate them into primitive/operation sequences.

**Interface:**
```typescript
type CommandRequest = {
  text: string;           // "move mouse to 500,300 and click"
  controlWindow?: string; // Optional: approval token (5-min window)
};

type CommandResult = {
  success: boolean;
  executed: Array<{ primitive: string; params: any; result: any }>;
  errors?: string[];
};
```

**Capabilities:**
- Recognize primitives: "move mouse", "click", "type X", "press Ctrl+A"
- Recognize operations: "open Notepad", "focus window", "list windows"
- Parse coordinates: "500,300", "top-left", "center"
- Chain operations: "open Notepad, wait 1s, type hello, save"

**NLP Strategy:**
- Pattern matching for common phrases
- Fallback to best-guess extraction (coordinates, app names)
- Reject ambiguous requests ("go there and do something")

### 2.2 Helper Service Client (`src/companion-client.ts`)
**Responsibility:** HTTP client that calls the Windows service endpoints with error handling and retry logic.

**Interface:**
```typescript
class CompanionClient {
  constructor(baseUrl: string, options?: { timeout?: number; retries?: number });
  
  async executePrimitive(
    primitive: string,
    params: Record<string, any>,
    approved: boolean
  ): Promise<CommandResult>;
  
  async executeOperation(
    operation: string,
    params: Record<string, any>,
    approved: boolean
  ): Promise<CommandResult>;
  
  async listPrimitives(): Promise<string[]>;
  async listOperations(): Promise<string[]>;
}
```

**Responsibilities:**
- HTTP calls to `/execute-primitive` and `/execute-operation`
- Retry on transient failures (network hiccups)
- Timeout after 10s (helper service is local, should be fast)
- Error handling & logging

### 2.3 Control Window Manager (`src/control-window.ts`)
**Responsibility:** Track approval tokens and auto-expire control windows.

**Interface:**
```typescript
class ControlWindowManager {
  grantControl(durationMs: number): string;  // Returns token
  isApproved(token?: string): boolean;       // Check if still valid
  revokeControl(token: string): void;        // Manual revoke
  getStatus(): { active: boolean; expiresAt?: number; remainingMs?: number };
}
```

**Behavior:**
- User grants: "Grant control for 5 min" → returns token
- Atlas can use token to auto-approve safe primitives (move, click, type)
- Destructive ops (app.launch) still require explicit approval even with token
- Token expires after duration
- Panic stop (Ctrl+Alt+Pause) revokes immediately

### 2.4 Deployment Package (`companion-service/package.json` + start script)
**Responsibility:** Make it easy for you to run the service on Windows.

**What you do:**
```bash
# Clone repo
git clone https://github.com/herbert051281/AtlasCompanion.git
cd AtlasCompanion

# Install + build
npm install
npm run companion:build

# Start service
npm run companion:start
# Service runs on http://127.0.0.1:9999
# Open firewall port 9999 (or port-forward if remote)
```

---

## 3. Data Flow

### 3.1 Simple Command Flow
```
User: "move mouse to 500,300 and click"
  ↓
Atlas Handler: parse → [
    { primitive: "mouse.move", params: { x: 500, y: 300 } },
    { primitive: "mouse.click", params: { button: "left", x: 500, y: 300 } }
  ]
  ↓
Check Control Window: Is approved token valid?
  ├─ YES → auto-approve (safe primitives)
  └─ NO → request user approval
  ↓
Companion Client: HTTP POST /execute-primitive for each
  ↓
Helper Service: Execute AutoHotkey scripts
  ↓
Result: "Executed 2 commands successfully"
```

### 3.2 Workflow with Mixed Approval
```
User: "open Notepad, wait 2s, type hello world" (NO control token)
  ↓
Atlas Handler: parse → [
    { operation: "app.launch", params: { appPath: "notepad.exe" } },
    { wait: 2000 },
    { primitive: "keyboard.type", params: { text: "hello world" } }
  ]
  ↓
Check permissions:
  ├─ app.launch → RISKY → request approval
  ├─ wait → OK
  └─ keyboard.type → SAFE (within 5-min window after app.launch approval)
  ↓
User: "yes" (approves app launch)
  ↓
Execute sequence with wait
  ↓
Result: "Opened Notepad, typed hello world"
```

### 3.3 Control Window Grant Flow
```
User: "Grant me control for 5 minutes"
  ↓
ControlWindowManager: create token + set expiry
  ↓
Atlas: "Control granted until 23:45 UTC. Safe operations auto-approved."
  ↓
(User can now issue commands with auto-approval for 5 min)
  ↓
User: "move mouse to 100,100" (no explicit approval needed)
  ↓
Atlas: execute immediately (token valid + primitive is safe)
  ↓
Token expires → "Control window closed"
```

---

## 4. Approval Logic & Safety

### 4.1 Safe Primitives (auto-approve with valid token)
- `mouse.move` — just movement
- `mouse.click` — clicking (not destructive)
- `keyboard.type` — typing text
- `keyboard.hotkey` — standard hotkeys (Ctrl+S, Alt+Tab)

### 4.2 Unsafe Operations (always require explicit approval)
- `app.launch` — could launch malware/unwanted apps
- `app.close` — could force-close critical apps
- `window.minimize` — minor but still changes state

### 4.3 Approval Logic
```typescript
function shouldAutoApprove(action: string, controlToken?: string): boolean {
  const safeActions = ['mouse.move', 'mouse.click', 'keyboard.type', 'keyboard.hotkey'];
  
  if (safeActions.includes(action)) {
    return controlToken && isTokenValid(controlToken);
  }
  
  return false; // Risky actions always need explicit approval
}
```

### 4.4 Audit Trail
Every action (granted, executed, denied) is logged with timestamp + details for your review.

---

## 5. Error Handling

### 5.1 Network Errors
- **Companion service unreachable** → Atlas: "Service offline. Start the helper on Windows."
- **Timeout** → Atlas: "Command timed out. Aborting."
- **Retries** → 3 attempts with exponential backoff before giving up

### 5.2 Invalid Commands
- **Ambiguous request** → Atlas: "I didn't understand. Be more specific."
- **Unknown primitive** → Atlas: "Can't do that (primitive not available)."
- **Missing parameters** → Atlas: "Need coordinates: 'move mouse to X,Y'."

### 5.3 Approval Rejections
- **User says no** → Atlas: "Command denied. Not executed."
- **Token expired** → Atlas: "Control window closed. Grant control again to proceed."
- **Panic stop triggered** → Atlas: "Control emergency-stopped by user. All actions halted."

---

## 6. Testing Strategy

### 6.1 Unit Tests
- **NLP Parser:** Test phrase recognition, coordinate extraction, edge cases
- **Control Window:** Test token creation, expiry, revocation
- **Client:** Test HTTP calls, error handling, retries

### 6.2 Integration Tests
- **Full workflow:** Grant control → execute commands → token expires
- **Approval paths:** Safe vs unsafe primitives
- **Error scenarios:** Network down, invalid commands, timeout

### 6.3 Manual Testing (you on Windows)
1. Start service: `npm run companion:start`
2. Grant control: "Grant me control for 2 min"
3. Issue commands: "Move mouse to 500,300", "Click", "Type hello"
4. Revoke: "Revoke control" (before token expires)

---

## 7. Configuration & Deployment

### 7.1 Environment Variables
```
COMPANION_SERVICE_URL=http://127.0.0.1:9999  # Helper service endpoint
CONTROL_WINDOW_DEFAULT_MS=300000              # 5 min default
COMMAND_TIMEOUT_MS=10000                      # Abort after 10s
ENABLE_AUDIT_LOG=true
```

### 7.2 Windows Deployment
1. Clone repo
2. `npm install`
3. `npm run companion:build` (TypeScript compilation)
4. `npm run companion:start` (launches service on port 9999)
5. Open Windows Firewall: Allow port 9999 inbound (or disable firewall on localhost)

### 7.3 Firewall Rules (Windows)
```powershell
# PowerShell (Admin)
New-NetFirewallRule -DisplayName "Atlas Companion" -Direction Inbound -LocalPort 9999 -Protocol TCP -Action Allow
```

Or simpler: Bind to `127.0.0.1` only (localhost, no firewall needed if calling from same machine).

---

## 8. Success Criteria

✅ **Block 3 is done when:**
1. Atlas Handler parses natural language → primitives/operations
2. Control Window Manager grants/revokes/expires tokens
3. Helper Service Client makes HTTP calls to Windows service
4. All 3 components tested (unit + integration)
5. Deployment guide (README) explains how to start service on Windows
6. You can issue a command ("move mouse to 500,300") and it executes on your Windows machine

---

## 9. Implementation Phases (Writing-Plans)

Phase 1: **Command Parser & Handler** (Task 1-2)
- Parse natural language
- Build command sequence
- Approve/execute

Phase 2: **Control Window Manager** (Task 3-4)
- Token generation + validation
- Expiry logic
- Status reporting

Phase 3: **Helper Service Client** (Task 5-6)
- HTTP client with retry logic
- Error handling
- Timeout management

Phase 4: **Atlas Integration & Deployment** (Task 7-8)
- Wire handler to Telegram commands
- Add deployment scripts
- Documentation + README

---

## 10. Decisions Locked In

✅ Natural language parsing (no structured commands)  
✅ Direct HTTP to localhost (no tunnels, no fees)  
✅ Sequential workflows only (no conditionals)  
✅ Hybrid approval (safe auto-approve, risky require sign-off)  
✅ 5-min default control window  
✅ Full package deployment (handler + client + guide)

---

## Questions Before Implementation?

Does this design match your vision? Any changes needed before I move to writing-plans?
