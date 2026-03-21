// apps/companion-service/__tests__/companion-client.test.ts
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { CompanionClient } from '../src/companion-client.ts';

// Helper: create a mock HTTP server
function createMockServer(handler: (req: http.IncomingMessage, res: http.ServerResponse) => void): Promise<{ server: http.Server; port: number }> {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : 0;
      resolve({ server, port });
    });
  });
}

// Helper: close server
function closeServer(server: http.Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}

// ===== Task 5: HTTP Client with Retry Logic =====

test('CompanionClient - should execute primitive and return result', async () => {
  const { server, port } = await createMockServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/execute-primitive' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, stdout: 'ok', stderr: '' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const result = await client.executePrimitive('mouse.move', { x: 100, y: 100 }, true);
    
    assert.equal(result.code, 0, 'code should be 0');
    assert.equal(result.stdout, 'ok', 'stdout should be "ok"');
  } finally {
    await closeServer(server);
  }
});

test('CompanionClient - should execute operation and return result', async () => {
  const { server, port } = await createMockServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/execute-operation' && req.method === 'POST') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ code: 0, stdout: 'operation ok', stderr: '' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const result = await client.executeOperation('app.launch', { appPath: 'notepad.exe' }, true);
    
    assert.equal(result.code, 0, 'code should be 0');
    assert.equal(result.stdout, 'operation ok', 'stdout should be "operation ok"');
  } finally {
    await closeServer(server);
  }
});

test('CompanionClient - should list primitives', async () => {
  const { server, port } = await createMockServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/list-primitives') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ primitives: ['mouse.move', 'mouse.click', 'keyboard.type'] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const primitives = await client.listPrimitives();
    
    assert.ok(primitives.includes('mouse.move'), 'should contain mouse.move');
    assert.ok(primitives.includes('keyboard.type'), 'should contain keyboard.type');
  } finally {
    await closeServer(server);
  }
});

test('CompanionClient - should list operations', async () => {
  const { server, port } = await createMockServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      if (req.url === '/list-operations') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ operations: ['app.launch', 'window.focus', 'window.list'] }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    const operations = await client.listOperations();
    
    assert.ok(operations.includes('app.launch'), 'should contain app.launch');
    assert.ok(operations.includes('window.focus'), 'should contain window.focus');
  } finally {
    await closeServer(server);
  }
});

test('CompanionClient - should timeout if service is slow', async () => {
  const { server, port } = await createMockServer((req, res) => {
    // Never respond - let it hang
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`, { timeout: 100 });
    
    await assert.rejects(
      async () => client.executePrimitive('slow-command', {}, true),
      /timeout/i,
      'should throw timeout error'
    );
  } finally {
    await closeServer(server);
  }
});

test('CompanionClient - should retry on transient failures', async () => {
  let attempts = 0;
  const { server, port } = await createMockServer((req, res) => {
    attempts++;
    if (attempts < 3) {
      res.writeHead(500);
      res.end('error');
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 0, stdout: 'ok', stderr: '' }));
    }
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`, { retries: 5 });
    const result = await client.executePrimitive('mouse.move', { x: 100, y: 100 }, true);
    
    assert.equal(result.code, 0, 'should eventually succeed');
    assert.equal(attempts, 3, 'should have made 3 attempts');
  } finally {
    await closeServer(server);
  }
});

test('CompanionClient - should fail after max retries exceeded', async () => {
  const { server, port } = await createMockServer((req, res) => {
    res.writeHead(500);
    res.end('always fails');
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`, { retries: 2 });
    
    await assert.rejects(
      async () => client.executePrimitive('fail', {}, true),
      /500|failed|error/i,
      'should throw error after retries exhausted'
    );
  } finally {
    await closeServer(server);
  }
});

test('CompanionClient - should send correct request body', async () => {
  let receivedBody: any = null;
  const { server, port } = await createMockServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      receivedBody = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 0, stdout: 'ok', stderr: '' }));
    });
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`);
    await client.executePrimitive('mouse.move', { x: 500, y: 300 }, true);
    
    assert.equal(receivedBody.primitive, 'mouse.move', 'primitive should be correct');
    assert.deepEqual(receivedBody.params, { x: 500, y: 300 }, 'params should be correct');
    assert.equal(receivedBody.approved, true, 'approved flag should be sent');
  } finally {
    await closeServer(server);
  }
});

test('CompanionClient - should use exponential backoff for retries', async () => {
  const timestamps: number[] = [];
  let attempts = 0;
  
  const { server, port } = await createMockServer((req, res) => {
    timestamps.push(Date.now());
    attempts++;
    if (attempts < 3) {
      res.writeHead(500);
      res.end('error');
    } else {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ code: 0, stdout: 'ok', stderr: '' }));
    }
  });

  try {
    const client = new CompanionClient(`http://127.0.0.1:${port}`, { retries: 5 });
    await client.executePrimitive('test', {}, true);
    
    // Check that delays increase (exponential backoff)
    if (timestamps.length >= 3) {
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      // Second delay should be >= first delay (exponential backoff)
      assert.ok(delay2 >= delay1 * 0.8, `delay2 (${delay2}ms) should be >= delay1 (${delay1}ms)`);
    }
  } finally {
    await closeServer(server);
  }
});
