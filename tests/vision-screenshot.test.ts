/**
 * Task 1: Screenshot Capture Endpoint Tests
 * TDD: Write test first, make it fail, implement, make it pass
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { handleScreenshot, ScreenshotResult } from '../apps/companion-service/src/screenshot-handler';

test('Screenshot handler returns a ScreenshotResult object', async () => {
  const result = await handleScreenshot();
  
  assert.ok(result !== undefined);
  assert.equal(typeof result.success, 'boolean');
  assert.equal(typeof result.timestamp, 'string');
});

test('Screenshot handler includes screenshotPath when successful', async () => {
  const result = await handleScreenshot();
  
  if (result.success) {
    assert.ok(result.screenshotPath !== undefined);
    assert.ok(result.screenshotPath.includes('screenshot-'));
    assert.ok(result.screenshotPath.includes('.png'));
  }
});

test('Screenshot handler includes resolution info', async () => {
  const result = await handleScreenshot();
  
  if (result.success) {
    assert.ok(result.resolution !== undefined);
    assert.match(result.resolution, /^\d+x\d+$/);
  }
});

test('Screenshot handler has ISO timestamp format', async () => {
  const result = await handleScreenshot();
  
  // ISO 8601 format check
  const isoRegex = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
  assert.match(result.timestamp, isoRegex);
});

test('Screenshot result matches ScreenshotResult interface', async () => {
  const result = await handleScreenshot();
  
  // Type checking - all these properties should exist
  assert.ok('success' in result);
  assert.ok('timestamp' in result);

  if (result.success) {
    assert.ok('screenshotPath' in result);
    assert.ok('resolution' in result);
  } else {
    assert.ok('error' in result);
  }
});
