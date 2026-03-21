# Skillmaster Companion MVP Operator Runbook

## Safety Defaults
- Service binds to `127.0.0.1` only.
- Execution mode defaults to `safe`.
- Mutating endpoints require bearer session token.
- Session TTL defaults to 30 minutes.

## Start Service
Use the existing test harness or your app launcher to run `startService()`.

## Issue Session Token
```http
POST /session/token
```
Response includes `token`, `expiresAt`, `ttlMs`.

Use header on mutating APIs:
```http
Authorization: Bearer <token>
```

## Core Operational Endpoints
- `GET /health` – liveness
- `GET /status` – mode + panic state + queue/pending counts
- `GET /tasks` – queue/task visibility
- `GET /tasks/:id` – task detail
- `GET /logs/export` – ordered audit export

Mutating (auth required):
- `POST /tasks`
- `POST /tasks/:id/approve`
- `POST /tasks/:id/deny`
- `POST /tasks/:id/start`
- `POST /panic-stop`
- `POST /mode`

## STOP Procedure
1. Press UI **STOP NOW** button (wired to `POST /panic-stop`), or call endpoint directly.
2. Confirm response `200 {"status":"stopped"}`.
3. Verify blocked execution by trying a new `POST /tasks` (expect `423 panic_stopped`).
4. Export logs with `GET /logs/export` for incident review.

## Audit Export
`GET /logs/export` returns:
- `generatedAt`
- `count`
- `events[]` in ascending timestamp order

Use export for run review and postmortems.

## Mode Control
- Default `safe`: blocks `ui_` and `ahk_` task actions.
- Switch for approved UI workflows:
```http
POST /mode
{"mode":"controlled_ui"}
```
