// apps/companion-service/src/atlas-handler.ts
// Atlas Command Handler - Wires NLP parsing, control window, and execution
// Task 7: Natural language desktop control integration

import { parseChainedCommand, type ParsedCommand } from './command-parser.ts';
import { CommandExecutor, type ExecutionResult } from './executor.ts';
import { CompanionClient } from './companion-client.ts';
import crypto from 'node:crypto';

export type AtlasHandlerOptions = {
  companionServiceUrl: string;
  controlWindowDefaultMs?: number;
};

export type AtlasHandlerResponse = {
  text: string;
  controlToken?: string;
  success: boolean;
};

type ControlToken = {
  token: string;
  expiresAt: number;
};

/**
 * AtlasHandler - Main entry point for natural language command execution
 * 
 * Responsibilities:
 * - Parse natural language commands into primitives/operations
 * - Manage control window (grant/revoke/status)
 * - Execute commands through the companion service
 * - Provide human-readable responses
 */
export class AtlasHandler {
  private client: CompanionClient;
  private defaultControlWindowMs: number;
  private activeTokens: Map<string, ControlToken> = new Map();

  constructor(options: AtlasHandlerOptions) {
    this.client = new CompanionClient(options.companionServiceUrl);
    this.defaultControlWindowMs = options.controlWindowDefaultMs ?? 300000; // 5 min default
  }

  /**
   * Handle a natural language command from Atlas (via Telegram)
   */
  async handle(text: string, controlToken?: string): Promise<AtlasHandlerResponse> {
    const trimmed = text.trim().toLowerCase();

    // Check for control commands first (handled locally, not sent to service)
    if (this.isControlCommand(trimmed)) {
      return this.handleControlCommand(trimmed, controlToken);
    }

    // Parse the natural language command (supports chained commands like "move to X,Y, click")
    const parseResult = parseChainedCommand(text);
    if (!parseResult.success) {
      return {
        text: parseResult.error || "I didn't understand that command.",
        success: false,
      };
    }

    const commands = parseResult.commands || [];
    if (commands.length === 0) {
      return {
        text: "No commands to execute.",
        success: false,
      };
    }

    // Check if control is granted (for non-control commands)
    const hasControl = this.isControlValid(controlToken);
    if (!hasControl) {
      // Auto-suggest granting control
      return {
        text: '🔒 Control not granted. Say "grant control" first to enable command execution.',
        success: false,
      };
    }

    // Execute the commands
    try {
      const executor = new CommandExecutor(this.client);
      const result = await executor.execute(commands);

      return this.formatExecutionResult(result, commands);
    } catch (err) {
      return {
        text: `❌ Execution error: ${(err as Error).message}`,
        success: false,
      };
    }
  }

  /**
   * Check if text is a control command
   */
  private isControlCommand(text: string): boolean {
    return (
      text.startsWith('grant control') ||
      text === 'grant' ||
      text === 'revoke control' ||
      text === 'revoke' ||
      text === 'control status' ||
      text === 'status'
    );
  }

  /**
   * Handle control-related commands (grant/revoke/status)
   */
  private handleControlCommand(text: string, currentToken?: string): AtlasHandlerResponse {
    // Grant control
    if (text.startsWith('grant control') || text === 'grant') {
      const durationMs = this.parseControlDuration(text) || this.defaultControlWindowMs;
      const token = this.grantControl(durationMs);
      const minutes = Math.round(durationMs / 60000);

      return {
        text: `🔓 Control granted for ${minutes} minute${minutes === 1 ? '' : 's'}. You can now execute commands.`,
        controlToken: token,
        success: true,
      };
    }

    // Revoke control
    if (text === 'revoke control' || text === 'revoke') {
      if (currentToken) {
        this.revokeControl(currentToken);
      } else {
        this.revokeAllControl();
      }

      return {
        text: '🔒 Control revoked. Commands are now disabled.',
        success: true,
      };
    }

    // Status
    if (text === 'control status' || text === 'status') {
      const status = this.getControlStatus();
      if (status.active) {
        const minutes = Math.ceil((status.remainingMs || 0) / 60000);
        return {
          text: `🟢 Control ACTIVE (${minutes} min remaining)`,
          success: true,
        };
      }

      return {
        text: '🔴 Control INACTIVE. Say "grant control" to activate.',
        success: true,
      };
    }

    return {
      text: 'Unknown control command.',
      success: false,
    };
  }

  /**
   * Parse duration from "grant control for X minutes/hours"
   */
  private parseControlDuration(text: string): number | null {
    const match = text.match(/for\s+(\d+)\s*(min|minute|minutes|hour|hours|hr|hrs)/i);
    if (!match) {
      return null;
    }

    const value = parseInt(match[1]);
    const unit = match[2].toLowerCase();

    if (unit.startsWith('hour') || unit.startsWith('hr')) {
      return value * 60 * 60 * 1000;
    }

    return value * 60 * 1000;
  }

  /**
   * Grant control and return a token
   */
  private grantControl(durationMs: number): string {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + durationMs;

    this.activeTokens.set(token, { token, expiresAt });

    // Auto-cleanup after expiry
    setTimeout(() => {
      this.activeTokens.delete(token);
    }, durationMs);

    return token;
  }

  /**
   * Check if a control token is valid
   */
  private isControlValid(token?: string): boolean {
    if (!token) {
      return false;
    }

    const record = this.activeTokens.get(token);
    if (!record) {
      return false;
    }

    if (Date.now() > record.expiresAt) {
      this.activeTokens.delete(token);
      return false;
    }

    return true;
  }

  /**
   * Revoke a specific control token
   */
  private revokeControl(token: string): void {
    this.activeTokens.delete(token);
  }

  /**
   * Revoke all control tokens
   */
  private revokeAllControl(): void {
    this.activeTokens.clear();
  }

  /**
   * Get control status
   */
  private getControlStatus(): { active: boolean; remainingMs?: number } {
    if (this.activeTokens.size === 0) {
      return { active: false };
    }

    // Get the most recent active token
    let mostRecent: ControlToken | null = null;
    for (const record of this.activeTokens.values()) {
      if (Date.now() < record.expiresAt) {
        if (!mostRecent || record.expiresAt > mostRecent.expiresAt) {
          mostRecent = record;
        }
      }
    }

    if (!mostRecent) {
      return { active: false };
    }

    return {
      active: true,
      remainingMs: mostRecent.expiresAt - Date.now(),
    };
  }

  /**
   * Format execution result into human-readable response
   */
  private formatExecutionResult(
    result: ExecutionResult,
    commands: ParsedCommand[]
  ): AtlasHandlerResponse {
    if (!result.success) {
      const errorSummary = result.errors?.join('; ') || 'Unknown error';
      return {
        text: `❌ Execution failed: ${errorSummary}`,
        success: false,
      };
    }

    // Build success message
    const count = result.results?.length || 0;
    const summary = result.summary;

    if (count === 1) {
      const cmd = commands[0];
      const action = cmd.primitive || cmd.operation || cmd.action || 'command';
      return {
        text: `✅ Executed: ${action}`,
        success: true,
      };
    }

    if (summary) {
      return {
        text: `✅ Executed ${summary.succeeded}/${summary.total} command${summary.total === 1 ? '' : 's'} (${summary.totalDurationMs}ms)`,
        success: true,
      };
    }

    return {
      text: `✅ Executed ${count} command${count === 1 ? '' : 's'} successfully.`,
      success: true,
    };
  }
}
