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

// ===== Task 6: Window Listing & Focusing Integration Tests =====

test('Window operations - should list all open windows with titles and PIDs', async () => {
  const manager = createPowerShellManager({
    scriptsRoot: `${process.cwd()}/apps/companion-service/src/powershell-scripts`,
    executor: mockExecutor,
  });

  const result = await manager.execute('window.list', { approved: true });
  assert.equal(result.code, 0, 'should succeed');
  
  const windows = JSON.parse(result.stdout);
  assert.ok(Array.isArray(windows), 'should return array of windows');
  
  if (windows.length > 0) {
    const win = windows[0];
    assert.ok('Name' in win, 'window should have Name property');
    assert.ok('Id' in win, 'window should have Id property');
    assert.ok('MainWindowTitle' in win, 'window should have MainWindowTitle property');
    assert.ok('Handle' in win, 'window should have Handle property');
  }
});

test('Window operations - should focus window by title', async () => {
  const executorCalls: Array<{ exe: string; args: string[] }> = [];
  
  const trackingExecutor = async ({ exe, args, timeout }: { exe: string; args: string[]; timeout: number }) => {
    executorCalls.push({ exe, args });
    return {
      stdout: JSON.stringify({ success: true, message: 'Focused window: Notepad' }),
      stderr: '',
    };
  };

  const manager = createPowerShellManager({
    scriptsRoot: `${process.cwd()}/apps/companion-service/src/powershell-scripts`,
    executor: trackingExecutor,
  });

  const result = await manager.execute('window.focus', {
    windowTitle: 'Notepad',
    approved: true,
  });

  assert.equal(result.code, 0, 'should succeed');
  
  const response = JSON.parse(result.stdout);
  assert.equal(response.success, true, 'should report success');
  
  // Verify the correct operation was called
  const operationArg = executorCalls[0]?.args.find((a, i, arr) => arr[i - 1] === '-Operation');
  assert.equal(operationArg, 'window-focus', 'should call window-focus operation');
  
  // Verify params were passed
  const paramsArg = executorCalls[0]?.args.find((a, i, arr) => arr[i - 1] === '-Params');
  const parsedParams = JSON.parse(paramsArg ?? '{}');
  assert.equal(parsedParams.windowTitle, 'Notepad', 'should pass windowTitle parameter');
});

test('Window operations - should validate required parameters for focus', () => {
  const manager = createPowerShellManager({
    scriptsRoot: `${process.cwd()}/apps/companion-service/src/powershell-scripts`,
    executor: mockExecutor,
  });

  assert.throws(
    () => manager.validate('window.focus', {}),
    /missing required parameter: windowTitle/,
    'should require windowTitle parameter'
  );
});

test('Window operations - should handle window not found gracefully', async () => {
  const notFoundExecutor = async () => ({
    stdout: JSON.stringify({ success: false, error: "Window 'NonExistent' not found" }),
    stderr: '',
  });

  const manager = createPowerShellManager({
    scriptsRoot: `${process.cwd()}/apps/companion-service/src/powershell-scripts`,
    executor: notFoundExecutor,
  });

  const result = await manager.execute('window.focus', {
    windowTitle: 'NonExistent',
    approved: true,
  });

  assert.equal(result.code, 0, 'should return code 0 (PowerShell executed successfully)');
  const response = JSON.parse(result.stdout);
  assert.equal(response.success, false, 'should report failure in response');
  assert.ok(response.error?.includes('not found'), 'should indicate window not found');
});
