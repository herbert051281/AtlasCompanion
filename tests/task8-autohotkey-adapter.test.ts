import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { createAutoHotkeyAdapter } from '../apps/companion-service/src/adapters/autohotkey-adapter.ts';

const scriptsRoot = '/tmp/skillmaster-ahk';

test('autohotkey adapter denies unapproved UI action', async () => {
  const adapter = createAutoHotkeyAdapter({ scriptsRoot });

  await assert.rejects(
    () => adapter.execute({ scriptPath: path.join(scriptsRoot, 'click.ahk'), approved: false }),
    /approval required/i,
  );
});

test('autohotkey adapter validates script path constraints', async () => {
  const adapter = createAutoHotkeyAdapter({ scriptsRoot });

  await assert.rejects(
    () => adapter.execute({ scriptPath: '/etc/passwd', approved: true }),
    /outside allowed root/i,
  );

  await assert.rejects(
    () => adapter.execute({ scriptPath: path.join(scriptsRoot, 'click.ps1'), approved: true }),
    /must end with \.ahk/i,
  );
});

test('autohotkey adapter runs approved vetted script', async () => {
  const runs: string[] = [];
  const adapter = createAutoHotkeyAdapter({
    scriptsRoot,
    runner: async ({ scriptPath }) => {
      runs.push(scriptPath);
      return { code: 0, stdout: 'done', stderr: '' };
    },
  });

  const scriptPath = path.join(scriptsRoot, 'click.ahk');
  const result = await adapter.execute({ scriptPath, approved: true });

  assert.equal(result.code, 0);
  assert.deepEqual(runs, [scriptPath]);
});
