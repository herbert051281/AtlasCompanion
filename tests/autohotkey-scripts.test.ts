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
