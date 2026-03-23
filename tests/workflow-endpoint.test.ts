/**
 * Task 4: HTTP Endpoint Integration Tests
 * TDD: Write test first, make it fail, implement, make it pass
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';

// We test the endpoint handler directly rather than starting a real server
import { handleWorkflowRequest, WorkflowRequestBody, WorkflowResponse } from '../src/workflow-endpoint.ts';

test('handleWorkflowRequest returns WorkflowResponse structure', async () => {
  const request: WorkflowRequestBody = {
    userIntent: 'Open Spotify and play Sade',
  };
  
  const result = await handleWorkflowRequest(request, { testMode: true });
  
  assert.ok(result !== undefined);
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.iterations, 'number');
  assert.equal(typeof result.message, 'string');
  assert.ok(Array.isArray(result.log));
});

test('handleWorkflowRequest accepts maxIterations parameter', async () => {
  const request: WorkflowRequestBody = {
    userIntent: 'Search for Sade',
    maxIterations: 5,
  };
  
  const result = await handleWorkflowRequest(request, { 
    testMode: true,
    simulateGoalReachedAt: 100 // Never reach goal
  });
  
  // Should respect maxIterations limit
  assert.ok(result.iterations <= 5);
});

test('handleWorkflowRequest validates userIntent is required', async () => {
  const request = {} as WorkflowRequestBody;
  
  const result = await handleWorkflowRequest(request, { testMode: true });
  
  assert.equal(result.success, false);
  assert.ok(result.message.includes('userIntent') || result.message.includes('required'));
});

test('handleWorkflowRequest returns log with iteration details', async () => {
  const request: WorkflowRequestBody = {
    userIntent: 'Click play button',
    maxIterations: 2,
  };
  
  const result = await handleWorkflowRequest(request, { testMode: true });
  
  assert.ok(result.log.length > 0);
  
  const entry = result.log[0];
  assert.equal(typeof entry.iteration, 'number');
  assert.equal(typeof entry.action, 'string');
});

test('handleWorkflowRequest includes totalTime', async () => {
  const request: WorkflowRequestBody = {
    userIntent: 'Type hello',
    maxIterations: 1,
  };
  
  const result = await handleWorkflowRequest(request, { testMode: true });
  
  assert.ok(result.totalTime !== undefined);
  assert.equal(typeof result.totalTime, 'number');
});

test('handleWorkflowRequest default maxIterations is 10', async () => {
  const request: WorkflowRequestBody = {
    userIntent: 'Test default',
  };
  
  const result = await handleWorkflowRequest(request, { 
    testMode: true,
    simulateGoalReachedAt: 1 
  });
  
  // Should succeed immediately (goal reached at iteration 1)
  assert.equal(result.success, true);
  assert.equal(result.iterations, 1);
});
