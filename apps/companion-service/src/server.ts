import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import { TaskQueue } from './task-queue.ts';
import { evaluatePolicy, type PolicyRule, type RiskLevel } from '../../../packages/policy-engine/src/index.ts';
import samplePolicy from '../../../packages/policy-engine/policy.sample.json' with { type: 'json' };
import { createAutoHotkeyScriptManager } from './autohotkey-scripts/index.ts';
import { createPowerShellManager } from './powershell-scripts/index.ts';

type AuditEvent = {
  type: string;
  payload: unknown;
  timestamp: number;
};

type AuditLog = {
  append: (event: AuditEvent) => unknown;
};

type StartOptions = {
  port?: number;
  host?: string;
  auditLog?: AuditLog;
  authTtlMs?: number;
  psExecutor?: (args: { exe: string; args: string[]; timeout: number }) => Promise<{ stdout: string; stderr: string }>;
};

export type ServiceHandle = {
  server: Server;
  host: '127.0.0.1';
  port: number;
};

type ExecutionMode = 'safe' | 'controlled_ui';

const LOCALHOST = '127.0.0.1' as const;
const policy = samplePolicy as PolicyRule[];
const DEFAULT_AUTH_TTL_MS = 30 * 60 * 1000;
const DEFAULT_CONTROL_TTL_MS = 10 * 60 * 1000;
const MAX_CONTROL_TTL_MS = 30 * 60 * 1000;

function sendJson(res: ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { 'content-type': 'application/json' });
  res.end(JSON.stringify(body));
}

async function readBody(req: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Uint8Array[] = [];
  let size = 0;

  for await (const chunk of req) {
    const data = chunk as Uint8Array;
    size += data.byteLength;
    if (size > 64 * 1024) {
      throw new Error('payload_too_large');
    }
    chunks.push(data);
  }

  if (chunks.length === 0) {
    return {};
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as Record<string, unknown>;
  } catch {
    throw new Error('invalid_json');
  }
}

function isUiControlAction(action: string): boolean {
  return action.startsWith('ui_') || action.startsWith('ahk_');
}

export async function startService(options: StartOptions = {}): Promise<ServiceHandle> {
  const requestedHost = options.host ?? LOCALHOST;

  if (requestedHost !== LOCALHOST) {
    throw new Error('localhost only policy: service must bind to 127.0.0.1');
  }

  const queue = new TaskQueue();
  const runningControllers = new Map<string, { controller: AbortController; timer: ReturnType<typeof setTimeout> }>();
  const sessions = new Map<string, { expiresAt: number }>();
  const events: AuditEvent[] = [];
  const authTtlMs = options.authTtlMs ?? DEFAULT_AUTH_TTL_MS;
  const auditLog = options.auditLog;

  // Initialize PowerShell manager for window/app operations
  const psManager = createPowerShellManager({
    scriptsRoot: new URL('./powershell-scripts', import.meta.url).pathname,
    executor: options.psExecutor,
  });

  let panicStopped = false;
  let mode: ExecutionMode = 'safe';
  let controlGranted = false;
  let controlExpiresAt: number | null = null;

  const logEvent = (type: string, payload: unknown) => {
    const event: AuditEvent = { type, payload, timestamp: Date.now() };
    events.push(event);
    auditLog?.append(event);
  };

  const issueToken = () => {
    const token = crypto.randomUUID();
    const expiresAt = Date.now() + authTtlMs;
    sessions.set(token, { expiresAt });
    logEvent('session.issued', { expiresAt });
    return { token, expiresAt, ttlMs: authTtlMs };
  };

  const requireAuth = (req: IncomingMessage, res: ServerResponse): boolean => {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      sendJson(res, 401, { error: 'missing_or_invalid_token' });
      return false;
    }

    const token = header.slice('Bearer '.length).trim();
    const session = sessions.get(token);
    if (!session) {
      sendJson(res, 401, { error: 'invalid_token' });
      return false;
    }

    if (session.expiresAt <= Date.now()) {
      sessions.delete(token);
      sendJson(res, 401, { error: 'token_expired' });
      return false;
    }

    return true;
  };

  const currentControlStatus = () => {
    if (!controlExpiresAt || controlExpiresAt <= Date.now()) {
      if (controlGranted) {
        controlGranted = false;
        controlExpiresAt = null;
        logEvent('control.revoked', { reason: 'timeout' });
      }
    }

    return {
      controlGranted,
      controlExpiresAt,
      killHotkey: 'Ctrl+Alt+Pause',
    };
  };

  const cancelTaskIfPossible = (taskId: string) => {
    const task = queue.get(taskId);
    if (!task) {
      return;
    }

    if (['queued', 'pending_approval', 'running'].includes(task.state)) {
      const cancelled = queue.transition(task.id, 'cancelled');
      logEvent('task.cancelled', { taskId: cancelled.id, action: cancelled.action });
    }
  };

  const startSyntheticExecution = (taskId: string, durationMs = 5_000) => {
    const task = queue.get(taskId);
    if (!task) {
      throw new Error('task_not_found');
    }

    if (task.state !== 'queued') {
      throw new Error('task_not_queued');
    }

    const running = queue.transition(taskId, 'running');
    logEvent('task.running', { taskId: running.id, action: running.action });
    const controller = new AbortController();

    const timer = setTimeout(() => {
      if (controller.signal.aborted) {
        return;
      }

      const done = queue.transition(taskId, 'done');
      logEvent('task.done', { taskId: done.id, action: done.action });
      runningControllers.delete(taskId);
    }, durationMs);

    controller.signal.addEventListener('abort', () => {
      clearTimeout(timer);
      runningControllers.delete(taskId);
      cancelTaskIfPossible(taskId);
    });

    runningControllers.set(taskId, { controller, timer });
  };

  const panicStop = () => {
    panicStopped = true;

    for (const [id, ctx] of runningControllers) {
      ctx.controller.abort();
      runningControllers.delete(id);
    }

    for (const task of queue.all()) {
      cancelTaskIfPossible(task.id);
    }
  };

  const server = createServer(async (req, res) => {
    try {
      if (req.method === 'GET' && req.url === '/health') {
        sendJson(res, 200, { status: 'healthy' });
        return;
      }

      if (req.method === 'GET' && req.url === '/status') {
        sendJson(res, 200, {
          mode,
          panicStopped,
          queueCount: queue.all().filter((task) => task.state === 'queued').length,
          pendingApprovalCount: queue.all().filter((task) => task.state === 'pending_approval').length,
        });
        return;
      }

      if (req.method === 'GET' && req.url === '/control/status') {
        sendJson(res, 200, currentControlStatus());
        return;
      }

      if (req.method === 'POST' && req.url === '/session/token') {
        sendJson(res, 201, issueToken());
        return;
      }

      if (req.method === 'GET' && req.url === '/tasks') {
        sendJson(res, 200, { tasks: queue.all() });
        return;
      }

      if (req.method === 'GET' && req.url === '/logs/export') {
        const ordered = [...events].sort((a, b) => a.timestamp - b.timestamp);
        sendJson(res, 200, {
          generatedAt: Date.now(),
          count: ordered.length,
          events: ordered,
        });
        return;
      }

      if (req.method === 'POST' && req.url === '/control/grant') {
        if (!requireAuth(req, res)) {
          return;
        }

        const body = await readBody(req);
        const requestedTtl = body.ttlMs;

        if (requestedTtl !== undefined && (typeof requestedTtl !== 'number' || Number.isNaN(requestedTtl))) {
          sendJson(res, 400, { error: 'invalid_ttl' });
          return;
        }

        const requestedMs = typeof requestedTtl === 'number' ? Math.floor(requestedTtl) : DEFAULT_CONTROL_TTL_MS;
        const ttlMs = Math.max(1, Math.min(requestedMs, MAX_CONTROL_TTL_MS));

        controlGranted = true;
        controlExpiresAt = Date.now() + ttlMs;
        const status = currentControlStatus();

        logEvent('control.granted', { ttlMs, controlExpiresAt: status.controlExpiresAt });
        sendJson(res, 200, { ...status, ttlMs });
        return;
      }

      if (req.method === 'POST' && req.url === '/mode') {
        if (!requireAuth(req, res)) {
          return;
        }

        const body = await readBody(req);
        const requestedMode = body.mode;

        if (requestedMode !== 'safe' && requestedMode !== 'controlled_ui') {
          sendJson(res, 400, { error: 'invalid_mode' });
          return;
        }

        mode = requestedMode;
        logEvent('mode.changed', { mode });
        sendJson(res, 200, { mode });
        return;
      }

      if (req.method === 'POST' && req.url === '/tasks') {
        if (!requireAuth(req, res)) {
          return;
        }

        if (panicStopped) {
          sendJson(res, 423, { error: 'panic_stopped' });
          return;
        }

        const body = await readBody(req);
        const action = String(body.action ?? '');
        const riskLevel = body.riskLevel as RiskLevel;

        if (!action) {
          sendJson(res, 400, { error: 'action_required' });
          return;
        }

        if (mode === 'safe' && isUiControlAction(action)) {
          sendJson(res, 403, { error: 'safe_mode_blocks_ui_control' });
          return;
        }

        const decision = evaluatePolicy(policy, { action, riskLevel });

        if (decision.decision === 'deny') {
          sendJson(res, 403, { decision: 'deny' });
          return;
        }

        const task = queue.enqueue({ action, riskLevel });
        logEvent('task.created', { taskId: task.id, action: task.action, riskLevel: task.riskLevel });

        if (decision.decision === 'approval_required') {
          const pending = queue.transition(task.id, 'pending_approval');
          logEvent('task.pending_approval', { taskId: pending.id, action: pending.action });
          sendJson(res, 202, { decision: 'approval_required', task: pending });
          return;
        }

        sendJson(res, 201, { decision: 'allow', task });
        return;
      }

      const approveMatch = req.url?.match(/^\/tasks\/([^/]+)\/approve$/);
      if (req.method === 'POST' && approveMatch) {
        if (!requireAuth(req, res)) {
          return;
        }

        const task = queue.get(approveMatch[1]);
        if (!task || task.state !== 'pending_approval') {
          sendJson(res, 404, { error: 'pending_task_not_found' });
          return;
        }

        const updated = queue.transition(task.id, 'queued');
        logEvent('task.approved', { taskId: updated.id, action: updated.action });
        sendJson(res, 200, { task: updated });
        return;
      }

      const denyMatch = req.url?.match(/^\/tasks\/([^/]+)\/deny$/);
      if (req.method === 'POST' && denyMatch) {
        if (!requireAuth(req, res)) {
          return;
        }

        const task = queue.get(denyMatch[1]);
        if (!task || task.state !== 'pending_approval') {
          sendJson(res, 404, { error: 'pending_task_not_found' });
          return;
        }

        const updated = queue.transition(task.id, 'cancelled');
        logEvent('task.denied', { taskId: updated.id, action: updated.action });
        sendJson(res, 200, { task: updated });
        return;
      }

      const startMatch = req.url?.match(/^\/tasks\/([^/]+)\/start$/);
      if (req.method === 'POST' && startMatch) {
        if (!requireAuth(req, res)) {
          return;
        }

        if (panicStopped) {
          sendJson(res, 423, { error: 'panic_stopped' });
          return;
        }

        const body = await readBody(req);
        const durationMs = typeof body.durationMs === 'number' ? body.durationMs : undefined;

        try {
          startSyntheticExecution(startMatch[1], durationMs);
        } catch (error) {
          sendJson(res, 400, { error: (error as Error).message });
          return;
        }

        sendJson(res, 202, { task: queue.get(startMatch[1]) });
        return;
      }

      if (req.method === 'POST' && req.url === '/control/revoke') {
        if (!requireAuth(req, res)) {
          return;
        }

        controlGranted = false;
        controlExpiresAt = null;
        logEvent('control.revoked', { reason: 'user' });
        sendJson(res, 200, currentControlStatus());
        return;
      }

      if (req.method === 'POST' && req.url === '/internal/hotkey-panic') {
        if (!requireAuth(req, res)) {
          return;
        }

        panicStop();
        logEvent('panic.hotkey', { hotkey: 'Ctrl+Alt+Pause' });
        sendJson(res, 200, { status: 'stopped' });
        return;
      }

      if (req.method === 'POST' && req.url === '/panic-stop') {
        if (!requireAuth(req, res)) {
          return;
        }

        panicStop();
        logEvent('panic.stop', { status: 'stopped' });
        sendJson(res, 200, { status: 'stopped' });
        return;
      }

      // IRIS TRACK: Execute AutoHotkey primitives (mouse/keyboard)
      if (req.method === 'POST' && req.url === '/execute-primitive') {
        const body = await readBody(req);
        const primitive = body.primitive as string | undefined;
        const params = (body.params ?? {}) as Record<string, unknown> & { approved?: boolean };

        if (!primitive) {
          sendJson(res, 400, { error: 'missing primitive' });
          return;
        }

        // Check approval flag
        if (!params.approved) {
          sendJson(res, 403, { error: 'approval required for primitive execution' });
          return;
        }

        // Create script manager with mock mode for non-Windows environments
        const isWindows = process.platform === 'win32';
        const scriptsRoot = new URL('./autohotkey-scripts', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
        const manager = createAutoHotkeyScriptManager({
          scriptsRoot,
          ahkExecutable: 'AutoHotkey64.exe',
          mockExecution: !isWindows,
        });

        try {
          manager.validate(primitive, { ...params, approved: true });
        } catch (err) {
          sendJson(res, 400, { error: (err as Error).message });
          return;
        }

        try {
          const result = await manager.execute(primitive, { ...params, approved: true });
          logEvent('primitive.executed', { primitive, params, result });
          sendJson(res, 200, result);
        } catch (err) {
          sendJson(res, 500, { error: (err as Error).message });
        }
        return;
      }

      const taskMatch = req.url?.match(/^\/tasks\/([^/]+)$/);
      if (req.method === 'GET' && taskMatch) {
        const task = queue.get(taskMatch[1]);
        if (!task) {
          sendJson(res, 404, { error: 'task_not_found' });
          return;
        }

        sendJson(res, 200, { task });
        return;
      }

      sendJson(res, 404, { error: 'not_found' });
    } catch (error) {
      const message = (error as Error).message;
      if (message === 'payload_too_large') {
        sendJson(res, 413, { error: message });
        return;
      }

      if (message === 'invalid_json') {
        sendJson(res, 400, { error: message });
        return;
      }

      sendJson(res, 500, { error: 'internal_error' });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(options.port ?? 0, LOCALHOST, () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();
  if (!address || typeof address === 'string') {
    server.close();
    throw new Error('failed to bind service address');
  }

  return {
    server,
    host: LOCALHOST,
    port: address.port,
    close: () => server.close(),
  };
}

// Alias for compatibility with integration tests
export const startCompanionService = startService;
