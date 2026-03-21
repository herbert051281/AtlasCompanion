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
};

export type DashboardModel = {
  mode: CompanionSnapshot['mode'];
  panicStopped: boolean;
  queueCount: number;
  pendingApprovalCount: number;
  queue: UiTask[];
  pendingApprovals: UiTask[];
  recentLogs: UiLogEvent[];
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
  return `<!doctype html>
<html>
  <head><meta charset="utf-8" /><title>Skillmaster Companion</title></head>
  <body>
    <header>
      <h1>Skillmaster Companion</h1>
      <button id="stop-now" aria-label="stop execution">STOP NOW</button>
      <p>Mode: ${model.mode}</p>
      <p>Status: ${model.panicStopped ? 'PANIC STOPPED' : 'ACTIVE'}</p>
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
