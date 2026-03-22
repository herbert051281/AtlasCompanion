#!/usr/bin/env node

/**
 * Simple HTTP server for Atlas Companion
 * Listens on http://127.0.0.1:9999
 */

import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 9999;
const HOST = '127.0.0.1';

// AutoHotkey path for Windows
const AUTOHOTKEY_PATH = 'C:\\Program Files\\AutoHotkey\\AutoHotkey64.exe';

// Get script directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const SCRIPTS_DIR = join(__dirname, '../scripts');

const execFileAsync = promisify(execFile);

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
        console.log(`[${new Date().toISOString()}] Executing: ${data.primitive}`, data.params);
        
        let result = { code: 0, stdout: '', stderr: '' };
        
        // Mouse movement
        if (data.primitive === 'mouse.move' && data.params?.x && data.params?.y) {
          try {
            const args = [String(data.params.x), String(data.params.y)];
            if (data.params.speed) args.push(String(data.params.speed));
            
            await execFileAsync(AUTOHOTKEY_PATH, [join(SCRIPTS_DIR, 'mouse-move.ahk'), ...args], { timeout: 5000 });
            result.stdout = `Moved mouse to ${data.params.x},${data.params.y}`;
            console.log(`✓ ${result.stdout}`);
          } catch (err: any) {
            result.code = 1;
            result.stderr = err.message;
            console.error(`✗ Mouse move failed: ${err.message}`);
          }
        }
        // Mouse click
        else if (data.primitive === 'mouse.click' && data.params) {
          try {
            const x = data.params.x ? String(data.params.x) : '';
            const y = data.params.y ? String(data.params.y) : '';
            const button = data.params.button || 'left';
            const count = data.params.clickCount || 1;
            
            const args = [x, y, button, String(count)];
            await execFileAsync(AUTOHOTKEY_PATH, [join(SCRIPTS_DIR, 'mouse-click.ahk'), ...args], { timeout: 5000 });
            result.stdout = `Clicked ${button} button at ${x || 'current'},${y || 'current'}`;
            console.log(`✓ ${result.stdout}`);
          } catch (err: any) {
            result.code = 1;
            result.stderr = err.message;
            console.error(`✗ Mouse click failed: ${err.message}`);
          }
        }
        // Default fallback
        else {
          result.stdout = `Primitive ${data.primitive} not yet implemented`;
        }
        
        res.writeHead(result.code === 0 ? 200 : 500, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
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
