import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

export type ExecutionResult = { code: number; stdout: string; stderr: string };

const VALID_OPERATIONS = {
  'window.list': { required: [] as string[], optional: [] as string[] },
  'window.focus': { required: ['windowTitle'], optional: [] as string[] },
  'window.minimize': { required: ['windowTitle'], optional: [] as string[] },
  'app.launch': { required: ['appPath'], optional: ['arguments'] },
  'app.close': { required: ['processName'], optional: [] as string[] },
} as const;

type OperationName = keyof typeof VALID_OPERATIONS;

export function createPowerShellManager(options: {
  scriptsRoot: string;
  powershellExe?: string;
  executor?: (args: { exe: string; args: string[]; timeout: number }) => Promise<{ stdout: string; stderr: string }>;
}) {
  const root = path.resolve(options.scriptsRoot);
  const psExe = options.powershellExe ?? (process.platform === 'win32' ? 'powershell.exe' : 'pwsh');

  const executor = options.executor ?? (async ({ exe, args, timeout }) => {
    return execFileAsync(exe, args, {
      timeout,
      windowsHide: true,
    });
  });

  return {
    listOperations(): string[] {
      return Object.keys(VALID_OPERATIONS);
    },

    validate(operation: string, params: Record<string, unknown>): void {
      if (!Object.hasOwn(VALID_OPERATIONS, operation)) {
        throw new Error(`unknown operation: ${operation}`);
      }

      const spec = VALID_OPERATIONS[operation as OperationName];
      for (const req of spec.required) {
        if (!(req in params)) {
          throw new Error(`missing required parameter: ${req}`);
        }
      }
    },

    async execute(
      operation: string,
      params: Record<string, unknown> & { approved: boolean }
    ): Promise<ExecutionResult> {
      if (!params.approved) {
        return { code: 1, stdout: '', stderr: 'approval required' };
      }

      this.validate(operation, params);

      const scriptPath = path.join(root, 'window-management.ps1');
      const operationCmd = operation.replace('.', '-');
      const paramsJson = JSON.stringify(params);

      const args = [
        '-NoProfile',
        '-ExecutionPolicy', 'Bypass',
        '-File', scriptPath,
        '-Operation', operationCmd,
        '-Params', paramsJson,
      ];

      try {
        const { stdout, stderr } = await executor({
          exe: psExe,
          args,
          timeout: 10000,
        });
        return { code: 0, stdout: stdout ?? '', stderr: stderr ?? '' };
      } catch (err) {
        const error = err as Error & { code?: number; stdout?: string; stderr?: string };
        return {
          code: error.code ?? 1,
          stdout: error.stdout ?? '',
          stderr: error.stderr ?? error.message,
        };
      }
    },
  };
}
