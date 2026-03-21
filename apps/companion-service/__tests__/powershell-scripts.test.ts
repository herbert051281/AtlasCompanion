import test from 'node:test';
import assert from 'node:assert/strict';
import { createPowerShellManager } from '../src/powershell-scripts/index.ts';

// Mock executor for cross-platform testing (actual PowerShell only on Windows)
const mockExecutor = async ({ exe, args }: { exe: string; args: string[]; timeout: number }) => {
  const operationArg = args.find((a, i) => args[i - 1] === '-Operation');
  
  if (operationArg === 'window-list') {
    return {
      stdout: JSON.stringify([
        { Name: 'notepad', Id: 1234, MainWindowTitle: 'Untitled - Notepad', Handle: '12345' },
        { Name: 'code', Id: 5678, MainWindowTitle: 'test.ts - Visual Studio Code', Handle: '67890' },
      ]),
      stderr: '',
    };
  }
  
  if (operationArg === 'window-focus') {
    return {
      stdout: JSON.stringify({ success: true, message: 'Focused window' }),
      stderr: '',
    };
  }
  
  if (operationArg === 'app-launch') {
    return {
      stdout: JSON.stringify({ success: true, message: 'Launched app', pid: 9999 }),
      stderr: '',
    };
  }

  return { stdout: '{}', stderr: '' };
};

test('PowerShell Window Manager - should list available window operations', () => {
  const manager = createPowerShellManager({
    scriptsRoot: `${process.cwd()}/apps/companion-service/src/powershell-scripts`,
    executor: mockExecutor,
  });

  const ops = manager.listOperations();
  assert.ok(ops.includes('window.list'), 'should contain window.list');
  assert.ok(ops.includes('window.focus'), 'should contain window.focus');
  assert.ok(ops.includes('app.launch'), 'should contain app.launch');
});

test('PowerShell Window Manager - should list running windows', async () => {
  const manager = createPowerShellManager({
    scriptsRoot: `${process.cwd()}/apps/companion-service/src/powershell-scripts`,
    executor: mockExecutor,
  });

  const result = await manager.execute('window.list', { approved: true });
  assert.equal(result.code, 0, 'should return code 0');
  assert.ok(result.stdout, 'should have output');
  
  const windows = JSON.parse(result.stdout);
  assert.ok(Array.isArray(windows), 'output should be an array');
  assert.ok(windows.length > 0, 'should have at least one window');
  assert.ok(windows[0].Name, 'window should have Name');
  assert.ok(windows[0].Id, 'window should have Id');
});

test('PowerShell Window Manager - should validate operation names', () => {
  const manager = createPowerShellManager({
    scriptsRoot: `${process.cwd()}/apps/companion-service/src/powershell-scripts`,
    executor: mockExecutor,
  });

  assert.throws(
    () => manager.validate('window.invalid', {}),
    /unknown operation/,
    'should throw for invalid operation'
  );
});

test('PowerShell Window Manager - should refuse execution without approval', async () => {
  const manager = createPowerShellManager({
    scriptsRoot: `${process.cwd()}/apps/companion-service/src/powershell-scripts`,
    executor: mockExecutor,
  });

  const result = await manager.execute('window.list', { approved: false });
  assert.equal(result.code, 1, 'should return code 1');
  assert.ok(result.stderr.includes('approval required'), 'should mention approval required');
});
