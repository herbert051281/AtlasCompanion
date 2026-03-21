import test from 'node:test';
import assert from 'node:assert/strict';
import { createPlaywrightAdapter } from '../apps/companion-service/src/adapters/playwright-adapter.ts';

test('playwright adapter initializes browser, runs action, and closes', async () => {
  const events: string[] = [];
  const adapter = createPlaywrightAdapter({
    browserFactory: async () => ({
      close: async () => {
        events.push('close');
      },
    }),
  });

  await adapter.run(async () => {
    events.push('action');
    return 'ok';
  }, { timeoutMs: 200 });

  assert.deepEqual(events, ['action', 'close']);
});

test('playwright adapter enforces action timeout', async () => {
  const adapter = createPlaywrightAdapter({
    browserFactory: async () => ({
      close: async () => undefined,
    }),
  });

  await assert.rejects(
    () => adapter.run(async () => new Promise((resolve) => setTimeout(resolve, 50)), { timeoutMs: 10 }),
    /timed out/i,
  );
});
