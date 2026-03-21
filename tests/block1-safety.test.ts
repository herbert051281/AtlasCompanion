import test from 'node:test';
import assert from 'node:assert/strict';
import { startService } from '../apps/companion-service/src/server.ts';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function issueToken(port: number): Promise<string> {
  const res = await fetch(`http://127.0.0.1:${port}/session/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: '{}',
  });
  const body = (await res.json()) as { token: string };
  return body.token;
}

test('Block 1 Safety Baseline: control revocation and deadman timeout', async (t) => {
  const { server, port } = await startService();

  try {
    const token = await issueToken(port);

    await t.test('POST /control/revoke revokes granted control', async () => {
      // Grant control
      await fetch(`http://127.0.0.1:${port}/control/grant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ ttlMs: 60000 }),
      });

      const status1 = await (await fetch(`http://127.0.0.1:${port}/control/status`)).json();
      assert.strictEqual(status1.controlGranted, true);

      // Revoke control
      const revoke = await fetch(`http://127.0.0.1:${port}/control/revoke`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}` },
      });
      assert.strictEqual(revoke.status, 200);

      const status2 = await (await fetch(`http://127.0.0.1:${port}/control/status`)).json();
      assert.strictEqual(status2.controlGranted, false);
      assert.strictEqual(status2.controlExpiresAt, null);
    });

    await t.test('deadman timeout revokes control automatically', async () => {
      // Grant control with very short TTL
      const ttlMs = 100;
      await fetch(`http://127.0.0.1:${port}/control/grant`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ ttlMs }),
      });

      const status1 = await (await fetch(`http://127.0.0.1:${port}/control/status`)).json();
      assert.strictEqual(status1.controlGranted, true);

      // Wait for expiry
      await sleep(ttlMs + 50);

      const status2 = await (await fetch(`http://127.0.0.1:${port}/control/status`)).json();
      assert.strictEqual(status2.controlGranted, false);
    });

    await t.test('audit log contains control lifecycle events', async () => {
        const res = await fetch(`http://127.0.0.1:${port}/logs/export`);
        const body = await res.json();
        const eventTypes = body.events.map((e: any) => e.type);
        
        assert.ok(eventTypes.includes('control.granted'), 'missing control.granted event');
        assert.ok(eventTypes.includes('control.revoked'), 'missing control.revoked event');
    });

  } finally {
    server.close();
    await sleep(5);
  }
});

test('Block 1 Safety Baseline: kill hotkey signal triggers panic stop', async () => {
  const { server, port } = await startService();

  try {
    const token = await issueToken(port);

    // Trigger panic stop via hotkey-simulated endpoint (internal signal path)
    // In this block, we ensure the service has a path to receive this signal.
    // For TDD, we'll assume a POST /internal/hotkey-panic exists for the desktop app to call.
    const panic = await fetch(`http://127.0.0.1:${port}/internal/hotkey-panic`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}` }
    });
    assert.strictEqual(panic.status, 200);

    const status = await (await fetch(`http://127.0.0.1:${port}/status`)).json();
    assert.strictEqual(status.panicStopped, true);

    const logs = await (await fetch(`http://127.0.0.1:${port}/logs/export`)).json();
    assert.ok(logs.events.some((e: any) => e.type === 'panic.hotkey'), 'missing panic.hotkey event');

  } finally {
    server.close();
    await sleep(5);
  }
});
