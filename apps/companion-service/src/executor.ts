// apps/companion-service/src/executor.ts
// Command Executor for Atlas Companion
// Executes parsed commands sequentially with approval checking

import { CompanionClient, type CommandResult } from './companion-client.ts';
import type { ParsedCommand } from './command-parser.ts';

export type ExecutionOptions = {
  stopOnError?: boolean;   // Stop execution on first error (default: false)
  dryRun?: boolean;        // Don't actually execute, just validate (default: false)
};

export type CommandExecution = {
  command: ParsedCommand;
  result: CommandResult;
  durationMs: number;
};

export type ExecutionSummary = {
  total: number;
  succeeded: number;
  failed: number;
  skipped: number;
  totalDurationMs: number;
};

export type ExecutionResult = {
  success: boolean;
  results?: CommandExecution[];
  errors?: string[];
  controlRequested?: {
    action: 'grant' | 'revoke';
    durationMs?: number;
  };
  summary?: ExecutionSummary;
};

export class CommandExecutor {
  constructor(
    private client: CompanionClient,
    private sessionToken?: string
  ) {}

  /**
   * Execute a list of parsed commands sequentially
   */
  async execute(
    commands: ParsedCommand[],
    options?: ExecutionOptions
  ): Promise<ExecutionResult> {
    const stopOnError = options?.stopOnError ?? false;
    const dryRun = options?.dryRun ?? false;

    const results: CommandExecution[] = [];
    const errors: string[] = [];
    let controlRequested: ExecutionResult['controlRequested'];

    const startTime = Date.now();

    for (const cmd of commands) {
      const cmdStartTime = Date.now();

      try {
        // Handle control commands specially
        if (cmd.type === 'control') {
          controlRequested = {
            action: cmd.action as 'grant' | 'revoke',
            durationMs: cmd.params.durationMs as number | undefined,
          };

          // Control commands don't execute through the client
          // They're handled at a higher level (Atlas handler)
          results.push({
            command: cmd,
            result: { code: 0, stdout: `Control ${cmd.action} requested`, stderr: '' },
            durationMs: Date.now() - cmdStartTime,
          });
          continue;
        }

        // Handle wait commands locally
        if (cmd.action === 'wait') {
          const waitMs = (cmd.params.ms as number) || 0;
          if (!dryRun && waitMs > 0) {
            await this.sleep(waitMs);
          }
          results.push({
            command: cmd,
            result: { code: 0, stdout: `Waited ${waitMs}ms`, stderr: '' },
            durationMs: Date.now() - cmdStartTime,
          });
          continue;
        }

        // Dry run: don't execute, just record
        if (dryRun) {
          results.push({
            command: cmd,
            result: { code: 0, stdout: '[dry-run] Would execute', stderr: '' },
            durationMs: 0,
          });
          continue;
        }

        // Execute primitives
        if (cmd.type === 'primitive' && cmd.primitive) {
          const result = await this.client.executePrimitive(
            cmd.primitive,
            cmd.params,
            true // approved
          );

          results.push({
            command: cmd,
            result,
            durationMs: Date.now() - cmdStartTime,
          });

          if (result.code !== 0) {
            const errorMsg = `Primitive ${cmd.primitive} failed: ${result.stderr || 'unknown error'}`;
            errors.push(errorMsg);
            if (stopOnError) {
              break;
            }
          }
          continue;
        }

        // Execute operations
        if (cmd.type === 'operation' && cmd.operation) {
          const result = await this.client.executeOperation(
            cmd.operation,
            cmd.params,
            true // approved
          );

          results.push({
            command: cmd,
            result,
            durationMs: Date.now() - cmdStartTime,
          });

          if (result.code !== 0) {
            const errorMsg = `Operation ${cmd.operation} failed: ${result.stderr || 'unknown error'}`;
            errors.push(errorMsg);
            if (stopOnError) {
              break;
            }
          }
          continue;
        }

        // Unknown command type
        errors.push(`Unknown command type: ${JSON.stringify(cmd)}`);
        if (stopOnError) {
          break;
        }
      } catch (err) {
        const errorMsg = `Command execution error: ${(err as Error).message}`;
        errors.push(errorMsg);
        
        results.push({
          command: cmd,
          result: { code: 1, stdout: '', stderr: errorMsg },
          durationMs: Date.now() - cmdStartTime,
        });

        if (stopOnError) {
          break;
        }
      }
    }

    const totalDurationMs = Date.now() - startTime;

    // Build summary
    const succeeded = results.filter(r => r.result.code === 0).length;
    const failed = results.filter(r => r.result.code !== 0).length;
    const skipped = commands.length - results.length;

    const summary: ExecutionSummary = {
      total: commands.length,
      succeeded,
      failed,
      skipped,
      totalDurationMs,
    };

    return {
      success: errors.length === 0,
      results,
      errors: errors.length > 0 ? errors : undefined,
      controlRequested,
      summary,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
