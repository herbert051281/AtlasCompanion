#!/usr/bin/env node

/**
 * Simple HTTP server for Atlas Companion
 * Listens on http://127.0.0.1:9999
 */

import { createServer } from 'node:http';

const PORT = 9999;
const HOST = '127.0.0.1';

// AutoHotkey path for Windows
const AUTOHOTKEY_PATH = 'C:\\Program Files\\AutoHotkey\\AutoHotkey64.exe';

console.log('Starting Atlas Companion Service...');

const server = createServer((req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // Health check
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Atlas Companion Service running' }));
    return;
  }

  // Execute primitive
  if (req.url === '/execute-primitive' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log(`Executing primitive: ${data.primitive}`, data.params);
        
        // Execute AutoHotkey script for mouse movement
        if (data.primitive === 'mouse.move' && data.params?.x && data.params?.y) {
          const { execFile } = await import('node:child_process');
          const ahkScript = `MouseMove(${data.params.x}, ${data.params.y}, 5)`;
          
          execFile(AUTOHOTKEY_PATH, ['-Command', ahkScript], (err, stdout, stderr) => {
            if (err) {
              console.error(`AHK error: ${err.message}`);
              res.writeHead(500, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ code: 1, stdout: '', stderr: err.message }));
            } else {
              console.log(`✓ Moved mouse to ${data.params.x},${data.params.y}`);
              res.writeHead(200, { 'content-type': 'application/json' });
              res.end(JSON.stringify({ code: 0, stdout: 'ok', stderr: '' }));
            }
          });
          return;
        }
        
        // Default: just echo back success
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ 
          code: 0, 
          stdout: `executed ${data.primitive}`,
          stderr: ''
        }));
      } catch (err) {
        console.error('JSON parse error:', err);
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // Execute operation
  if (req.url === '/execute-operation' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => {
      try {
        const data = JSON.parse(body);
        console.log(`Executing operation: ${data.operation}`);
        
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ 
          code: 0,
          stdout: `executed ${data.operation}`,
          stderr: ''
        }));
      } catch (err) {
        console.error('JSON parse error:', err);
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

console.log(`Attempting to listen on ${HOST}:${PORT}...`);

server.on('error', (err: any) => {
  console.error('❌ Server error:', err.message);
  console.error('Error code:', err.code);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`✅ Companion Service started on http://${HOST}:${PORT}`);
  console.log('Ready for commands. Press Ctrl+C to stop.');
});



process.on('SIGINT', () => {
  console.log('\nShutting down gracefully...');
  server.close(() => {
    console.log('Service stopped.');
    process.exit(0);
  });
});

// Remove the premature timeout — the server is working fine
