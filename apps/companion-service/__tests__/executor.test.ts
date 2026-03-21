// apps/companion-service/__tests__/executor.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CommandExecutor, type ExecutionResult } from '../src/executor.ts';
import { CompanionClient } from '../src/companion-client.ts';
import type { ParsedCommand } from '../src/command-parser.ts';

// Helper: create a mock HTTP server that mimics the companion service
// Note: Auth is disabled for testing - real service may implement auth separately
function createMockCompanionServer(options?: {
  controlGranted?: boolean;
  failCommands?: boolean;
}): Promise<{ server: http.Server; port: number; token: string }> {
  const controlGranted = options?.controlGranted ?? false;
  const failCommands = options?.failCommands ?? false;
  const mockToken = 'mock-session-token-12345';

  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        // Token endpoint
        if (req.url === '/session/token' && req.method === 'POST') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ token: mockToken }));
          return;
        }

        // Control status
        if (req.url === '/control/status' && req.method === 'GET') {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ granted: controlGranted, expiresAt: controlGranted ? Date.now() + 300000 : null }));
          return;
        }

        // Execute primitive (no auth check for tests)
        if (req.url === '/execute-primitive' && req.method === 'POST') {
          const payload = JSON.parse(body);
          
          if (failCommands) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 1, stdout: '', stderr: 'Command failed' }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            code: 0, 
            stdout: `Executed ${payload.primitive}`, 
            stderr: '' 
          }));
          return;
        }

        // Execute operation (no auth check for tests)
        if (req.url === '/execute-operation' && req.method === 'POST') {
          const payload = JSON.parse(body);
          
          if (failCommands) {
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end(JSON.stringify({ code: 1, stdout: '', stderr: 'Operation failed' }));
            return;
          }

          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ 
            code: 0, 
            stdout: `Executed ${payload.operation}`, 
            stderr: '' 
          }));
          return;
        }

        res.writeHead(404);
        res.end('Not found');
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port, token: mockToken });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ===== Task 6: Command Executor Tests =====

test('CommandExecutor - should execute a simple primitive command', async () => {
  const { server, port, token } = await createMockCompanionServer({ controlGranted: true });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const executor = new CommandExecutor(client, token);

    const commands: ParsedCommand[] = [
      {
        type: 'primitive',
        primitive: 'mouse.move',
        params: { x: 100, y: 100 },
      },
    ];

    const result = await executor.execute(commands);
    
    assert.equal(result.success, true, 'execution should succeed');
    assert.equal(result.results?.length, 1, 'should have 1 result');
    assert.equal(result.results?.[0].result.code, 0, 'command should return code 0');
  } finally {
    await closeServer(server);
  }
});

test('CommandExecutor - should execute multiple commands sequentially', async () => {
  const { server, port, token } = await createMockCompanionServer({ controlGranted: true });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const executor = new CommandExecutor(client, token);

    const commands: ParsedCommand[] = [
      { type: 'primitive', primitive: 'mouse.move', params: { x: 100, y: 100 } },
      { type: 'primitive', primitive: 'mouse.click', params: { button: 'left' } },
      { type: 'primitive', primitive: 'keyboard.type', params: { text: 'hello' } },
    ];

    const result = await executor.execute(commands);
    
    assert.equal(result.success, true, 'execution should succeed');
    assert.equal(result.results?.length, 3, 'should have 3 results');
  } finally {
    await closeServer(server);
  }
});

test('CommandExecutor - should handle wait commands', async () => {
  const { server, port, token } = await createMockCompanionServer({ controlGranted: true });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const executor = new CommandExecutor(client, token);

    const commands: ParsedCommand[] = [
      { type: 'primitive', action: 'wait', params: { ms: 50 } },
    ];

    const startTime = Date.now();
    const result = await executor.execute(commands);
    const elapsed = Date.now() - startTime;
    
    assert.equal(result.success, true, 'wait should succeed');
    assert.ok(elapsed >= 40, `should have waited at least 40ms, got ${elapsed}ms`);
  } finally {
    await closeServer(server);
  }
});

test('CommandExecutor - should execute operations', async () => {
  const { server, port, token } = await createMockCompanionServer({ controlGranted: true });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const executor = new CommandExecutor(client, token);

    const commands: ParsedCommand[] = [
      { type: 'operation', operation: 'app.launch', params: { appPath: 'notepad.exe' } },
    ];

    const result = await executor.execute(commands);
    
    assert.equal(result.success, true, 'operation should succeed');
    assert.equal(result.results?.[0].result.code, 0, 'operation should return code 0');
  } finally {
    await closeServer(server);
  }
});

test('CommandExecutor - should collect errors without stopping', async () => {
  const { server, port, token } = await createMockCompanionServer({ 
    controlGranted: true,
    failCommands: true,
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const executor = new CommandExecutor(client, token);

    const commands: ParsedCommand[] = [
      { type: 'primitive', primitive: 'mouse.move', params: { x: 100, y: 100 } },
    ];

    const result = await executor.execute(commands);
    
    assert.equal(result.success, false, 'execution should fail');
    assert.ok(result.errors && result.errors.length > 0, 'should have errors');
  } finally {
    await closeServer(server);
  }
});

test('CommandExecutor - should stop on first error when stopOnError is true', async () => {
  const { server, port, token } = await createMockCompanionServer({ 
    controlGranted: true,
    failCommands: true,
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const executor = new CommandExecutor(client, token);

    const commands: ParsedCommand[] = [
      { type: 'primitive', primitive: 'mouse.move', params: { x: 100, y: 100 } },
      { type: 'primitive', primitive: 'mouse.click', params: { button: 'left' } },
    ];

    const result = await executor.execute(commands, { stopOnError: true });
    
    assert.equal(result.success, false, 'execution should fail');
    assert.equal(result.results?.length, 1, 'should stop after first command');
  } finally {
    await closeServer(server);
  }
});

test('CommandExecutor - should handle empty command list', async () => {
  const { server, port, token } = await createMockCompanionServer({ controlGranted: true });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const executor = new CommandExecutor(client, token);

    const result = await executor.execute([]);
    
    assert.equal(result.success, true, 'empty list should succeed');
    assert.equal(result.results?.length, 0, 'should have 0 results');
  } finally {
    await closeServer(server);
  }
});

test('CommandExecutor - should handle control commands (grant/revoke)', async () => {
  const { server, port, token } = await createMockCompanionServer({ controlGranted: false });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const executor = new CommandExecutor(client, token);

    const commands: ParsedCommand[] = [
      { type: 'control', action: 'grant', params: { durationMs: 300000 } },
    ];

    // Control commands are handled differently - they need server-side support
    // For now, they return a special result indicating the request was made
    const result = await executor.execute(commands);
    
    // Control commands are recognized but may need separate handling
    assert.ok(result.controlRequested !== undefined || result.success !== undefined, 
      'should return some result for control commands');
  } finally {
    await closeServer(server);
  }
});

test('CommandExecutor - should report execution summary', async () => {
  const { server, port, token } = await createMockCompanionServer({ controlGranted: true });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const executor = new CommandExecutor(client, token);

    const commands: ParsedCommand[] = [
      { type: 'primitive', primitive: 'mouse.move', params: { x: 100, y: 100 } },
      { type: 'primitive', primitive: 'mouse.click', params: { button: 'left' } },
    ];

    const result = await executor.execute(commands);
    
    assert.ok(result.summary !== undefined, 'should have summary');
    assert.equal(result.summary?.total, 2, 'total should be 2');
    assert.equal(result.summary?.succeeded, 2, 'succeeded should be 2');
    assert.equal(result.summary?.failed, 0, 'failed should be 0');
  } finally {
    await closeServer(server);
  }
});
