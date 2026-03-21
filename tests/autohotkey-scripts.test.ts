import test from 'node:test';
import assert from 'node:assert/strict';
import { createAutoHotkeyScriptManager } from '../apps/companion-service/src/autohotkey-scripts/index.ts';

const scriptsRoot = `${process.cwd()}/apps/companion-service/src/autohotkey-scripts`;

test('AutoHotkey Script Manager - should register built-in primitives', () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
  });

  const primitives = manager.listPrimitives();
  assert.ok(primitives.includes('mouse.move'), 'should include mouse.move');
  assert.ok(primitives.includes('mouse.click'), 'should include mouse.click');
  assert.ok(primitives.includes('keyboard.type'), 'should include keyboard.type');
});

test('AutoHotkey Script Manager - should validate primitive parameters before execution', () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
  });

  // Negative coordinates should throw
  assert.throws(
    () => manager.validate('mouse.move', { x: -1, y: 100, approved: false }),
    /invalid coordinates/i,
  );
});

test('AutoHotkey Script Manager - should refuse execution without approval flag', async () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
  });

  const result = await manager.execute('mouse.move', { x: 100, y: 100, approved: false });
  assert.notEqual(result.code, 0, 'should not succeed without approval');
  assert.ok(result.stderr.includes('approval required'), 'stderr should mention approval');
});

test('AutoHotkey Script Manager - should execute mouse.move with approval (mocked)', async () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
    // Use mock mode for testing without actual AutoHotkey
    mockExecution: true,
  });

  const result = await manager.execute('mouse.move', { x: 500, y: 300, approved: true });
  assert.equal(result.code, 0, 'should succeed with approval');
});

test('AutoHotkey Script Manager - should reject unknown primitives', () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
  });

  assert.throws(
    () => manager.validate('mouse.invalid', { approved: true }),
    /unknown primitive/i,
  );
});

// ============================================================
// Task 2: Mouse primitives integration tests
// ============================================================

test('Mouse primitives - should move mouse to screen coordinates', async () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
    mockExecution: true,
  });

  const result = await manager.execute('mouse.move', {
    x: 512,
    y: 384,
    approved: true,
  });
  assert.equal(result.code, 0, 'should succeed');
  assert.ok(result.stdout.includes('mouse.move'), 'should reference mouse.move');
});

test('Mouse primitives - should click at coordinates', async () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
    mockExecution: true,
  });

  const result = await manager.execute('mouse.click', {
    button: 'left',
    x: 512,
    y: 384,
    clickCount: 1,
    approved: true,
  });
  assert.equal(result.code, 0, 'should succeed');
});

test('Mouse primitives - should double-click', async () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
    mockExecution: true,
  });

  const result = await manager.execute('mouse.click', {
    button: 'left',
    x: 512,
    y: 384,
    clickCount: 2,
    approved: true,
  });
  assert.equal(result.code, 0, 'should succeed');
});

test('Mouse primitives - should validate click button parameter', () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
  });

  // Should throw for missing required 'button' param
  assert.throws(
    () => manager.validate('mouse.click', { approved: true }),
    /missing required parameter: button/i,
  );
});

test('Mouse primitives - should handle drag operation', async () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
    mockExecution: true,
  });

  const result = await manager.execute('mouse.drag', {
    button: 'left',
    x1: 100,
    y1: 100,
    x2: 500,
    y2: 500,
    approved: true,
  });
  assert.equal(result.code, 0, 'drag should succeed');
});

// ============================================================
// Task 3: Keyboard primitives integration tests
// ============================================================

test('Keyboard primitives - should type text', async () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
    mockExecution: true,
  });

  const result = await manager.execute('keyboard.type', {
    text: 'hello world',
    approved: true,
  });
  assert.equal(result.code, 0, 'should succeed');
  assert.ok(result.stdout.includes('keyboard.type'), 'should reference keyboard.type');
});

test('Keyboard primitives - should send hotkey combos (Ctrl+A)', async () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
    mockExecution: true,
  });

  const result = await manager.execute('keyboard.hotkey', {
    hotkey: '^a',
    approved: true,
  });
  assert.equal(result.code, 0, 'should succeed');
});

test('Keyboard primitives - should send Alt+Tab', async () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
    mockExecution: true,
  });

  const result = await manager.execute('keyboard.hotkey', {
    hotkey: '!{Tab}',
    approved: true,
  });
  assert.equal(result.code, 0, 'should succeed');
});

test('Keyboard primitives - should validate text parameter', () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
  });

  // Should throw for missing required 'text' param
  assert.throws(
    () => manager.validate('keyboard.type', { approved: true }),
    /missing required parameter: text/i,
  );
});

test('Keyboard primitives - should validate hotkey parameter', () => {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot,
    ahkExecutable: 'AutoHotkey64.exe',
  });

  // Should throw for missing required 'hotkey' param
  assert.throws(
    () => manager.validate('keyboard.hotkey', { approved: true }),
    /missing required parameter: hotkey/i,
  );
});
