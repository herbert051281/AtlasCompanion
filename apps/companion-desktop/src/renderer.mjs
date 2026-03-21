const $ = (id) => document.getElementById(id);

async function refresh() {
  if (!window.companionApi) {
    throw new Error('companionApi bridge unavailable');
  }

  const [health, status, tasks, logs, control] = await Promise.all([
    window.companionApi.health(),
    window.companionApi.status(),
    window.companionApi.tasks(),
    window.companionApi.logs(),
    window.companionApi.controlStatus(),
  ]);

  $('statusline').textContent = health.ok ? 'Service healthy' : `Health error (${health.status})`;
  const expiresText = control.data.controlExpiresAt ? new Date(control.data.controlExpiresAt).toLocaleString() : 'n/a';
  $('service').textContent = `Mode=${status.data.mode} | Panic=${status.data.panicStopped} | Queue=${status.data.queueCount} | Pending=${status.data.pendingApprovalCount} | ControlGranted=${control.data.controlGranted} | ControlExpires=${expiresText} | ${window.companionApi.baseUrl}`;

  const taskItems = (tasks.data.tasks ?? []).slice(-8).reverse()
    .map((task) => `<li><strong>${task.action}</strong> <code>${task.state}</code></li>`)
    .join('') || '<li>None</li>';
  $('tasks').innerHTML = taskItems;

  const logItems = (logs.data.events ?? []).slice(-10).reverse()
    .map((event) => `<li><code>${event.type}</code> ${new Date(event.timestamp).toLocaleTimeString()}</li>`)
    .join('') || '<li>None</li>';
  $('logs').innerHTML = logItems;
}

$('enqueue').addEventListener('click', async () => {
  await window.companionApi.createTask('read_status', 'low');
  await refresh();
});

$('panic').addEventListener('click', async () => {
  await window.companionApi.panicStop();
  await refresh();
});

$('grant-control').addEventListener('click', async () => {
  await window.companionApi.grantControl();
  await refresh();
});

setInterval(() => {
  refresh().catch((error) => {
    $('statusline').textContent = `Refresh failed: ${error.message}`;
  });
}, 2000);

refresh();
