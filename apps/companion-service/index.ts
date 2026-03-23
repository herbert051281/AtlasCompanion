#!/usr/bin/env node

/**
 * Simple HTTP server for Atlas Companion
 * Listens on http://127.0.0.1:9999
 */

import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { handleScreenshot } from '../../../src/screenshot-handler.ts';
import { handleScreenshotRequest } from '../../../src/screenshot-request-handler.ts';

const PORT = 9999;
const HOST = '127.0.0.1';

const execAsync = promisify(exec);

console.log('Starting Atlas Companion Service...');

const server = createServer(async (req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // Health check
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Atlas Companion Service running' }));
    return;
  }

  // Screenshot capture endpoint
  if (req.url === '/screenshot' && req.method === 'GET') {
    try {
      const result = await handleScreenshot();
      res.writeHead(result.success ? 200 : 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message, timestamp: new Date().toISOString() }));
    }
    return;
  }

  // Screenshot request endpoint (POST)
  if (req.url === '/request-screenshot' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk; });
    req.on('end', async () => {
      try {
        let options = {};
        if (body) {
          try { options = JSON.parse(body); } catch (e) {}
        }
        const result = await handleScreenshotRequest(options);
        res.writeHead(result.success ? 200 : 500, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ success: false, error: err.message, timestamp: new Date().toISOString() }));
      }
    });
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
        
        // Mouse movement using PowerShell
        if (data.primitive === 'mouse.move' && data.params?.x && data.params?.y) {
          try {
            const x = data.params.x;
            const y = data.params.y;
            const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y})`;
            await execAsync(`powershell -NoProfile -Command "${cmd}"`, { timeout: 5000 });
            result.stdout = `Moved mouse to ${x},${y}`;
            console.log(`✓ ${result.stdout}`);
          } catch (err: any) {
            result.code = 1;
            result.stderr = err.message;
            console.error(`✗ Mouse move failed: ${err.message}`);
          }
        }
        // Mouse click using PowerShell - use mouse_event API for proper clicks
        else if (data.primitive === 'mouse.click' && data.params) {
          try {
            const x = data.params.x || 0;
            const y = data.params.y || 0;
            const button = data.params.button || 'left';
            const count = data.params.clickCount || 1;
            
            // Move to position if provided
            let cmd = `Add-Type -AssemblyName System.Windows.Forms; `;
            if (data.params.x && data.params.y) {
              cmd += `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y}); `;
            }
            
            // Click using mouse_event (proper mouse click, not SendKeys)
            cmd += `
              Add-Type -Name WinAPI -Namespace Win32 -MemberDefinition @"
                [DllImport("user32.dll")]
                public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint cButtons, uint dwExtraInfo);
              "@;
            `;
            
            const flags = button === 'right' ? '2' : '1';
            const flagsUp = button === 'right' ? '8' : '4';
            
            for (let i = 0; i < count; i++) {
              cmd += `[Win32.WinAPI]::mouse_event(${flags}, 0, 0, 0, 0); [System.Threading.Thread]::Sleep(50); [Win32.WinAPI]::mouse_event(${flagsUp}, 0, 0, 0, 0); `;
            }
            
            await execAsync(`powershell -NoProfile -Command "${cmd}"`, { timeout: 5000 });
            result.stdout = `Clicked ${button} button ${count}x`;
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
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log(`[${new Date().toISOString()}] Executing operation: ${data.operation}`, data.params);
        
        let result = { code: 0, stdout: '', stderr: '' };

        // App launch using PowerShell
        if (data.operation === 'app.launch' && data.params?.appPath) {
          try {
            const appPath = data.params.appPath;
            const args = data.params.arguments ? ` "${data.params.arguments.join('" "')}"` : '';
            const cmd = `Start-Process "${appPath}"${args}`;
            
            await execAsync(`powershell -NoProfile -Command "${cmd}"`, { timeout: 5000 });
            result.stdout = `Launched ${appPath}`;
            console.log(`✓ ${result.stdout}`);
          } catch (err: any) {
            result.code = 1;
            result.stderr = err.message;
            console.error(`✗ App launch failed: ${err.message}`);
          }
        }
        // Default fallback
        else {
          result.stdout = `Operation ${data.operation} not yet implemented`;
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
