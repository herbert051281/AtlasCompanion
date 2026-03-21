import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import type { CommandResult } from './powershell-adapter.ts';

const execFileAsync = promisify(execFile);

type AutoHotkeyRunner = (input: { scriptPath: string; timeoutMs: number }) => Promise<CommandResult>;

type AutoHotkeyOptions = {
  scriptsRoot: string;
  runner?: AutoHotkeyRunner;
};

export function createAutoHotkeyAdapter(options: AutoHotkeyOptions) {
  const root = path.resolve(options.scriptsRoot);
  const runner: AutoHotkeyRunner = options.runner ?? defaultRunner;

  return {
    async execute(input: { scriptPath: string; approved: boolean; timeoutMs?: number }): Promise<CommandResult> {
      if (!input.approved) {
        throw new Error('approval required for controlled UI actions');
      }

      const resolved = path.resolve(input.scriptPath);
      if (!resolved.startsWith(`${root}${path.sep}`) && resolved !== root) {
        throw new Error('script outside allowed root');
      }

      if (!resolved.toLowerCase().endsWith('.ahk')) {
        throw new Error('script must end with .ahk');
      }

      return runner({ scriptPath: resolved, timeoutMs: input.timeoutMs ?? 20_000 });
    },
  };
}

const defaultRunner: AutoHotkeyRunner = async ({ scriptPath, timeoutMs }) => {
  const { stdout, stderr } = await execFileAsync('AutoHotkey64.exe', [scriptPath], {
    timeout: timeoutMs,
    windowsHide: true,
  });

  return { code: 0, stdout: stdout ?? '', stderr: stderr ?? '' };
};
