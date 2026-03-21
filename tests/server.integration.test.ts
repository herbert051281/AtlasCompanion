import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';

// Helper to make HTTP requests
async function makeRequest(
  port: number,
  method: string,
  path: string,
  body?: object
): Promise<{ status: number; data: unknown }> {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port,
      path,
      method,
      headers: {
        'Content-Type': 'application/json',
      },
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode ?? 500,
            data: data ? JSON.parse(data) : null,
          });
        } catch {
          resolve({ status: res.statusCode ?? 500, data });
        }
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

// Dynamic import of server to avoid issues
let startCompanionService: (opts: { port: number }) => Promise<{ server: http.Server; close: () => void }>;

test('Server integration setup', async () => {
  // Import the server module
  const serverModule = await import('../apps/companion-service/src/server.ts');
  startCompanionService = serverModule.startCompanionService;
  assert.ok(startCompanionService, 'startCompanionService should be exported');
});

test('Server integration - POST /execute-primitive executes mouse.move', async (t) => {
  if (!startCompanionService) {
    t.skip('Server not loaded');
    return;
  }

  const handle = await startCompanionService({ port: 19999 });

  try {
    const { status, data } = await makeRequest(19999, 'POST', '/execute-primitive', {
      primitive: 'mouse.move',
      params: { x: 500, y: 300, approved: true },
    });

    assert.equal(status, 200, 'should return 200');
    assert.equal((data as { code: number }).code, 0, 'should succeed');
  } finally {
    handle.close();
  }
});

test('Server integration - POST /execute-primitive requires approval', async (t) => {
  if (!startCompanionService) {
    t.skip('Server not loaded');
    return;
  }

  const handle = await startCompanionService({ port: 19998 });

  try {
    const { status, data } = await makeRequest(19998, 'POST', '/execute-primitive', {
      primitive: 'mouse.click',
      params: { button: 'left', x: 500, y: 300, approved: false },
    });

    assert.equal(status, 403, 'should return 403 for unapproved');
    assert.ok(
      ((data as { error: string }).error ?? '').toLowerCase().includes('approval'),
      'error should mention approval'
    );
  } finally {
    handle.close();
  }
});

test('Server integration - POST /execute-primitive validates params', async (t) => {
  if (!startCompanionService) {
    t.skip('Server not loaded');
    return;
  }

  const handle = await startCompanionService({ port: 19997 });

  try {
    const { status, data } = await makeRequest(19997, 'POST', '/execute-primitive', {
      primitive: 'mouse.move',
      params: { x: -1, y: 100, approved: true }, // Invalid negative coordinate
    });

    assert.equal(status, 400, 'should return 400 for invalid params');
    assert.ok(
      ((data as { error: string }).error ?? '').toLowerCase().includes('invalid'),
      'error should mention invalid'
    );
  } finally {
    handle.close();
  }
});

test('Server integration - POST /execute-primitive returns 400 for missing primitive', async (t) => {
  if (!startCompanionService) {
    t.skip('Server not loaded');
    return;
  }

  const handle = await startCompanionService({ port: 19996 });

  try {
    const { status, data } = await makeRequest(19996, 'POST', '/execute-primitive', {
      params: { x: 100, y: 100, approved: true },
    });

    assert.equal(status, 400, 'should return 400');
    assert.ok(
      ((data as { error: string }).error ?? '').includes('primitive'),
      'error should mention primitive'
    );
  } finally {
    handle.close();
  }
});

test('Server integration - POST /execute-primitive supports keyboard.type', async (t) => {
  if (!startCompanionService) {
    t.skip('Server not loaded');
    return;
  }

  const handle = await startCompanionService({ port: 19995 });

  try {
    const { status, data } = await makeRequest(19995, 'POST', '/execute-primitive', {
      primitive: 'keyboard.type',
      params: { text: 'hello world', approved: true },
    });

    assert.equal(status, 200, 'should return 200');
    assert.equal((data as { code: number }).code, 0, 'should succeed');
  } finally {
    handle.close();
  }
});
