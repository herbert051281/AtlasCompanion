/**
 * Task 2: Workflow Single Iteration Tests
 * TDD: Write test first, make it fail, implement, make it pass
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { runSingleIteration, IterationResult } from '../src/workflow-loop.ts';

test('runSingleIteration returns IterationResult structure', async () => {
  const result = await runSingleIteration('Open Spotify', { testMode: true });
  
  assert.ok(result !== undefined);
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.iteration, 'number');
});

test('runSingleIteration includes app info when successful', async () => {
  const result = await runSingleIteration('Search for Sade', { testMode: true });
  
  if (result.success) {
    assert.ok(result.app !== undefined);
    assert.equal(typeof result.app, 'string');
  }
});

test('runSingleIteration includes action taken', async () => {
  const result = await runSingleIteration('Click play button', { testMode: true });
  
  if (result.success) {
    assert.ok(result.action !== undefined);
    assert.equal(typeof result.action.type, 'string');
  }
});

test('runSingleIteration includes goalReached boolean', async () => {
  const result = await runSingleIteration('Play Sade', { testMode: true });
  
  assert.equal(typeof result.goalReached, 'boolean');
});

test('runSingleIteration handles screenshot failure', async () => {
  const result = await runSingleIteration('Test', { testMode: true, simulateScreenshotFailure: true });
  
  assert.equal(result.success, false);
  assert.ok(result.error !== undefined);
});

test('runSingleIteration handles analysis failure', async () => {
  const result = await runSingleIteration('Test', { testMode: true, simulateAnalysisFailure: true });
  
  assert.equal(result.success, false);
  assert.ok(result.error !== undefined);
});

test('runSingleIteration returns action result', async () => {
  const result = await runSingleIteration('Search for Sade', { testMode: true });
  
  if (result.success && result.action) {
    assert.ok(['click', 'type', 'wait', 'scroll', 'launch_app', 'none'].includes(result.action.type));
  }
});
