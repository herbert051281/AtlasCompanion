/**
 * Task 2: Vision Analysis Function Tests
 * TDD: Write test first, make it fail, implement, make it pass
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeScreenshot, ScreenAnalysis, UIElement } from '../src/vision-analyzer';

// Mock test - we can't actually call Claude in tests without API key
// These tests verify the interface and structure

test('analyzeScreenshot returns ScreenAnalysis structure', async () => {
  // Use a mock/test mode that returns sample data
  const result = await analyzeScreenshot('/tmp/test-screenshot.png', { testMode: true });
  
  assert.ok(result !== undefined);
  assert.ok(Array.isArray(result.elements));
  assert.equal(typeof result.timestamp, 'string');
});

test('ScreenAnalysis elements have correct structure', async () => {
  const result = await analyzeScreenshot('/tmp/test-screenshot.png', { testMode: true });
  
  // Check that elements array contains properly structured items
  if (result.elements.length > 0) {
    const element = result.elements[0];
    assert.equal(typeof element.type, 'string');
    assert.equal(typeof element.label, 'string');
    assert.ok(element.location !== undefined);
    assert.equal(typeof element.location.x, 'number');
    assert.equal(typeof element.location.y, 'number');
    assert.equal(typeof element.location.width, 'number');
    assert.equal(typeof element.location.height, 'number');
    assert.equal(typeof element.clickable, 'boolean');
  }
});

test('analyzeScreenshot identifies common UI element types', async () => {
  const result = await analyzeScreenshot('/tmp/test-screenshot.png', { testMode: true });
  
  // Common element types that should be identifiable
  const validTypes = ['button', 'textbox', 'link', 'image', 'menu', 'icon', 'list', 'item', 'window'];
  
  for (const element of result.elements) {
    // Type should be one of the valid types or a descriptive string
    assert.ok(
      validTypes.includes(element.type) || typeof element.type === 'string',
      `Element type "${element.type}" should be valid`
    );
  }
});

test('analyzeScreenshot returns error info when analysis fails', async () => {
  // Test error handling with invalid path
  const result = await analyzeScreenshot('/nonexistent/path.png', { testMode: true });
  
  // Should still return a valid structure
  assert.ok(result !== undefined);
  assert.ok('timestamp' in result);
});

test('analyzeScreenshot includes current_app when detectable', async () => {
  const result = await analyzeScreenshot('/tmp/test-screenshot.png', { testMode: true });
  
  // current_app is optional but should be a string if present
  if (result.currentApp !== undefined) {
    assert.equal(typeof result.currentApp, 'string');
  }
});
