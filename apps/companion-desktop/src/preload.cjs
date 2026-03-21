const { contextBridge } = require('electron');

const arg = process.argv.find((value) => value.startsWith('--companion-port='));
const port = arg ? Number(arg.split('=')[1]) : null;
const baseUrl = `http://127.0.0.1:${port || 0}`;

let token = null;

async function ensureToken() {
  if (token) return token;
  const res = await fetch(`${baseUrl}/session/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  if (!res.ok) throw new Error('failed_to_issue_token');
  const body = await res.json();
  token = body.token;
  return token;
}

async function getJson(path, init = {}) {
  const res = await fetch(`${baseUrl}${path}`, init);
  const data = await res.json();
  return { ok: res.ok, status: res.status, data };
}

async function postJson(path, payload, auth = false) {
  const headers = { 'content-type': 'application/json' };
  if (auth) {
    const sessionToken = await ensureToken();
    headers.authorization = `Bearer ${sessionToken}`;
  }
  return getJson(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload ?? {}),
  });
}

contextBridge.exposeInMainWorld('companionApi', {
  baseUrl,
  health: () => getJson('/health'),
  status: () => getJson('/status'),
  tasks: () => getJson('/tasks'),
  logs: () => getJson('/logs/export'),
  createTask: (action, riskLevel = 'low') => postJson('/tasks', { action, riskLevel }, true),
  approveTask: (id) => postJson(`/tasks/${id}/approve`, {}, true),
  startTask: (id, durationMs = 2500) => postJson(`/tasks/${id}/start`, { durationMs }, true),
  panicStop: () => postJson('/panic-stop', {}, true),
});
