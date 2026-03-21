import { app, BrowserWindow, globalShortcut, net } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let serviceProc = null;
let servicePort = null;
let authToken = null;

async function requestToken(port) {
  return new Promise((resolve, reject) => {
    const request = net.request({
      method: 'POST',
      protocol: 'http:',
      hostname: '127.0.0.1',
      port,
      path: '/session/token',
    });

    request.on('response', (response) => {
      let data = '';
      response.on('data', (chunk) => {
        data += chunk;
      });
      response.on('end', () => {
        if (response.statusCode === 201) {
          resolve(JSON.parse(data).token);
        } else {
          reject(new Error(`Failed to get token: ${response.statusCode}`));
        }
      });
    });

    request.on('error', (error) => reject(error));
    request.setHeader('content-type', 'application/json');
    request.write('{}');
    request.end();
  });
}

async function triggerPanic(port, token) {
  return new Promise((resolve) => {
    const request = net.request({
      method: 'POST',
      protocol: 'http:',
      hostname: '127.0.0.1',
      port,
      path: '/internal/hotkey-panic',
    });

    request.setHeader('Authorization', `Bearer ${token}`);
    request.on('response', (response) => {
      resolve(response.statusCode === 200);
    });
    request.on('error', () => resolve(false));
    request.end();
  });
}

function startServiceProcess() {
  return new Promise((resolve, reject) => {
    const runnerPath = path.join(__dirname, 'service-runner.mjs');
    const child = spawn(process.execPath, ['--import', 'tsx', runnerPath], {
      env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let resolved = false;

    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      const text = String(chunk);
      for (const line of text.split(/\r?\n/)) {
        if (!line.trim()) continue;

        if (line.startsWith('SERVICE_PORT=')) {
          const port = Number(line.slice('SERVICE_PORT='.length));
          if (!Number.isNaN(port) && port > 0) {
            servicePort = port;
            if (!resolved) {
              resolved = true;
              resolve(port);
            }
          }
        } else {
          console.log(`[companion-service] ${line}`);
        }
      }
    });

    child.stderr.setEncoding('utf8');
    child.stderr.on('data', (chunk) => {
      console.error(`[companion-service] ${String(chunk).trim()}`);
    });

    child.once('exit', (code) => {
      if (!resolved) {
        reject(new Error(`service process exited before startup (code ${code ?? 'unknown'})`));
      }
      serviceProc = null;
    });

    serviceProc = child;
  });
}

function createWindow() {
  if (!servicePort) {
    throw new Error('service port not available');
  }

  const win = new BrowserWindow({
    width: 1100,
    height: 760,
    webPreferences: {
      contextIsolation: true,
      sandbox: false,
      nodeIntegration: false,
      preload: path.join(__dirname, 'preload.cjs'),
      additionalArguments: [`--companion-port=${servicePort}`],
    },
  });

  win.loadFile(path.join(__dirname, 'index.html'));
}

app.whenReady().then(async () => {
  const port = await startServiceProcess();
  authToken = await requestToken(port);

  const registered = globalShortcut.register('CommandOrControl+Alt+Pause', async () => {
    console.warn('Global Kill Switch (Ctrl+Alt+Pause) triggered! Sending panic stop...');
    const success = await triggerPanic(servicePort, authToken);
    if (success) {
      console.log('Panic stop signal delivered.');
    } else {
      console.error('Failed to deliver panic stop signal.');
    }
  });

  if (!registered) {
    console.error('Failed to register global shortcut (Ctrl+Alt+Pause).');
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('will-quit', () => {
  globalShortcut.unregisterAll();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', () => {
  if (serviceProc && !serviceProc.killed) {
    serviceProc.kill('SIGTERM');
  }
});
