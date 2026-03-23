#!/usr/bin/env node

/**
 * Atlas Companion Service - Simple HTTP Server
 * Listens on http://127.0.0.1:9999
 * 
 * Endpoints:
 * - GET /screenshot - Capture and return screenshot
 * - POST /execute-primitive - Execute mouse/keyboard commands
 * - POST /execute-operation - Execute app launch/close
 */

import { createServer } from 'node:http';
import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { platform } from 'node:os';
import { join } from 'node:path';

const execAsync = promisify(exec);
const PORT = 9999;
const HOST = '127.0.0.1';

console.log('Starting Atlas Companion Service...');

// Screenshot capture function (inlined)
async function captureScreenshot() {
  const timestamp = new Date().toISOString();
  const filename = `screenshot-${Date.now()}.png`;
  const tmpDir = platform() === 'win32' ? 'C:\\Temp' : '/tmp';
  const screenshotPath = join(tmpDir, filename);

  try {
    if (platform() === 'win32') {
      // PowerShell screenshot capture for Windows
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save("${screenshotPath.replace(/\\/g, '\\\\')}")
$graphics.Dispose()
$bitmap.Dispose()

Write-Output "$($bounds.Width)x$($bounds.Height)"
`;
      
      const { stdout } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
        { timeout: 10000 }
      );

      const resolution = stdout.trim() || '1920x1080';

      if (!existsSync(screenshotPath)) {
        return {
          success: false,
          timestamp,
          error: 'Screenshot file was not created'
        };
      }

      return {
        success: true,
        screenshotPath,
        resolution,
        timestamp
      };
    } else {
      // Linux/Mac mock
      return {
        success: true,
        screenshotPath: `/tmp/${filename}`,
        resolution: '1920x1080',
        timestamp
      };
    }
  } catch (error: any) {
    return {
      success: false,
      timestamp,
      error: error.message || 'Unknown error capturing screenshot'
    };
  }
}

const server = createServer(async (req, res) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);

  // Health check
  if (req.url === '/' && req.method === 'GET') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'ok', message: 'Atlas Companion Service running' }));
    return;
  }

  // Screenshot endpoint
  if (req.url === '/screenshot' && req.method === 'GET') {
    try {
      const result = await captureScreenshot();
      res.writeHead(result.success ? 200 : 500, { 'content-type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (err: any) {
      res.writeHead(500, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ success: false, error: err.message, timestamp: new Date().toISOString() }));
    }
    return;
  }

  // Execute primitive (mouse/keyboard)
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
        // Mouse click
        else if (data.primitive === 'mouse.click' && data.params) {
          try {
            const x = data.params.x || 0;
            const y = data.params.y || 0;
            const button = data.params.button || 'left';
            const count = data.params.clickCount || 1;
            
            let cmd = `Add-Type -AssemblyName System.Windows.Forms; `;
            if (data.params.x && data.params.y) {
              cmd += `[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point(${x}, ${y}); `;
            }
            
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
        // Keyboard type
        else if (data.primitive === 'keyboard.type' && data.params?.text) {
          try {
            const text = data.params.text.replace(/"/g, '\"');
            const cmd = `Add-Type -AssemblyName System.Windows.Forms; [System.Windows.Forms.SendKeys]::SendWait("${text}")`;
            await execAsync(`powershell -NoProfile -Command "${cmd}"`, { timeout: 5000 });
            result.stdout = `Typed: "${data.params.text}"`;
            console.log(`✓ ${result.stdout}`);
          } catch (err: any) {
            result.code = 1;
            result.stderr = err.message;
            console.error(`✗ Keyboard type failed: ${err.message}`);
          }
        }
        // Wait
        else if (data.primitive === 'wait' && data.params?.duration) {
          try {
            await new Promise(resolve => setTimeout(resolve, data.params.duration));
            result.stdout = `Waited ${data.params.duration}ms`;
            console.log(`✓ ${result.stdout}`);
          } catch (err: any) {
            result.code = 1;
            result.stderr = err.message;
          }
        }
        else {
          result.stdout = `Primitive ${data.primitive} not implemented`;
        }

        res.writeHead(result.code === 0 ? 200 : 500, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json', code: 1 }));
      }
    });
    return;
  }

  // Execute operation (app launch)
  if (req.url === '/execute-operation' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        console.log(`[${new Date().toISOString()}] Executing operation: ${data.operation}`, data.params);
        
        let result = { code: 0, stdout: '', stderr: '' };

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
        else {
          result.stdout = `Operation ${data.operation} not yet implemented`;
        }

        res.writeHead(result.code === 0 ? 200 : 500, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json', code: 1 }));
      }
    });
    return;
  }

  // Analyze screenshot with vision (POST)
  if (req.url === '/analyze-screenshot' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const userIntent = data.userIntent || 'Search for Sade and play';
        
        console.log(`[${new Date().toISOString()}] Analyzing with intent: ${userIntent}`);
        
        // For now, return a placeholder
        // In production, this would call Claude vision API
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({
          success: true,
          message: 'Vision analysis endpoint ready',
          intent: userIntent,
          recommendedActions: [
            { action: 'move_mouse_to_search_box' },
            { action: 'click' },
            { action: 'type_search_query', text: 'Sade' },
            { action: 'wait', duration: 2000 },
            { action: 'click_first_result' },
            { action: 'click_play_button' }
          ]
        }));
      } catch (err: any) {
        res.writeHead(400, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: 'invalid json' }));
      }
    });
    return;
  }

  // Workflow execute endpoint (POST /workflow/execute)
  // This is the main entry point for vision-driven automation
  if (req.url === '/workflow/execute' && req.method === 'POST') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        
        if (!data.userIntent) {
          res.writeHead(400, { 'content-type': 'application/json' });
          res.end(JSON.stringify({ 
            success: false, 
            error: 'userIntent is required',
            message: 'Missing required field: userIntent'
          }));
          return;
        }

        console.log(`[${new Date().toISOString()}] Workflow execute: "${data.userIntent}" (max ${data.maxIterations || 10} iterations)`);
        
        // Import dynamically to avoid circular deps at startup
        const { handleWorkflowRequest } = await import('../../src/workflow-endpoint.ts');
        
        const result = await handleWorkflowRequest({
          userIntent: data.userIntent,
          maxIterations: data.maxIterations,
        });
        
        res.writeHead(result.success ? 200 : 500, { 'content-type': 'application/json' });
        res.end(JSON.stringify(result));
      } catch (err: any) {
        console.error(`[${new Date().toISOString()}] Workflow error: ${err.message}`);
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ 
          success: false, 
          error: err.message,
          message: 'Workflow execution failed'
        }));
      }
    });
    return;
  }

  // 404
  res.writeHead(404, { 'content-type': 'application/json' });
  res.end(JSON.stringify({ error: 'not found' }));
});

server.listen(PORT, HOST, () => {
  console.log(`✅ Companion Service started on http://${HOST}:${PORT}`);
  console.log('Ready for commands. Press Ctrl+C to stop.');
});

process.on('SIGINT', () => {
  console.log('\n👋 Shutting down...');
  server.close();
  process.exit(0);
});
