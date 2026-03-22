/**
 * Atlas Command Bridge - GitHub Queue System
 * 
 * Receives commands from Telegram, parses them, writes to GitHub repo
 * Windows watcher script polls the repo and executes commands
 */

import { parseChainedCommand, type ParsedCommand } from '../apps/companion-service/src/command-parser.ts';
import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

export type CommandBridgeConfig = {
  repoPath: string;
  gitEmail: string;
  gitName: string;
};

export class AtlasCommandBridge {
  private repoPath: string;
  private commandCounter = 0;

  constructor(config: CommandBridgeConfig) {
    this.repoPath = config.repoPath;
    
    // Ensure repo exists
    try {
      mkdirSync(this.repoPath, { recursive: true });
    } catch (err) {
      // Already exists
    }

    // Configure git
    try {
      execSync(`git config user.email "${config.gitEmail}"`, { cwd: this.repoPath });
      execSync(`git config user.name "${config.gitName}"`, { cwd: this.repoPath });
    } catch (err) {
      // Already configured
    }
  }

  /**
   * Parse natural language command and queue it for execution
   */
  async queueCommand(text: string): Promise<{ success: boolean; message: string; commandId?: string }> {
    try {
      // Parse the command
      const parseResult = parseChainedCommand(text);
      
      if (!parseResult.success) {
        return {
          success: false,
          message: parseResult.error || 'Failed to parse command',
        };
      }

      const commands = parseResult.commands || [];
      if (commands.length === 0) {
        return {
          success: false,
          message: 'No commands parsed',
        };
      }

      // Generate command ID
      const commandId = `cmd-${Date.now()}-${++this.commandCounter}`;
      
      // Create command file
      const commandFile = {
        id: commandId,
        timestamp: new Date().toISOString(),
        text: text,
        commands: commands,
      };

      const filePath = join(this.repoPath, `${commandId}.json`);
      writeFileSync(filePath, JSON.stringify(commandFile, null, 2));

      // Commit and push to GitHub
      try {
        execSync(`git add "${commandId}.json"`, { cwd: this.repoPath });
        execSync(`git commit -m "cmd: ${text.substring(0, 50)}"`, { cwd: this.repoPath });
        execSync(`git push origin master`, { cwd: this.repoPath });
      } catch (err: any) {
        // If push fails, that's okay - watcher can pull later
        console.warn(`Git push failed: ${err.message}`);
      }

      return {
        success: true,
        message: `✅ Queued ${commands.length} command(s): ${commands.map(c => c.primitive || c.operation || c.action).join(' → ')}`,
        commandId,
      };
    } catch (err) {
      return {
        success: false,
        message: `Error: ${(err as Error).message}`,
      };
    }
  }

  /**
   * Get status - check if commands are being executed
   */
  getStatus(): { queuedCommands: number; lastCommand?: string } {
    try {
      const files = execSync(`ls -1 cmd-*.json 2>/dev/null || echo ""`, { cwd: this.repoPath }).toString().split('\n').filter(f => f);
      return {
        queuedCommands: files.length,
        lastCommand: files[0],
      };
    } catch {
      return { queuedCommands: 0 };
    }
  }
}
