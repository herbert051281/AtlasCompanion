/**
 * Task 5: End-to-End Integration Test
 * Tests the full vision workflow with actual Claude API (when available)
 * 
 * Run with: ANTHROPIC_API_KEY=... npm test -- tests/vision-workflow.integration.test.ts
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { analyzeScreenshotWithIntent } from '../src/claude-vision-analyzer.ts';
import { runSingleIteration } from '../src/workflow-loop.ts';
import { executeWorkflow } from '../src/workflow-executor.ts';
import { handleWorkflowRequest } from '../src/workflow-endpoint.ts';

// Check if we have API key for real tests
const hasApiKey = !!process.env.ANTHROPIC_API_KEY;

// Create a simple test image if needed
function createTestImage(path: string): void {
  // Create a minimal valid PNG file (1x1 pixel, white)
  const minimalPng = Buffer.from([
    0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, // PNG signature
    0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, // IHDR chunk
    0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01,
    0x08, 0x02, 0x00, 0x00, 0x00, 0x90, 0x77, 0x53,
    0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, // IDAT chunk
    0x54, 0x08, 0xd7, 0x63, 0xf8, 0xff, 0xff, 0x3f,
    0x00, 0x05, 0xfe, 0x02, 0xfe, 0xdc, 0xcc, 0x59,
    0xe7, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, // IEND chunk
    0x44, 0xae, 0x42, 0x60, 0x82
  ]);
  
  const dir = path.substring(0, path.lastIndexOf('/'));
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(path, minimalPng);
}

test('Integration: analyzeScreenshotWithIntent works in test mode', async () => {
  const result = await analyzeScreenshotWithIntent(
    '/tmp/test-screenshot.png',
    'Open Spotify and play Sade',
    { testMode: true }
  );
  
  assert.equal(result.success, true);
  assert.ok(result.elements.length > 0);
  assert.ok(result.recommendedAction !== undefined);
  assert.equal(typeof result.goalReached, 'boolean');
});

test('Integration: runSingleIteration completes full cycle in test mode', async () => {
  const result = await runSingleIteration('Search for music', { testMode: true });
  
  assert.equal(result.success, true);
  assert.ok(result.app !== undefined);
  assert.ok(result.action !== undefined);
  assert.equal(typeof result.goalReached, 'boolean');
});

test('Integration: executeWorkflow runs multiple iterations in test mode', async () => {
  const result = await executeWorkflow('Play Sade', { 
    testMode: true,
    maxIterations: 5,
    simulateGoalReachedAt: 3
  });
  
  assert.equal(result.success, true);
  assert.ok(result.iterations <= 5);
  assert.ok(result.log.length > 0);
  assert.ok(result.totalTime >= 0);
});

test('Integration: handleWorkflowRequest endpoint works', async () => {
  const result = await handleWorkflowRequest(
    { userIntent: 'Open Spotify and play Sade', maxIterations: 3 },
    { testMode: true, simulateGoalReachedAt: 2 }
  );
  
  assert.equal(result.success, true);
  assert.ok(result.iterations <= 3);
  assert.ok(result.log.length > 0);
});

test('Integration: Full pipeline from endpoint to completion', async () => {
  // Test the full pipeline with all components
  const result = await handleWorkflowRequest(
    { userIntent: 'Search for Sade, click result, play music', maxIterations: 5 },
    { testMode: true, simulateGoalReachedAt: 4 }
  );
  
  assert.equal(result.success, true);
  assert.ok(result.message.includes('completed'));
  
  // Verify log entries
  for (const entry of result.log) {
    assert.equal(typeof entry.iteration, 'number');
    assert.equal(typeof entry.action, 'string');
    assert.equal(typeof entry.timestamp, 'string');
  }
});

// Real API test - only runs if ANTHROPIC_API_KEY is set
test('Integration: Real Claude API test (requires API key)', { skip: !hasApiKey }, async () => {
  // Create a test image
  const testImagePath = '/tmp/atlas-test-image.png';
  createTestImage(testImagePath);
  
  // Run real analysis
  const result = await analyzeScreenshotWithIntent(
    testImagePath,
    'Take a screenshot and identify what is visible'
  );
  
  // Should return a result (might succeed or fail gracefully)
  assert.ok(result !== undefined);
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.timestamp, 'string');
  
  if (result.success) {
    console.log('Claude analysis result:', JSON.stringify(result, null, 2));
    assert.ok(Array.isArray(result.elements));
    assert.ok(result.recommendedAction !== undefined);
  } else {
    console.log('Claude analysis failed (expected with minimal test image):', result.error);
  }
});

// HTTP endpoint integration test (simulated)
test('Integration: HTTP endpoint response format', async () => {
  const result = await handleWorkflowRequest(
    { userIntent: 'Test workflow', maxIterations: 2 },
    { testMode: true }
  );
  
  // Verify response has all expected fields for HTTP response
  assert.ok('success' in result);
  assert.ok('iterations' in result);
  assert.ok('message' in result);
  assert.ok('log' in result);
  
  // Should be serializable to JSON
  const json = JSON.stringify(result);
  assert.ok(json.length > 0);
  
  // Should be parseable back
  const parsed = JSON.parse(json);
  assert.equal(parsed.success, result.success);
});

test('Integration: Workflow handles max iterations gracefully', async () => {
  const result = await executeWorkflow('Never complete', {
    testMode: true,
    maxIterations: 3,
    simulateGoalReachedAt: 100 // Never reach goal
  });
  
  assert.equal(result.success, false);
  assert.equal(result.iterations, 3);
  assert.ok(result.message.toLowerCase().includes('max'));
});

test('Integration: Workflow log captures all iterations', async () => {
  const maxIterations = 4;
  const goalAt = 3;
  
  const result = await executeWorkflow('Test logging', {
    testMode: true,
    maxIterations,
    simulateGoalReachedAt: goalAt
  });
  
  // Should have exactly goalAt log entries
  assert.equal(result.log.length, goalAt);
  
  // Verify iteration numbers are sequential
  for (let i = 0; i < result.log.length; i++) {
    assert.equal(result.log[i].iteration, i + 1);
  }
});
