import crypto from 'node:crypto';

export type ControlStatus = {
  active: boolean;
  expiresAt?: number;
  remainingMs?: number;
  tokenCount?: number;
};

/**
 * Manages time-limited control tokens for Atlas desktop control.
 * 
 * Tokens grant temporary permission to execute commands without explicit
 * user approval for each action. Tokens auto-expire after the specified
 * duration.
 */
export class ControlWindowManager {
  private tokens: Map<string, { expiresAt: number }> = new Map();

  /**
   * Grant control for a specified duration.
   * @param durationMs Duration in milliseconds
   * @returns A unique token string
   */
  grantControl(durationMs: number): string {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + durationMs;

    this.tokens.set(token, { expiresAt });

    // Schedule auto-cleanup (non-blocking)
    setTimeout(() => {
      this.tokens.delete(token);
    }, durationMs).unref();

    return token;
  }

  /**
   * Check if a token is valid and not expired.
   * @param token The control token to validate
   * @returns true if token is valid and not expired
   */
  isApproved(token?: string): boolean {
    if (!token) {
      return false;
    }

    const record = this.tokens.get(token);
    if (!record) {
      return false;
    }

    if (Date.now() > record.expiresAt) {
      // Clean up expired token
      this.tokens.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Manually revoke a specific token.
   * @param token The token to revoke
   */
  revokeControl(token: string): void {
    this.tokens.delete(token);
  }

  /**
   * Revoke all active tokens.
   */
  revokeAll(): void {
    this.tokens.clear();
  }

  /**
   * Get the current control status.
   * Returns info about the most recent active token.
   */
  getStatus(): ControlStatus {
    // Clean up expired tokens first
    this.cleanupExpired();

    if (this.tokens.size === 0) {
      return { active: false };
    }

    // Get the most recent token (last in map)
    const entries = Array.from(this.tokens.entries());
    const [, record] = entries[entries.length - 1];
    const now = Date.now();
    const remainingMs = Math.max(0, record.expiresAt - now);

    return {
      active: remainingMs > 0,
      expiresAt: record.expiresAt,
      remainingMs,
      tokenCount: this.tokens.size,
    };
  }

  /**
   * Clean up all expired tokens from the map.
   */
  private cleanupExpired(): void {
    const now = Date.now();
    for (const [token, record] of this.tokens) {
      if (now > record.expiresAt) {
        this.tokens.delete(token);
      }
    }
  }
}
