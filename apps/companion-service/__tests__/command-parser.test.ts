import { describe, it } from 'node:test';
import assert from 'node:assert';
import { parseCommand, parseChainedCommand } from '../src/command-parser.ts';

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

  describe('App/Window operations', () => {
    it('should parse "open Notepad"', () => {
      const cmd = 'open Notepad';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'operation',
        operation: 'app.launch',
        params: { appPath: 'notepad.exe' },
      });
    });

    it('should parse "open Chrome"', () => {
      const cmd = 'open Chrome';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'operation',
        operation: 'app.launch',
        params: { appPath: 'chrome.exe' },
      });
    });

    it('should parse "focus Chrome"', () => {
      const cmd = 'focus Chrome';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'operation',
        operation: 'window.focus',
        params: { windowTitle: 'Chrome' },
      });
    });

    it('should parse "list windows"', () => {
      const cmd = 'list windows';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'operation',
        operation: 'window.list',
        params: {},
      });
    });

    it('should parse "close Chrome"', () => {
      const cmd = 'close Chrome';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'operation',
        operation: 'app.close',
        params: { windowTitle: 'Chrome' },
      });
    });

    it('should parse "minimize this window"', () => {
      const cmd = 'minimize window';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'operation',
        operation: 'window.minimize',
        params: {},
      });
    });

    it('should parse "wait 2s" or "wait 2 seconds"', () => {
      const cmd = 'wait 2s';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'primitive',
        action: 'wait',
        params: { ms: 2000 },
      });
    });
  });

  describe('Command chaining', () => {
    it('should parse sequential commands separated by comma', () => {
      const cmd = 'open Notepad, wait 2s, type hello';
      const result = parseChainedCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.commands?.length, 3);
      assert.strictEqual(result.commands![0].operation, 'app.launch');
      assert.strictEqual(result.commands![1].action, 'wait');
      assert.strictEqual(result.commands![2].primitive, 'keyboard.type');
    });

    it('should parse commands separated by "then"', () => {
      const cmd = 'move mouse to 500,300 then click';
      const result = parseChainedCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.commands?.length, 2);
      assert.strictEqual(result.commands![0].primitive, 'mouse.move');
      assert.strictEqual(result.commands![1].primitive, 'mouse.click');
    });

    it('should handle "and" as a separator', () => {
      const cmd = 'click at 100,100 and type hello';
      const result = parseChainedCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.strictEqual(result.commands?.length, 2);
      assert.strictEqual(result.commands![0].primitive, 'mouse.click');
      assert.strictEqual(result.commands![1].primitive, 'keyboard.type');
    });

    it('should fail if any command in chain is invalid', () => {
      const cmd = 'click at 100,100, do magic, type hello';
      const result = parseChainedCommand(cmd);

      assert.strictEqual(result.success, false);
      assert.ok(result.error?.includes('magic') || result.error);
    });
  });

  describe('Control commands', () => {
    it('should parse "grant control"', () => {
      const cmd = 'grant control';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'control',
        action: 'grant',
        params: { durationMs: 300000 }, // 5 min default
      });
    });

    it('should parse "grant control for 10 minutes"', () => {
      const cmd = 'grant control for 10 minutes';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'control',
        action: 'grant',
        params: { durationMs: 600000 },
      });
    });

    it('should parse "revoke control"', () => {
      const cmd = 'revoke control';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'control',
        action: 'revoke',
        params: {},
      });
    });

    it('should parse "control status"', () => {
      const cmd = 'control status';
      const result = parseCommand(cmd);

      assert.strictEqual(result.success, true);
      assert.deepStrictEqual(result.commands![0], {
        type: 'control',
        action: 'status',
        params: {},
      });
    });
  });
});
