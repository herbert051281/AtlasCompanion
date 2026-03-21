const $ = (id) => document.getElementById(id);

async function refresh() {
  const [health, status, tasks, logs] = await Promise.all([
    window.companionApi.health(),
    window.companionApi.status(),
    window.companionApi.tasks(),
    window.companionApi.logs(),
  ]);

  $('statusline').textContent = health.ok ? 'Service healthy' : `Health error (${health.status})`;
  $('service').textContent = `Mode=${status.data.mode} | Panic=${status.data.panicStopped} | Queue=${status.data.queueCount} | Pending=${status.data.pendingApprovalCount} | ${window.companionApi.baseUrl}`;

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

setInterval(() => {
  refresh().catch((error) => {
    $('statusline').textContent = `Refresh failed: ${error.message}`;
  });
}, 2000);

refresh();
