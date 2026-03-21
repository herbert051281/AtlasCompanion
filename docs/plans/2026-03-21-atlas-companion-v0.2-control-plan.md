# AtlasCompanion v0.2 — Full-Control Implementation Plan

**Date:** 2026-03-21  
**Goal:** Ship local full-control mode with hard safety controls and auditability.

## Delivery Strategy

Execute in **4 build blocks** (sequential). Each block ends with a demo and acceptance gate.

---

## Block 1 — Control Session + Safety Baseline

### Scope
- Extend service control lifecycle:
  - add `POST /control/revoke`
  - enrich `GET /control/status` with `remainingMs`, `killHotkey`, active command state.
- Implement global kill hotkey handling path (service-level contract first, helper wiring stub).
- Ensure STOP NOW cancels both queue and active command runner.
- Extend audit event schema for control lifecycle and emergency events.

### Tasks
1. Service route additions and control-state model update.
2. Panic/stop code path unified for endpoint + hotkey signal.
3. Audit package schema update + export coverage.
4. UI: show countdown + revoke control button + kill hotkey hint.

### Acceptance Criteria
- Grant with TTL transitions to controlled mode and auto-reverts to safe at expiry.
- STOP NOW and revoke each halt active tasks within 1 second.
- `GET /logs/export` contains grant/revoke/stop events with timestamps.
- UI always shows live remaining control time while active.

---

## Block 2 — Windows Helper Service (Input + App Launch)

### Scope
- Build local helper daemon (Windows-only target) exposing primitives:
  - keyboard input, mouse input, app launch/focus/list windows.
- Service <-> helper local IPC/HTTP client integration.
- Replace synthetic execution path with real primitive execution engine.

### Tasks
1. Create helper service skeleton + health endpoint.
2. Implement mouse/keyboard primitives with deterministic response payloads.
3. Implement app launch/focus/list-window primitives.
4. Add service adapter with retries/timeouts and typed command mapping.
5. Add integration tests using helper mock.

### Acceptance Criteria
- From service API, command can launch Notepad and type text end-to-end.
- Primitive failures return structured errors and are logged.
- Helper unavailable => command fails safe (no partial uncontrolled loops).
- Service remains localhost-only and rejects non-local bind.

---

## Block 3 — Live Screen Stream + Command Pipeline

### Scope
- Screen capture adapter in helper (`capture.frame` + streaming endpoint).
- Command execution pipeline:
  - `POST /commands/execute` natural text intake
  - planner generates ordered primitive steps
  - executor runs with per-step verification hooks.
- Minimal preview stream in desktop UI.

### Tasks
1. Implement low-latency local frame transport (WebSocket or frame pull endpoint).
2. Add planner module (`text -> steps`) with deterministic templates for top actions.
3. Add executor state machine and per-step status events.
4. Add command status endpoints and UI command console.

### Acceptance Criteria
- User command “Open Notepad and type hello” runs successfully via `POST /commands/execute`.
- UI shows command progression (queued/running/done/failed + last steps).
- Screen preview updates at target 2–5 FPS baseline without UI freeze.
- Executor halts instantly when STOP NOW/revoke/hotkey triggers.

---

## Block 4 — Hardening, Optional UIA Hooks, and Release Readiness

### Scope
- Optional UIA adapter (`uia.query`, `uia.invoke`) for robust control paths where available.
- Failure-mode hardening and risk handling.
- End-to-end validation, docs finalization, release checklist.

### Tasks
1. Implement optional UIA hooks behind feature flag.
2. Add watchdog/dead-man timers and adaptive capture quality controls.
3. Build E2E Windows test matrix (happy path + emergency path + helper crash path).
4. Finalize operator runbook updates for full-control workflows.

### Acceptance Criteria
- UIA-enabled flows work on at least one Office app + one browser scenario (feature-flagged).
- Helper crash mid-command triggers safe stop and visible error in UI.
- Test suite includes emergency-stop regression tests and passes on CI Windows runner.
- Release checklist complete: safety controls, audit export, and rollback procedure documented.

---

## Deferred / Blocked Items (explicit)

- Elevated/UAC-secure desktop interaction automation (defer to v0.3).
- Multi-monitor intelligent targeting (v0.3).
- Remote streaming/remote control over internet via WebRTC (v0.3).
- Cross-platform parity (Linux/macOS helper) beyond current shell.

---

## Suggested Ownership Split

- **Service/API:** companion-service maintainers
- **Windows helper:** desktop platform engineer
- **UI shell updates:** companion-desktop maintainer
- **Safety + audit + runbook:** platform/security owner

---

## Recommended Next Execution Block

Start with **Block 1 (Control Session + Safety Baseline)**.

Reason: it locks in the safety envelope first (TTL, revoke, emergency stop, audit trail). That enables aggressive implementation of helper/control features in later blocks without violating user-approved full-control policy.
