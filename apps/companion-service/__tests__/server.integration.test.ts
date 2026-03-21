import test from 'node:test';
import assert from 'node:assert/strict';
import { startService } from '../src/server.ts';

// Mock executor for cross-platform testing
const mockPsExecutor = async ({ exe, args }: { exe: string; args: string[]; timeout: number }) => {
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

// ===== Task 8: Server Integration with PowerShell Operations =====

test('Server integration - should execute window.list via POST /execute-operation', async () => {
  const { server, port } = await startService({ port: 0, psExecutor: mockPsExecutor });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    // Get auth token first
    const tokenRes = await fetch(`${baseUrl}/session/token`, { method: 'POST' });
    const { token } = await tokenRes.json() as { token: string };

    const response = await fetch(`${baseUrl}/execute-operation`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ operation: 'window.list' }),
    });

    const result = await response.json() as { code: number; stdout: string };
    assert.equal(response.status, 200, 'should return 200 OK');
    assert.equal(result.code, 0, 'should execute successfully');
    
    // Verify the output contains window data
    const windows = JSON.parse(result.stdout);
    assert.ok(Array.isArray(windows), 'should return array of windows');
  } finally {
    server.close();
  }
});

test('Server integration - should launch app via POST /execute-operation', async () => {
  const { server, port } = await startService({ port: 0, psExecutor: mockPsExecutor });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const tokenRes = await fetch(`${baseUrl}/session/token`, { method: 'POST' });
    const { token } = await tokenRes.json() as { token: string };

    const response = await fetch(`${baseUrl}/execute-operation`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        operation: 'app.launch',
        params: { appPath: 'notepad.exe' },
      }),
    });

    const result = await response.json() as { code: number; stdout: string };
    assert.equal(response.status, 200, 'should return 200 OK');
    assert.equal(result.code, 0, 'should execute successfully');
    
    const output = JSON.parse(result.stdout);
    assert.equal(output.success, true, 'should report success');
    assert.ok(output.pid, 'should return PID');
  } finally {
    server.close();
  }
});

test('Server integration - should reject unknown operations', async () => {
  const { server, port } = await startService({ port: 0, psExecutor: mockPsExecutor });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const tokenRes = await fetch(`${baseUrl}/session/token`, { method: 'POST' });
    const { token } = await tokenRes.json() as { token: string };

    const response = await fetch(`${baseUrl}/execute-operation`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ operation: 'invalid.operation' }),
    });

    assert.equal(response.status, 400, 'should return 400 Bad Request');
    const result = await response.json() as { error: string };
    assert.ok(result.error?.includes('unknown operation'), 'should mention unknown operation');
  } finally {
    server.close();
  }
});

test('Server integration - should require auth for execute-operation', async () => {
  const { server, port } = await startService({ port: 0, psExecutor: mockPsExecutor });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const response = await fetch(`${baseUrl}/execute-operation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'window.list' }),
    });

    assert.equal(response.status, 401, 'should return 401 Unauthorized');
  } finally {
    server.close();
  }
});

test('Server integration - should require operation parameter', async () => {
  const { server, port } = await startService({ port: 0, psExecutor: mockPsExecutor });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const tokenRes = await fetch(`${baseUrl}/session/token`, { method: 'POST' });
    const { token } = await tokenRes.json() as { token: string };

    const response = await fetch(`${baseUrl}/execute-operation`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({}),
    });

    assert.equal(response.status, 400, 'should return 400 Bad Request');
    const result = await response.json() as { error: string };
    assert.ok(result.error?.includes('missing operation'), 'should mention missing operation');
  } finally {
    server.close();
  }
});

test('Server integration - should validate required params for focus operation', async () => {
  const { server, port } = await startService({ port: 0, psExecutor: mockPsExecutor });
  const baseUrl = `http://127.0.0.1:${port}`;

  try {
    const tokenRes = await fetch(`${baseUrl}/session/token`, { method: 'POST' });
    const { token } = await tokenRes.json() as { token: string };

    const response = await fetch(`${baseUrl}/execute-operation`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        operation: 'window.focus',
        params: {}, // Missing windowTitle
      }),
    });

    assert.equal(response.status, 400, 'should return 400 Bad Request');
    const result = await response.json() as { error: string };
    assert.ok(result.error?.includes('missing required parameter'), 'should mention missing parameter');
  } finally {
    server.close();
  }
});
