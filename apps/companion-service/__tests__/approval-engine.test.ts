import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ApprovalEngine } from '../src/approval-engine.ts';
import { ControlWindowManager } from '../src/control-window.ts';

describe('Approval Engine', () => {
  let engine: ApprovalEngine;
  let controlManager: ControlWindowManager;

  beforeEach(() => {
    controlManager = new ControlWindowManager();
    engine = new ApprovalEngine(controlManager);
  });

  describe('shouldApprove - safe actions', () => {
    it('should auto-approve safe primitives with valid token', () => {
      const token = controlManager.grantControl(300000);
      const result = engine.shouldApprove('mouse.move', token);
      
      assert.strictEqual(result.approved, true);
      assert.ok(result.reason.includes('auto'), 'reason should include "auto"');
    });

    it('should auto-approve mouse.click with valid token', () => {
      const token = controlManager.grantControl(300000);
      const result = engine.shouldApprove('mouse.click', token);
      
      assert.strictEqual(result.approved, true);
    });

    it('should auto-approve keyboard.type with valid token', () => {
      const token = controlManager.grantControl(300000);
      const result = engine.shouldApprove('keyboard.type', token);
      
      assert.strictEqual(result.approved, true);
    });

    it('should auto-approve keyboard.hotkey with valid token', () => {
      const token = controlManager.grantControl(300000);
      const result = engine.shouldApprove('keyboard.hotkey', token);
      
      assert.strictEqual(result.approved, true);
    });
  });

  describe('shouldApprove - risky actions', () => {
    it('should require explicit approval for app.launch', () => {
      const token = controlManager.grantControl(300000);
      const result = engine.shouldApprove('app.launch', token);
      
      assert.strictEqual(result.approved, false);
      assert.ok(result.reason.includes('risky'), 'reason should mention risky');
      assert.strictEqual(result.requiresUserConfirm, true);
    });

    it('should require explicit approval for app.close', () => {
      const token = controlManager.grantControl(300000);
      const result = engine.shouldApprove('app.close', token);
      
      assert.strictEqual(result.approved, false);
      assert.strictEqual(result.requiresUserConfirm, true);
    });

    it('should require explicit approval for window.minimize', () => {
      const token = controlManager.grantControl(300000);
      const result = engine.shouldApprove('window.minimize', token);
      
      assert.strictEqual(result.approved, false);
      assert.strictEqual(result.requiresUserConfirm, true);
    });
  });

  describe('shouldApprove - no token', () => {
    it('should reject safe primitives without valid token', () => {
      const result = engine.shouldApprove('mouse.click', undefined);
      
      assert.strictEqual(result.approved, false);
      assert.ok(result.reason.includes('approval'), 'reason should mention approval');
      assert.strictEqual(result.requiresUserConfirm, true);
    });

    it('should reject with empty token', () => {
      const result = engine.shouldApprove('mouse.move', '');
      
      assert.strictEqual(result.approved, false);
    });

    it('should reject with invalid token', () => {
      const result = engine.shouldApprove('keyboard.type', 'fake-token-123');
      
      assert.strictEqual(result.approved, false);
    });
  });

  describe('shouldApprove - unknown actions', () => {
    it('should reject completely unknown actions', () => {
      const token = controlManager.grantControl(300000);
      const result = engine.shouldApprove('unknown.action', token);
      
      assert.strictEqual(result.approved, false);
      assert.ok(result.reason.includes('unknown'), 'reason should mention unknown');
    });
  });

  describe('approval history', () => {
    it('should log approval decisions', () => {
      const token = controlManager.grantControl(300000);
      engine.shouldApprove('mouse.move', token);

      const history = engine.getApprovalHistory();
      assert.strictEqual(history.length, 1);
      assert.strictEqual(history[0].action, 'mouse.move');
      assert.strictEqual(history[0].approved, true);
    });

    it('should log multiple decisions in order', () => {
      const token = controlManager.grantControl(300000);
      engine.shouldApprove('mouse.move', token);
      engine.shouldApprove('app.launch', token);
      engine.shouldApprove('keyboard.type', token);

      const history = engine.getApprovalHistory();
      assert.strictEqual(history.length, 3);
      assert.strictEqual(history[0].action, 'mouse.move');
      assert.strictEqual(history[1].action, 'app.launch');
      assert.strictEqual(history[2].action, 'keyboard.type');
    });

    it('should include timestamps in history', () => {
      const token = controlManager.grantControl(300000);
      const beforeTime = Date.now();
      engine.shouldApprove('mouse.move', token);
      const afterTime = Date.now();

      const history = engine.getApprovalHistory();
      assert.ok(history[0].timestamp >= beforeTime, 'timestamp should be >= beforeTime');
      assert.ok(history[0].timestamp <= afterTime, 'timestamp should be <= afterTime');
    });

    it('should respect limit parameter', () => {
      const token = controlManager.grantControl(300000);
      for (let i = 0; i < 10; i++) {
        engine.shouldApprove('mouse.move', token);
      }

      const limited = engine.getApprovalHistory(5);
      assert.strictEqual(limited.length, 5);
    });

    it('should clear history', () => {
      const token = controlManager.grantControl(300000);
      engine.shouldApprove('mouse.move', token);
      engine.shouldApprove('mouse.click', token);
      
      assert.strictEqual(engine.getApprovalHistory().length, 2);
      
      engine.clearHistory();
      
      assert.strictEqual(engine.getApprovalHistory().length, 0);
    });
  });

  describe('edge cases', () => {
    it('should handle case-sensitive action names', () => {
      const token = controlManager.grantControl(300000);
      
      // Exact case should work
      const result1 = engine.shouldApprove('mouse.move', token);
      assert.strictEqual(result1.approved, true);
      
      // Different case should fail (unknown)
      const result2 = engine.shouldApprove('Mouse.Move', token);
      assert.strictEqual(result2.approved, false);
    });

    it('should handle expired tokens', async () => {
      const token = controlManager.grantControl(50); // 50ms
      
      // Valid at first
      const result1 = engine.shouldApprove('mouse.move', token);
      assert.strictEqual(result1.approved, true);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Expired now
      const result2 = engine.shouldApprove('mouse.move', token);
      assert.strictEqual(result2.approved, false);
    });

    it('should handle revoked tokens', () => {
      const token = controlManager.grantControl(300000);
      
      // Valid at first
      const result1 = engine.shouldApprove('mouse.move', token);
      assert.strictEqual(result1.approved, true);
      
      controlManager.revokeControl(token);
      
      // Revoked now
      const result2 = engine.shouldApprove('mouse.move', token);
      assert.strictEqual(result2.approved, false);
    });
  });
});
