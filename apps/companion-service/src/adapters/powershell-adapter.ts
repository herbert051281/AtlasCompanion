import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type PowerShellExecutor = (input: { command: string; timeoutMs: number }) => Promise<CommandResult>;

type PowerShellAdapterOptions = {
  allowlist: Record<string, string>;
  executor?: PowerShellExecutor;
};

export function createPowerShellAdapter(options: PowerShellAdapterOptions) {
  const executor: PowerShellExecutor = options.executor ?? defaultExecutor;

  return {
    async execute(input: { action: string; timeoutMs?: number }): Promise<CommandResult> {
      const command = options.allowlist[input.action];
      if (!command) {
        throw new Error(`action blocked by allowlist: ${input.action}`);
      }

      return executor({ command, timeoutMs: input.timeoutMs ?? 10_000 });
    },
  };
}

const defaultExecutor: PowerShellExecutor = async ({ command, timeoutMs }) => {
  const { stdout, stderr } = await execFileAsync('powershell.exe', ['-NoProfile', '-Command', command], {
    timeout: timeoutMs,
    windowsHide: true,
  });

  return {
    code: 0,
    stdout: stdout ?? '',
    stderr: stderr ?? '',
  };
};
