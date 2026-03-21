import test from 'node:test';
import assert from 'node:assert/strict';
import { createStopHandler } from '../apps/companion-ui/src/stop-control.ts';

test('stop handler calls panic endpoint with bearer token', async () => {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const fakeFetch: typeof fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), init });
    return new Response(JSON.stringify({ status: 'stopped' }), { status: 200 });
  }) as typeof fetch;

  const stop = createStopHandler({
    baseUrl: 'http://127.0.0.1:9999',
    getToken: () => 'session-token',
    fetchImpl: fakeFetch,
  });

  const result = await stop();
  assert.equal(result.status, 200);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'http://127.0.0.1:9999/panic-stop');
  assert.equal(calls[0].init?.method, 'POST');
  assert.equal((calls[0].init?.headers as Record<string, string>).authorization, 'Bearer session-token');
});
