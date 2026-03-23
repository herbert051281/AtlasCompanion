/**
 * Task 4: Decision Engine Tests
 * TDD: Write test first, make it fail, implement, make it pass
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { 
  DecisionEngine, 
  UserIntent, 
  ActionCommand,
  parseIntent
} from '../src/decision-engine';
import { ScreenAnalysis, UIElement } from '../src/vision-analyzer';

// Mock screen analysis for testing
const mockAnalysis: ScreenAnalysis = {
  currentApp: 'Spotify',
  elements: [
    {
      type: 'textbox',
      label: 'Search input field',
      location: { x: 960, y: 100, width: 300, height: 40 },
      clickable: true
    },
    {
      type: 'button',
      label: 'Play button',
      location: { x: 800, y: 600, width: 60, height: 60 },
      clickable: true
    },
    {
      type: 'item',
      label: 'Sade - Smooth Operator Playlist',
      location: { x: 400, y: 300, width: 280, height: 60 },
      clickable: true
    }
  ],
  timestamp: new Date().toISOString()
};

test('parseIntent extracts search intent', () => {
  const intent = parseIntent('search for Sade');
  
  assert.equal(intent.action, 'search');
  assert.equal(intent.target, 'Sade');
});

test('parseIntent extracts play intent', () => {
  const intent = parseIntent('play smooth operator');
  
  assert.equal(intent.action, 'play');
  assert.equal(intent.target, 'smooth operator');
});

test('parseIntent handles compound intent (search and play)', () => {
  const intent = parseIntent('search for Sade and play');
  
  assert.equal(intent.action, 'search_and_play');
  assert.equal(intent.target, 'Sade');
});

test('DecisionEngine generates click command for search box', () => {
  const engine = new DecisionEngine();
  const intent: UserIntent = { action: 'search', target: 'Sade' };
  
  const commands = engine.generateCommands(intent, mockAnalysis);
  
  assert.ok(commands.length > 0);
  const clickCommand = commands.find(c => c.primitive === 'mouse.click');
  assert.ok(clickCommand !== undefined);
  assert.equal(clickCommand!.params.x, 960);
  assert.equal(clickCommand!.params.y, 100);
});

test('DecisionEngine generates type command after click', () => {
  const engine = new DecisionEngine();
  const intent: UserIntent = { action: 'search', target: 'Sade' };
  
  const commands = engine.generateCommands(intent, mockAnalysis);
  
  const typeCommand = commands.find(c => c.primitive === 'keyboard.type');
  assert.ok(typeCommand !== undefined);
  assert.equal(typeCommand!.params.text, 'Sade');
});

test('DecisionEngine generates wait command between actions', () => {
  const engine = new DecisionEngine();
  const intent: UserIntent = { action: 'search', target: 'Sade' };
  
  const commands = engine.generateCommands(intent, mockAnalysis);
  
  const waitCommand = commands.find(c => c.primitive === 'wait');
  assert.ok(waitCommand !== undefined);
  assert.ok(waitCommand!.params.ms >= 500);
});

test('DecisionEngine finds matching element by label', () => {
  const engine = new DecisionEngine();
  
  const element = engine.findElement(mockAnalysis, 'search');
  assert.ok(element !== undefined);
  assert.ok(element!.label.toLowerCase().includes('search'));
});

test('DecisionEngine handles play intent with playlist', () => {
  const engine = new DecisionEngine();
  const intent: UserIntent = { action: 'play', target: 'Sade' };
  
  const commands = engine.generateCommands(intent, mockAnalysis);
  
  // Should click on the playlist item containing Sade
  const clickCommand = commands.find(c => c.primitive === 'mouse.click');
  assert.ok(clickCommand !== undefined);
});

test('DecisionEngine returns empty commands when element not found', () => {
  const engine = new DecisionEngine();
  const intent: UserIntent = { action: 'search', target: 'something' };
  
  const emptyAnalysis: ScreenAnalysis = {
    elements: [],
    timestamp: new Date().toISOString()
  };
  
  const commands = engine.generateCommands(intent, emptyAnalysis);
  
  // Should have an error command or be empty
  assert.ok(commands.length === 0 || commands.some(c => c.primitive === 'error'));
});
