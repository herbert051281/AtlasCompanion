/**
 * Task 1: Claude Vision Analyzer Tests
 * TDD: Write test first, make it fail, implement, make it pass
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeScreenshotWithIntent, ScreenshotAnalysis, UIElement } from '../src/claude-vision-analyzer.ts';

// Test mode verifies interface and structure without calling Claude API

test('analyzeScreenshotWithIntent returns ScreenshotAnalysis structure', async () => {
  const result = await analyzeScreenshotWithIntent('/tmp/test-screenshot.png', 'Open Spotify', { testMode: true });
  
  assert.ok(result !== undefined);
  assert.equal(typeof result.success, 'boolean');
  assert.ok(Array.isArray(result.elements));
  assert.equal(typeof result.timestamp, 'string');
});

test('analyzeScreenshotWithIntent includes recommendedAction', async () => {
  const result = await analyzeScreenshotWithIntent('/tmp/test-screenshot.png', 'Search for Sade', { testMode: true });
  
  assert.ok(result.recommendedAction !== undefined);
  assert.equal(typeof result.recommendedAction.type, 'string');
  assert.equal(typeof result.recommendedAction.reason, 'string');
});

test('analyzeScreenshotWithIntent includes goalReached boolean', async () => {
  const result = await analyzeScreenshotWithIntent('/tmp/test-screenshot.png', 'Play Sade', { testMode: true });
  
  assert.equal(typeof result.goalReached, 'boolean');
});

test('analyzeScreenshotWithIntent elements have correct structure', async () => {
  const result = await analyzeScreenshotWithIntent('/tmp/test-screenshot.png', 'Test', { testMode: true });
  
  if (result.elements.length > 0) {
    const element = result.elements[0];
    assert.equal(typeof element.type, 'string');
    assert.equal(typeof element.label, 'string');
    assert.ok(element.coordinates !== undefined);
    assert.equal(typeof element.coordinates[0], 'number');
    assert.equal(typeof element.coordinates[1], 'number');
    assert.equal(typeof element.clickable, 'boolean');
    assert.equal(typeof element.confidence, 'number');
  }
});

test('analyzeScreenshotWithIntent recommendedAction has coordinates for click actions', async () => {
  const result = await analyzeScreenshotWithIntent('/tmp/test-screenshot.png', 'Click search box', { testMode: true });
  
  if (result.recommendedAction.type === 'click') {
    assert.ok(result.recommendedAction.coordinates !== undefined);
    assert.ok(Array.isArray(result.recommendedAction.coordinates));
    assert.equal(result.recommendedAction.coordinates.length, 2);
  }
});

test('analyzeScreenshotWithIntent returns currentApp when detectable', async () => {
  const result = await analyzeScreenshotWithIntent('/tmp/test-screenshot.png', 'Open Spotify', { testMode: true });
  
  if (result.currentApp !== undefined) {
    assert.equal(typeof result.currentApp, 'string');
  }
});

test('analyzeScreenshotWithIntent handles error gracefully', async () => {
  const result = await analyzeScreenshotWithIntent('/nonexistent/path.png', 'Test', { testMode: true });
  
  // Should still return valid structure, just with success=false
  assert.ok(result !== undefined);
  assert.equal(typeof result.success, 'boolean');
  if (!result.success) {
    assert.equal(typeof result.error, 'string');
  }
});
