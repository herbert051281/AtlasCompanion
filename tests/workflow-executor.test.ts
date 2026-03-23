/**
 * Task 3: Workflow Executor Loop Tests
 * TDD: Write test first, make it fail, implement, make it pass
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { executeWorkflow, WorkflowResult } from '../src/workflow-executor.ts';

test('executeWorkflow returns WorkflowResult structure', async () => {
  const result = await executeWorkflow('Open Spotify', { testMode: true, maxIterations: 3 });
  
  assert.ok(result !== undefined);
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.iterations, 'number');
  assert.equal(typeof result.message, 'string');
});

test('executeWorkflow includes log array', async () => {
  const result = await executeWorkflow('Search for Sade', { testMode: true, maxIterations: 3 });
  
  assert.ok(Array.isArray(result.log));
  assert.ok(result.log.length > 0);
});

test('executeWorkflow stops on goalReached', async () => {
  const result = await executeWorkflow('Test goal reached', { 
    testMode: true, 
    maxIterations: 10,
    simulateGoalReachedAt: 3 
  });
  
  assert.equal(result.success, true);
  assert.ok(result.iterations <= 3);
  assert.ok(result.message.includes('completed') || result.message.includes('reached'));
});

test('executeWorkflow respects maxIterations', async () => {
  const result = await executeWorkflow('Test max iterations', { 
    testMode: true, 
    maxIterations: 5,
    simulateGoalReachedAt: 100 // Never reach goal
  });
  
  assert.equal(result.success, false);
  assert.equal(result.iterations, 5);
  assert.ok(result.message.includes('Max iterations') || result.message.includes('maximum'));
});

test('executeWorkflow log entries have correct structure', async () => {
  const result = await executeWorkflow('Search Sade', { testMode: true, maxIterations: 2 });
  
  if (result.log.length > 0) {
    const entry = result.log[0];
    assert.equal(typeof entry.iteration, 'number');
    assert.equal(typeof entry.action, 'string');
  }
});

test('executeWorkflow handles iteration failures gracefully', async () => {
  const result = await executeWorkflow('Test failure', { 
    testMode: true, 
    maxIterations: 3,
    simulateFailureAt: 2
  });
  
  // Should either succeed before failure or fail gracefully
  assert.ok(result !== undefined);
  assert.equal(typeof result.success, 'boolean');
});

test('executeWorkflow with default maxIterations', async () => {
  // Default maxIterations should be 10
  const result = await executeWorkflow('Quick test', { 
    testMode: true,
    simulateGoalReachedAt: 1 // Reach goal immediately
  });
  
  assert.equal(result.success, true);
  assert.ok(result.iterations <= 10);
});

test('executeWorkflow totalTime is tracked', async () => {
  const result = await executeWorkflow('Time test', { testMode: true, maxIterations: 2 });
  
  assert.ok(result.totalTime !== undefined);
  assert.equal(typeof result.totalTime, 'number');
  assert.ok(result.totalTime >= 0);
});
