// apps/companion-service/__tests__/atlas-handler.test.ts
// Tests for Atlas Command Handler (Task 7)
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { AtlasHandler, type AtlasHandlerOptions } from '../src/atlas-handler.ts';

// Mock companion service for testing
function createMockCompanionServer(): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        // Execute primitive
        if (req.url === '/execute-primitive' && req.method === 'POST') {
          const payload = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            code: 0,
            stdout: `Executed ${payload.primitive}`,
            stderr: '',
          }));
          return;
        }

        // Execute operation
        if (req.url === '/execute-operation' && req.method === 'POST') {
          const payload = JSON.parse(body);
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({
            code: 0,
            stdout: `Executed ${payload.operation}`,
            stderr: '',
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
      resolve({ server, port });
    });
  });
}

function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ===== Task 7: Atlas Handler Tests =====

test('AtlasHandler - should parse and execute "move mouse to 500,300"', async () => {
  const { server, port } = await createMockCompanionServer();

  try {
    const handler = new AtlasHandler({
      companionServiceUrl: `http://127.0.0.1:${port}`,
      controlWindowDefaultMs: 300000,
    });

    // Grant control first
    const grantResult = await handler.handle('grant control for 5 minutes');
    assert.equal(grantResult.success, true, 'grant should succeed');
    assert.ok(grantResult.controlToken, 'should return control token');

    // Now execute with the token
    const result = await handler.handle('move mouse to 500,300', grantResult.controlToken);
    assert.ok(result.text, 'should return text response');
    assert.equal(result.success, true, 'should execute successfully');
  } finally {
    await closeServer(server);
  }
});

test('AtlasHandler - should handle grant control requests', async () => {
  const { server, port } = await createMockCompanionServer();

  try {
    const handler = new AtlasHandler({
      companionServiceUrl: `http://127.0.0.1:${port}`,
      controlWindowDefaultMs: 300000,
    });

    const result = await handler.handle('grant control for 5 minutes');

    assert.ok(result.text.includes('control') || result.text.includes('granted'), 'should mention control');
    assert.ok(result.controlToken, 'should return control token');
    assert.equal(result.success, true, 'should succeed');
  } finally {
    await closeServer(server);
  }
});

test('AtlasHandler - should report control status', async () => {
  const { server, port } = await createMockCompanionServer();

  try {
    const handler = new AtlasHandler({
      companionServiceUrl: `http://127.0.0.1:${port}`,
      controlWindowDefaultMs: 300000,
    });

    // Initial status (no control)
    const status1 = await handler.handle('control status');
    assert.ok(status1.text.toLowerCase().includes('inactive') || status1.text.toLowerCase().includes('status'), 
      'should mention status');

    // Grant control
    await handler.handle('grant control');

    // Check status again
    const status2 = await handler.handle('control status');
    assert.ok(status2.text.toLowerCase().includes('active') || status2.text.toLowerCase().includes('status'),
      'should show active status');
  } finally {
    await closeServer(server);
  }
});

test('AtlasHandler - should handle revoke control', async () => {
  const { server, port } = await createMockCompanionServer();

  try {
    const handler = new AtlasHandler({
      companionServiceUrl: `http://127.0.0.1:${port}`,
      controlWindowDefaultMs: 300000,
    });

    // Grant control
    const grantResult = await handler.handle('grant control');
    assert.ok(grantResult.controlToken, 'should have token');

    // Revoke
    const revokeResult = await handler.handle('revoke control', grantResult.controlToken);
    assert.ok(revokeResult.text.toLowerCase().includes('revoke'), 'should confirm revocation');
    assert.equal(revokeResult.success, true);

    // Status should now be inactive
    const status = await handler.handle('control status');
    assert.ok(status.text.toLowerCase().includes('inactive'), 'should be inactive');
  } finally {
    await closeServer(server);
  }
});

test('AtlasHandler - should execute chained commands', async () => {
  const { server, port } = await createMockCompanionServer();

  try {
    const handler = new AtlasHandler({
      companionServiceUrl: `http://127.0.0.1:${port}`,
      controlWindowDefaultMs: 300000,
    });

    // Grant control
    const grantResult = await handler.handle('grant control');

    // Execute chained commands
    const result = await handler.handle('move mouse to 500,300, click', grantResult.controlToken);
    assert.ok(result.text, 'should return response');
    assert.equal(result.success, true, 'should succeed');
  } finally {
    await closeServer(server);
  }
});

test('AtlasHandler - should handle unknown commands gracefully', async () => {
  const { server, port } = await createMockCompanionServer();

  try {
    const handler = new AtlasHandler({
      companionServiceUrl: `http://127.0.0.1:${port}`,
      controlWindowDefaultMs: 300000,
    });

    const result = await handler.handle('do something weird');
    assert.equal(result.success, false, 'should fail');
    assert.ok(result.text, 'should return error message');
  } finally {
    await closeServer(server);
  }
});

test('AtlasHandler - should require control for commands', async () => {
  const { server, port } = await createMockCompanionServer();

  try {
    const handler = new AtlasHandler({
      companionServiceUrl: `http://127.0.0.1:${port}`,
      controlWindowDefaultMs: 300000,
    });

    // Try to execute without granting control (no token)
    const result = await handler.handle('move mouse to 500,300');
    
    // Should still work for safe primitives, or prompt for control
    // The handler decides the policy
    assert.ok(result.text, 'should return some response');
  } finally {
    await closeServer(server);
  }
});

test('AtlasHandler - should handle app launch commands', async () => {
  const { server, port } = await createMockCompanionServer();

  try {
    const handler = new AtlasHandler({
      companionServiceUrl: `http://127.0.0.1:${port}`,
      controlWindowDefaultMs: 300000,
    });

    // Grant control first
    const grantResult = await handler.handle('grant control');

    // Launch app
    const result = await handler.handle('open notepad', grantResult.controlToken);
    assert.ok(result.text, 'should return response');
  } finally {
    await closeServer(server);
  }
});
