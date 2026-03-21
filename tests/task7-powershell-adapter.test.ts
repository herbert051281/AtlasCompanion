import test from 'node:test';
import assert from 'node:assert/strict';
import { createPowerShellAdapter } from '../apps/companion-service/src/adapters/powershell-adapter.ts';

test('powershell adapter executes allowlisted command template with timeout', async () => {
  const calls: Array<{ command: string; timeoutMs: number }> = [];
  const adapter = createPowerShellAdapter({
    allowlist: {
      read_status: 'Get-Date',
    },
    executor: async ({ command, timeoutMs }) => {
      calls.push({ command, timeoutMs });
      return { code: 0, stdout: 'ok', stderr: '' };
    },
  });

  const result = await adapter.execute({ action: 'read_status', timeoutMs: 1_500 });

  assert.equal(result.code, 0);
  assert.equal(calls.length, 1);
  assert.equal(calls[0]?.command, 'Get-Date');
  assert.equal(calls[0]?.timeoutMs, 1_500);
});

test('powershell adapter blocks non-allowlisted actions', async () => {
  const adapter = createPowerShellAdapter({ allowlist: { read_status: 'Get-Date' } });

  await assert.rejects(() => adapter.execute({ action: 'format_disk' }), /blocked by allowlist/i);
});
