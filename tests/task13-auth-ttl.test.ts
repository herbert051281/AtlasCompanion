import test from 'node:test';
import assert from 'node:assert/strict';
import { startService } from '../apps/companion-service/src/server.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('mutating APIs reject missing auth and enforce token TTL', async () => {
  const { server, port } = await startService({ authTtlMs: 30 });

  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'read_status', riskLevel: 'low' }),
    });
    assert.equal(unauthorized.status, 401);

    const session = await fetch(`http://127.0.0.1:${port}/session/token`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });
    assert.equal(session.status, 201);
    const { token } = (await session.json()) as { token: string };

    const authorized = await fetch(`http://127.0.0.1:${port}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'read_status', riskLevel: 'low' }),
    });
    assert.equal(authorized.status, 201);

    await sleep(40);

    const expired = await fetch(`http://127.0.0.1:${port}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'read_status', riskLevel: 'low' }),
    });
    assert.equal(expired.status, 401);
  } finally {
    server.close();
  }
});
