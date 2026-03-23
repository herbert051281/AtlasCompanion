/**
 * Task 3: Screenshot Request Handler Tests
 * TDD: Write test first, make it fail, implement, make it pass
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  handleScreenshotRequest, 
  ScreenshotRequestResult 
} from '../apps/companion-service/src/screenshot-request-handler';

test('handleScreenshotRequest returns a ScreenshotRequestResult', async () => {
  const result = await handleScreenshotRequest({ testMode: true });
  
  assert.ok(result !== undefined);
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.timestamp, 'string');
});

test('handleScreenshotRequest includes screenshotPath when successful', async () => {
  const result = await handleScreenshotRequest({ testMode: true });
  
  if (result.success) {
    assert.ok(result.screenshotPath !== undefined);
  }
});

test('handleScreenshotRequest includes metadata', async () => {
  const result = await handleScreenshotRequest({ testMode: true });
  
  if (result.success) {
    assert.ok(result.metadata !== undefined);
    assert.equal(typeof result.metadata.resolution, 'string');
    assert.equal(typeof result.metadata.captureTimeMs, 'number');
  }
});

test('handleScreenshotRequest can queue to GitHub (mock)', async () => {
  // When queueToGithub is true, it should attempt to store URL
  const result = await handleScreenshotRequest({ 
    testMode: true, 
    queueToGithub: true 
  });
  
  assert.ok(result !== undefined);
  // In test mode, should still succeed
  assert.equal(result.success, true);
});

test('handleScreenshotRequest returns error on failure', async () => {
  // Simulate failure mode
  const result = await handleScreenshotRequest({ 
    testMode: true,
    simulateError: true 
  });
  
  assert.equal(result.success, false);
  assert.ok(result.error !== undefined);
});
