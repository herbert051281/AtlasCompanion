import test from 'node:test';
import assert from 'node:assert/strict';
import { startService } from '../apps/companion-service/src/server.ts';

async function issueToken(port: number): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/session/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

test('safe mode blocks ui control actions by default and allows after controlled-ui switch', async () => {
  const { server, port } = await startService();

  try {
    const token = await issueToken(port);

    const blocked = await fetch(`http://127.0.0.1:${port}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'ui_click', riskLevel: 'medium' }),
    });
    assert.equal(blocked.status, 403);

    const modeChange = await fetch(`http://127.0.0.1:${port}/mode`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ mode: 'controlled_ui' }),
    });
    assert.equal(modeChange.status, 200);

    const allowed = await fetch(`http://127.0.0.1:${port}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'ui_click', riskLevel: 'medium' }),
    });
    assert.equal(allowed.status, 202);
  } finally {
    server.close();
  }
});
