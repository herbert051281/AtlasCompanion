import test from 'node:test';
import assert from 'node:assert/strict';
import { startService } from '../apps/companion-service/src/server.ts';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

test('service binds localhost only and serves /health', async () => {
  const { server, port, host } = await startService({ port: 0, host: '127.0.0.1' });

  try {
    assert.equal(host, '127.0.0.1');

    const address = server.address();
    assert.ok(address && typeof address !== 'string');
    assert.equal(address.address, '127.0.0.1');

    const response = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(response.status, 200);
    const body = (await response.json()) as { status: string };
    assert.equal(body.status, 'healthy');
  } finally {
    server.close();
    await wait(5);
  }
});

test('service rejects non-localhost bind requests', async () => {
  await assert.rejects(
    () => startService({ port: 0, host: '0.0.0.0' }),
    /localhost only/i,
  );
});
