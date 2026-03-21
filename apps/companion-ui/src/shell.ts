export type UiTask = {
  id: string;
  action: string;
  riskLevel?: string;
  state: 'queued' | 'pending_approval' | 'running' | 'done' | 'failed' | 'cancelled';
};

export type UiLogEvent = {
  type: string;
  timestamp: number;
  payload: Record<string, unknown>;
};

export type CompanionSnapshot = {
  mode: 'safe' | 'controlled_ui';
  panicStopped: boolean;
  tasks: UiTask[];
  logs: UiLogEvent[];
  controlGranted: boolean;
  controlExpiresAt: number | null;
  killHotkey: string;
};

export type DashboardModel = {
  mode: CompanionSnapshot['mode'];
  panicStopped: boolean;
  queueCount: number;
  pendingApprovalCount: number;
  queue: UiTask[];
  pendingApprovals: UiTask[];
  recentLogs: UiLogEvent[];
  controlGranted: boolean;
  controlExpiresAt: number | null;
  killHotkey: string;
};

export function deriveDashboardModel(snapshot: CompanionSnapshot): DashboardModel {
  const queue = snapshot.tasks.filter((task) => task.state === 'queued' || task.state === 'running');
  const pendingApprovals = snapshot.tasks.filter((task) => task.state === 'pending_approval');

  return {
    mode: snapshot.mode,
    panicStopped: snapshot.panicStopped,
    queueCount: queue.length,
    pendingApprovalCount: pendingApprovals.length,
    queue,
    pendingApprovals,
    recentLogs: [...snapshot.logs].sort((a, b) => b.timestamp - a.timestamp).slice(0, 30),
    controlGranted: snapshot.controlGranted,
    controlExpiresAt: snapshot.controlExpiresAt,
    killHotkey: snapshot.killHotkey,
  };
}

function renderTaskList(tasks: UiTask[]): string {
  if (tasks.length === 0) {
    return '<li class="empty">None</li>';
  }

  return tasks
    .map((task) => `<li data-task-id="${task.id}"><strong>${task.action}</strong> <em>${task.state}</em></li>`)
    .join('');
}

function renderLogs(logs: UiLogEvent[]): string {
  if (logs.length === 0) {
    return '<li class="empty">No logs yet</li>';
  }

  return logs
    .map((event) => `<li><code>${event.type}</code> <span>${new Date(event.timestamp).toISOString()}</span></li>`)
    .join('');
}

export function renderShellHtml(model: DashboardModel): string {
  const remainingSeconds = model.controlExpiresAt ? Math.max(0, Math.floor((model.controlExpiresAt - Date.now()) / 1000)) : 0;
  const controlActive = model.controlGranted && remainingSeconds > 0;
  
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Skillmaster Companion</title>
    <style>
      body { font-family: sans-serif; }
      .control-active-banner {
        background: #ff4444; color: white; padding: 10px; font-weight: bold; text-align: center;
        animation: flash 2s infinite; display: ${controlActive ? 'block' : 'none'};
      }
      @keyframes flash { 0% { opacity: 1; } 50% { opacity: 0.7; } 100% { opacity: 1; } }
      .safety-controls { border: 2px solid #ccc; padding: 10px; margin-bottom: 20px; border-radius: 8px; }
      #stop-now { background: #cc0000; color: white; border: none; padding: 15px 30px; font-size: 1.2rem; cursor: pointer; border-radius: 4px; font-weight: bold; }
    </style>
  </head>
  <body>
    <div class="control-active-banner">CONTROL ACTIVE - EMERGENCY KILL: ${model.killHotkey}</div>
    <header>
      <h1>Skillmaster Companion</h1>
      <div class="safety-controls">
        <button id="stop-now" aria-label="stop execution">STOP NOW (F12)</button>
        <p>Mode: <strong>${model.mode}</strong> | Status: <strong>${model.panicStopped ? 'PANIC STOPPED' : 'ACTIVE'}</strong></p>
        ${controlActive ? `<p>Control Session: <strong>${remainingSeconds}s remaining</strong> <button id="revoke-control">Revoke</button></p>` : '<p>No active control session.</p>'}
      </div>
    </header>
    <main>
      <section>
        <h2>Queue (${model.queueCount})</h2>
        <ul>${renderTaskList(model.queue)}</ul>
      </section>
      <section>
        <h2>Pending Approvals (${model.pendingApprovalCount})</h2>
        <ul>${renderTaskList(model.pendingApprovals)}</ul>
      </section>
      <section>
        <h2>Recent Logs</h2>
        <ul>${renderLogs(model.recentLogs)}</ul>
      </section>
    </main>
  </body>
</html>`;
}
