import test from 'node:test';
import assert from 'node:assert/strict';
import { TaskQueue, type TaskState } from '../apps/companion-service/src/task-queue.ts';

const validTerminalStates: TaskState[] = ['done', 'failed', 'cancelled'];

test('queue task transitions queued -> running -> done/failed/cancelled', () => {
  for (const terminal of validTerminalStates) {
    const queue = new TaskQueue();
    const task = queue.enqueue({ action: `run-${terminal}` });

    assert.equal(task.state, 'queued');

    queue.transition(task.id, 'running');
    const running = queue.get(task.id);
    assert.equal(running?.state, 'running');

    queue.transition(task.id, terminal);
    const finished = queue.get(task.id);
    assert.equal(finished?.state, terminal);
  }
});

test('invalid transitions are rejected', () => {
  const queue = new TaskQueue();
  const task = queue.enqueue({ action: 'demo' });

  assert.throws(() => queue.transition(task.id, 'done'), /invalid transition/i);

  queue.transition(task.id, 'running');
  queue.transition(task.id, 'done');

  assert.throws(() => queue.transition(task.id, 'running'), /invalid transition/i);
});
