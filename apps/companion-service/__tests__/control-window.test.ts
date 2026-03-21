import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { ControlWindowManager } from '../src/control-window.ts';

describe('Control Window Manager', () => {
  let manager: ControlWindowManager;

  beforeEach(() => {
    manager = new ControlWindowManager();
  });

  describe('grantControl', () => {
    it('should grant control and return a token', () => {
      const token = manager.grantControl(300000); // 5 min
      assert.ok(token, 'token should be truthy');
      assert.strictEqual(typeof token, 'string');
    });

    it('should return different tokens for multiple grants', () => {
      const token1 = manager.grantControl(300000);
      const token2 = manager.grantControl(300000);
      assert.notStrictEqual(token1, token2);
    });

    it('should generate tokens of appropriate length', () => {
      const token = manager.grantControl(300000);
      // 16 bytes -> 32 hex chars
      assert.strictEqual(token.length, 32);
    });
  });

  describe('isApproved', () => {
    it('should validate a valid token', () => {
      const token = manager.grantControl(300000);
      assert.strictEqual(manager.isApproved(token), true);
    });

    it('should reject an invalid token', () => {
      const token = 'invalid-token-xyz';
      assert.strictEqual(manager.isApproved(token), false);
    });

    it('should reject undefined token', () => {
      assert.strictEqual(manager.isApproved(undefined), false);
    });

    it('should reject empty string token', () => {
      assert.strictEqual(manager.isApproved(''), false);
    });

    it('should expire token after duration', async () => {
      const token = manager.grantControl(100); // 100ms
      assert.strictEqual(manager.isApproved(token), true);

      await new Promise(resolve => setTimeout(resolve, 150));
      assert.strictEqual(manager.isApproved(token), false);
    });
  });

  describe('revokeControl', () => {
    it('should support manual revocation', () => {
      const token = manager.grantControl(300000);
      assert.strictEqual(manager.isApproved(token), true);

      manager.revokeControl(token);
      assert.strictEqual(manager.isApproved(token), false);
    });

    it('should handle revocation of non-existent token gracefully', () => {
      // Should not throw
      assert.doesNotThrow(() => manager.revokeControl('non-existent-token'));
    });
  });

  describe('revokeAll', () => {
    it('should revoke all active tokens', () => {
      const token1 = manager.grantControl(300000);
      const token2 = manager.grantControl(300000);
      
      assert.strictEqual(manager.isApproved(token1), true);
      assert.strictEqual(manager.isApproved(token2), true);

      manager.revokeAll();

      assert.strictEqual(manager.isApproved(token1), false);
      assert.strictEqual(manager.isApproved(token2), false);
    });
  });

  describe('getStatus', () => {
    it('should report inactive when no tokens', () => {
      const status = manager.getStatus();
      assert.strictEqual(status.active, false);
      assert.strictEqual(status.expiresAt, undefined);
      assert.strictEqual(status.remainingMs, undefined);
    });

    it('should report active status with valid token', () => {
      const token = manager.grantControl(300000);
      const status = manager.getStatus();
      
      assert.strictEqual(status.active, true);
      assert.ok(status.expiresAt, 'expiresAt should be truthy');
      assert.ok(status.remainingMs! > 0, 'remainingMs should be > 0');
      assert.ok(status.remainingMs! <= 300000, 'remainingMs should be <= 300000');
    });

    it('should track multiple tokens', () => {
      manager.grantControl(300000);
      manager.grantControl(300000);
      
      const status = manager.getStatus();
      assert.strictEqual(status.tokenCount, 2);
    });

    it('should report inactive after all tokens expire', async () => {
      manager.grantControl(50);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      const status = manager.getStatus();
      assert.strictEqual(status.active, false);
    });
  });

  describe('edge cases', () => {
    it('should handle very short durations', async () => {
      const token = manager.grantControl(1); // 1ms
      // Token may or may not be valid depending on timing
      await new Promise(resolve => setTimeout(resolve, 10));
      assert.strictEqual(manager.isApproved(token), false);
    });

    it('should handle long durations', () => {
      const token = manager.grantControl(3600000); // 1 hour
      assert.strictEqual(manager.isApproved(token), true);
      
      const status = manager.getStatus();
      assert.ok(status.remainingMs! > 3599000, 'remainingMs should be > 3599000');
    });

    it('should clean up expired tokens on access', async () => {
      const token = manager.grantControl(50);
      
      await new Promise(resolve => setTimeout(resolve, 100));
      
      // Access should trigger cleanup
      manager.isApproved(token);
      
      const status = manager.getStatus();
      assert.strictEqual(status.active, false);
    });
  });
});
