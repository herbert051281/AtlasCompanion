import test from 'node:test';
import assert from 'node:assert/strict';
import { startService } from '../apps/companion-service/src/server.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function issueToken(port: number): Promise<string> {
  const session = await fetch(`http://127.0.0.1:${port}/session/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({}),
  });
  assert.equal(session.status, 201);
  const { token } = (await session.json()) as { token: string };
  return token;
}

test('POST /control/grant requires auth', async () => {
  const { server, port } = await startService();

  try {
    const unauthorized = await fetch(`http://127.0.0.1:${port}/control/grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    });

    assert.equal(unauthorized.status, 401);
  } finally {
    server.close();
  }
});

test('control grant sets status true with expiry and logs audit event', async () => {
  const { server, port } = await startService();

  try {
    const token = await issueToken(port);
    const grant = await fetch(`http://127.0.0.1:${port}/control/grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ttlMs: 500 }),
    });

    assert.equal(grant.status, 200);
    const granted = (await grant.json()) as { controlGranted: boolean; controlExpiresAt: number | null };
    assert.equal(granted.controlGranted, true);
    assert.ok(typeof granted.controlExpiresAt === 'number');

    const status = await fetch(`http://127.0.0.1:${port}/control/status`);
    assert.equal(status.status, 200);
    const body = (await status.json()) as { controlGranted: boolean; controlExpiresAt: number | null };
    assert.equal(body.controlGranted, true);
    assert.ok(typeof body.controlExpiresAt === 'number');

    const logs = await fetch(`http://127.0.0.1:${port}/logs/export`);
    const events = (await logs.json()) as { events: Array<{ type: string }> };
    assert.ok(events.events.some((event) => event.type === 'control.granted'));
  } finally {
    server.close();
  }
});

test('control grant expires and status returns not granted', async () => {
  const { server, port } = await startService();

  try {
    const token = await issueToken(port);
    const grant = await fetch(`http://127.0.0.1:${port}/control/grant`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ ttlMs: 25 }),
    });

    assert.equal(grant.status, 200);
    await sleep(40);

    const status = await fetch(`http://127.0.0.1:${port}/control/status`);
    assert.equal(status.status, 200);
    const body = (await status.json()) as { controlGranted: boolean; controlExpiresAt: number | null };
    assert.equal(body.controlGranted, false);
    assert.equal(body.controlExpiresAt, null);
  } finally {
    server.close();
  }
});
