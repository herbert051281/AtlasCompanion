import { ControlWindowManager } from './control-window.ts';

/**
 * Actions that are safe to auto-approve when a valid control token exists.
 * These are basic input primitives that don't have persistent system effects.
 */
const SAFE_ACTIONS = new Set([
  'mouse.move',
  'mouse.click',
  'mouse.drag',
  'keyboard.type',
  'keyboard.hotkey',
  'keyboard.press',
]);

/**
 * Actions that are risky and always require explicit user confirmation,
 * even with a valid control token. These have persistent effects.
 */
const RISKY_ACTIONS = new Set([
  'app.launch',
  'app.close',
  'window.minimize',
  'window.maximize',
  'window.close',
  'file.delete',
  'file.write',
  'system.shutdown',
  'system.restart',
]);

export type ApprovalDecision = {
  approved: boolean;
  reason: string;
  requiresUserConfirm?: boolean;
};

export type ApprovalLogEntry = {
  timestamp: number;
  action: string;
  approved: boolean;
  reason: string;
  token?: string;
};

/**
 * Engine for deciding whether actions should be auto-approved or require
 * explicit user confirmation. Integrates with ControlWindowManager to
 * check token validity.
 */
export class ApprovalEngine {
  private approvalLog: ApprovalLogEntry[] = [];

  constructor(private controlWindow: ControlWindowManager) {}

  /**
   * Determine if an action should be approved.
   * 
   * - Safe actions: auto-approve if valid control token exists
   * - Risky actions: always require explicit user confirmation
   * - Unknown actions: rejected
   * 
   * @param action The action identifier (e.g., 'mouse.move', 'app.launch')
   * @param controlToken Optional control token from ControlWindowManager
   * @returns ApprovalDecision with approved status and reason
   */
  shouldApprove(action: string, controlToken?: string): ApprovalDecision {
    const isSafe = SAFE_ACTIONS.has(action);
    const isRisky = RISKY_ACTIONS.has(action);

    // Safe actions: auto-approve if token is valid
    if (isSafe) {
      if (controlToken && this.controlWindow.isApproved(controlToken)) {
        this.log(action, true, 'auto-approved (safe action with valid token)', controlToken);
        return { 
          approved: true, 
          reason: 'auto-approved (safe action)' 
        };
      } else {
        this.log(action, false, 'requires explicit user approval (no valid token)', controlToken);
        return {
          approved: false,
          reason: 'requires explicit user approval (no valid control token)',
          requiresUserConfirm: true,
        };
      }
    }

    // Risky actions: always require explicit approval
    if (isRisky) {
      this.log(action, false, `risky action (${action}) requires explicit approval`, controlToken);
      return {
        approved: false,
        reason: `risky action (${action}) requires explicit user approval`,
        requiresUserConfirm: true,
      };
    }

    // Unknown action: reject
    this.log(action, false, 'unknown action', controlToken);
    return {
      approved: false,
      reason: `unknown action (${action})`,
    };
  }

  /**
   * Log an approval decision for auditing.
   */
  private log(
    action: string,
    approved: boolean,
    reason: string,
    token?: string
  ): void {
    this.approvalLog.push({
      timestamp: Date.now(),
      action,
      approved,
      reason,
      token,
    });
  }

  /**
   * Get the approval history, optionally limited to the most recent entries.
   * @param limit Maximum number of entries to return (from most recent)
   */
  getApprovalHistory(limit: number = 100): ApprovalLogEntry[] {
    return this.approvalLog.slice(-limit);
  }

  /**
   * Clear all approval history.
   */
  clearHistory(): void {
    this.approvalLog = [];
  }

  /**
   * Get statistics about approval decisions.
   */
  getStats(): {
    totalDecisions: number;
    autoApproved: number;
    rejected: number;
    pendingUserConfirm: number;
  } {
    let autoApproved = 0;
    let rejected = 0;
    let pendingUserConfirm = 0;

    for (const entry of this.approvalLog) {
      if (entry.approved) {
        autoApproved++;
      } else {
        rejected++;
      }
    }

    return {
      totalDecisions: this.approvalLog.length,
      autoApproved,
      rejected,
      pendingUserConfirm,
    };
  }
}
