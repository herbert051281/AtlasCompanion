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

test('logs export returns ordered audit-friendly payload', async () => {
  const { server, port } = await startService();

  try {
    const token = await issueToken(port);
    await fetch(`http://127.0.0.1:${port}/tasks`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ action: 'read_status', riskLevel: 'low' }),
    });

    const exported = await fetch(`http://127.0.0.1:${port}/logs/export`);
    assert.equal(exported.status, 200);

    const body = (await exported.json()) as {
      generatedAt: number;
      count: number;
      events: Array<{ type: string; timestamp: number }>;
    };

    assert.ok(body.generatedAt > 0);
    assert.ok(body.count >= 1);
    assert.ok(body.events.length >= 1);

    for (let i = 1; i < body.events.length; i += 1) {
      assert.ok(body.events[i].timestamp >= body.events[i - 1].timestamp);
    }
  } finally {
    server.close();
  }
});
