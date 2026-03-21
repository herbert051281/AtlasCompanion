import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveDashboardModel, renderShellHtml } from '../apps/companion-ui/src/shell.ts';

test('ui shell renders queue, logs, pending approvals and stop control', () => {
  const model = deriveDashboardModel({
    mode: 'safe',
    panicStopped: false,
    tasks: [
      { id: '1', action: 'read_status', riskLevel: 'low', state: 'queued' },
      { id: '2', action: 'ui_click', riskLevel: 'medium', state: 'pending_approval' },
    ],
    logs: [
      { type: 'task.created', timestamp: 1, payload: { taskId: '1' } },
      { type: 'task.pending_approval', timestamp: 2, payload: { taskId: '2' } },
    ],
  });

  assert.equal(model.queueCount, 1);
  assert.equal(model.pendingApprovalCount, 1);

  const html = renderShellHtml(model);
  assert.match(html, /STOP NOW/);
  assert.match(html, /Pending Approvals \(1\)/);
  assert.match(html, /ui_click/);
  assert.match(html, /Recent Logs/);
});
