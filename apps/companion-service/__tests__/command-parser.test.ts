import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCommand } from '../src/command-parser.ts';

describe('Command Parser', () => {
  describe('Mouse primitives', () => {
    it('should parse "move mouse to X,Y"', () => {
      const cmd = 'move mouse to 500,300';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.commands?.length, 1);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        primitive: 'mouse.move',
        params: { x: 500, y: 300 },
      });
    });

    it('should parse "click at X,Y"', () => {
      const cmd = 'click at 500,300';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.commands?.length, 1);
      assert.strictEqual(result.commands![0].primitive, 'mouse.click');
      assert.deepStrictEqual(result.commands![0].params, { x: 500, y: 300, button: 'left' });
    });

    it('should parse "right click at X,Y"', () => {
      const cmd = 'right click at 100,100';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        primitive: 'mouse.click',
        params: { x: 100, y: 100, button: 'right' },
      });
    });

    it('should parse "double click at X,Y"', () => {
      const cmd = 'double click at 250,250';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        primitive: 'mouse.click',
        params: { x: 250, y: 250, clickCount: 2, button: 'left' },
      });
    });

    it('should parse "click" without coordinates (current position)', () => {
      const cmd = 'click';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        primitive: 'mouse.click',
        params: { button: 'left' },
      });
    });
  });

  describe('Keyboard primitives', () => {
    it('should parse "type hello world"', () => {
      const cmd = 'type hello world';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.commands?.length, 1);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        primitive: 'keyboard.type',
        params: { text: 'hello world' },
      });
    });

    it('should parse "press Ctrl+A"', () => {
      const cmd = 'press Ctrl+A';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        primitive: 'keyboard.hotkey',
        params: { hotkey: '^a' },
      });
    });

    it('should parse "press Alt+Tab"', () => {
      const cmd = 'press Alt+Tab';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        primitive: 'keyboard.hotkey',
        params: { hotkey: '!{Tab}' },
      });
    });

    it('should parse "press Win+D"', () => {
      const cmd = 'press Win+D';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        primitive: 'keyboard.hotkey',
        params: { hotkey: '#{d}' },
      });
    });

    it('should parse "press Enter"', () => {
      const cmd = 'press Enter';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        primitive: 'keyboard.hotkey',
        params: { hotkey: '{Enter}' },
      });
    });
  });

  describe('Error handling', () => {
    it('should reject unrecognized commands', () => {
      const cmd = 'do something magical';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, false);
      assert.ok(result.error);
    });

    it('should reject missing coordinates for move', () => {
      const cmd = 'move mouse to nowhere';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('coordinate'));
    });

    it('should reject click at invalid coordinates', () => {
      const cmd = 'click at abc,def';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('coordinate'));
    });
  });
});
