# AtlasCompanion v0.2 — Full-Control Architecture Design

**Status:** Proposed  
**Date:** 2026-03-21  
**Audience:** Intermediate (desktop + service developers)

## 1) Goal and Scope

Deliver local, user-granted **full-control mode**: once control is granted, Atlas can operate any app on the machine (keyboard/mouse + launch apps), with strong local safety controls.

### In scope
- Windows helper service for input automation + app launch + optional UI Automation (UIA) hooks.
- Live screen capture stream for local agent decision loops.
- Command pipeline from natural language to executable action steps.
- Safety controls (TTL grant, STOP NOW, kill hotkey, audit logs).
- Service/UI API additions with minimal UI changes.

### Out of scope (v0.2)
- Cross-machine remote control over internet.
- Perfect semantic UI understanding in every app.
- Privileged UAC bypass/elevation automation.
- Multi-monitor advanced orchestration beyond primary monitor first pass.

---

## 2) Proposed Runtime Architecture

```text
User -> Companion Desktop UI (Electron)
      -> Companion Service (Node, localhost)
          -> Policy + Session + Planner + Executor
          -> Windows Helper Service (local only)
              - Input Driver: keyboard/mouse
              - App Launcher: start/focus/close process
              - Optional UIA Adapter: inspect/invoke controls
              - Screen Capture Adapter: desktop frames
          -> Audit Log (SQLite)
```

### Components
1. **Companion Desktop UI**
   - Existing grant-control and STOP NOW entry points remain.
   - Shows grant countdown, active control badge, kill-hotkey hint.

2. **Companion Service (Node, localhost:127.0.0.1)**
   - Keeps current token/session behavior.
   - Adds control session lifecycle and action execution state machine.
   - Owns command planning and adapter dispatch.

3. **Windows Helper Service (new, local)**
   - Preferred: small Rust/C# daemon with signed binary and named-pipe/HTTP loopback interface.
   - Exposes deterministic low-level primitives:
     - `mouse.move/click/drag/scroll`
     - `keyboard.type/keyChord`
     - `app.launch/focus/list/windows`
     - `capture.frame`
     - optional `uia.query/uia.invoke`

4. **Audit Storage**
   - Existing audit package extended with control-specific event schema.

---

## 3) Full-Control Session Model

- Default mode remains `safe`.
- User clicks **Grant Control** -> service creates active control lease (`controlGranted=true`, `expiresAt`).
- While lease active, UI/agent commands can execute all app actions by default.
- On expiry or STOP/Kill hotkey, service hard-stops all running actions and blocks new executions.

State transitions:
- `safe` -> `controlled_ui` (grant)
- `controlled_ui` -> `safe` (ttl expiry, stop now, kill hotkey)
- `controlled_ui(active)` -> `controlled_ui(extended)` on explicit renew.

---

## 4) Live Screen Capture / Stream Approach

### v0.2 recommendation
Use **pull-based local MJPEG/WebSocket frame stream** from helper service:
- Capture source: Windows Graphics Capture (DXGI-based API wrappers).
- Frame cadence: target 2–5 FPS for planning loop; burst to 10 FPS for active interactions.
- Resolution: default downscaled 1280x720 for latency + OCR feasibility.
- Transport to service: localhost WebSocket binary frames or shared-memory ring buffer with frame metadata.

Why this approach:
- Fast to implement locally.
- Good enough for action verification and re-planning.
- No external media infra required.

Deferred:
- Full WebRTC stack (candidate for v0.3 if remote human watch/control is required).

---

## 5) Command Pipeline (Natural Language -> Actions)

1. **Command Intake**
   - Example: “Open Excel and update today sales tab.”
2. **Intent + Constraints Extraction**
   - Parse target app, objective, risk hints, stop conditions.
3. **Action Planner**
   - Build executable step graph from primitives:
     - launch/focus app
     - locate anchor (image template / optional UIA selector)
     - type/click/shortcut
     - verify checkpoint (screen diff/text match/window title)
4. **Executor**
   - Runs steps serially with per-step timeout and retries.
   - Emits fine-grained events and snapshots.
5. **Verifier + Recovery**
   - If checkpoint fails: try bounded recovery path, else fail safe and request user guidance.

Action object shape (internal):
```json
{
  "commandId": "cmd_...",
  "steps": [
    {"type":"app.launch","args":{"app":"excel.exe"}},
    {"type":"keyboard.chord","args":{"keys":["CTRL","O"]}},
    {"type":"verify.window","args":{"titleContains":"Excel"}}
  ],
  "stopOnFailure": true
}
```

---

## 6) Safety Controls

Mandatory controls in v0.2:
1. **Grant TTL**
   - Existing `/control/grant` retained; enforce hard expiry.
   - UI countdown visible at all times in controlled mode.

2. **STOP NOW**
   - Existing endpoint remains immediate global abort.
   - Cancels queue + in-flight helper actions.

3. **Kill Hotkey (global)**
   - New OS-level emergency chord (default: `Ctrl+Alt+Pause`).
   - Registered in helper service and mirrored in UI.

4. **Audit Logging**
   - Log every control-sensitive event:
     - grant/extend/revoke
     - command accepted/denied
     - each primitive execution + result
     - kill hotkey + panic events
   - Include `commandId`, `sessionId`, `window/app context`, timestamps.

5. **Execution Guardrails**
   - Hard per-step timeout, max retries, dead-man timer when no heartbeat from service.

---

## 7) API Contracts (v0.2 additions)

Keep existing routes; add minimal new contracts.

### New/updated service endpoints
- `POST /control/grant` (existing)
  - request: `{ ttlMs?: number }`
  - response adds `sessionId`.

- `POST /control/revoke` (new)
  - immediate revoke to safe mode.

- `GET /control/status` (existing)
  - response add `remainingMs`, `killHotkey`, `activeCommandId?`.

- `POST /commands/execute` (new)
  - request: `{ text: string, context?: object }`
  - response: `{ commandId, state: "queued"|"running" }`

- `POST /commands/:id/stop` (new)
  - stop specific command.

- `GET /stream/screen` (new)
  - local frame stream metadata or ws upgrade link.

- `GET /commands/:id` (new)
  - step-level execution status.

### Helper service API (local only)
- `POST /input/mouse`
- `POST /input/keyboard`
- `POST /apps/launch`
- `GET /apps/windows`
- `GET /capture/frame`
- optional `POST /uia/query`, `POST /uia/invoke`

---

## 8) Minimal UI Changes

1. Add **Control Session Panel**:
   - active/inactive badge
   - remaining time
   - renew + revoke buttons

2. Add **Emergency Controls**:
   - STOP NOW kept prominent
   - display kill hotkey text

3. Add **Command Console**:
   - free-text command input
   - current command state + last 10 steps

4. Add **Screen Preview Pane**:
   - low-FPS preview from local stream

No major navigation rewrite; evolve current dashboard cards.

---

## 9) Blocked / Deferred Risks

1. **UIA reliability varies across legacy apps**  
   - Mitigation: optional UIA with fallback to image/keyboard workflows.

2. **Input injection conflicts with foreground changes**  
   - Mitigation: explicit focus checks before each action, recover/fail fast.

3. **Screen capture performance on low-end hardware**  
   - Mitigation: adaptive FPS/resolution presets.

4. **Security perception of full-control mode**  
   - Mitigation: strict localhost binding, explicit user grant, visible countdown, immutable audit trail.

5. **Privilege boundaries (UAC/elevated windows)**  
   - Deferred: v0.2 documents unsupported elevated-target workflows unless helper is also elevated.

---

## 10) Test Strategy (design-level)

- **Unit tests**
  - planner step generation
  - grant/session expiry behavior
  - safety interlocks (panic/hotkey)

- **Integration tests (service + helper mock)**
  - execute command -> verify ordered primitive calls
  - revoke during execution -> assert immediate halt

- **E2E smoke on Windows**
  - grant control, launch Notepad, type text, stop command, export logs

- **Failure-mode tests**
  - helper crash mid-command
  - stream unavailable
  - stale control lease

Success condition for v0.2: deterministic local full-control loop works with emergency stop and auditable history.
