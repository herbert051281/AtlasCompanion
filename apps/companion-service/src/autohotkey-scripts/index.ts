import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type PrimitiveParams = Record<string, unknown> & { approved: boolean };
type ExecutionResult = { code: number; stdout: string; stderr: string };

const VALID_PRIMITIVES: Record<string, { required: string[]; optional: string[] }> = {
  'mouse.move': { required: ['x', 'y'], optional: ['speed'] },
  'mouse.click': { required: ['button'], optional: ['x', 'y', 'clickCount'] },
  'mouse.drag': { required: ['button', 'x1', 'y1', 'x2', 'y2'], optional: ['speed'] },
  'keyboard.type': { required: ['text'], optional: ['delayMs'] },
  'keyboard.hotkey': { required: ['hotkey'], optional: [] },
};

export type AutoHotkeyScriptManagerOptions = {
  scriptsRoot: string;
  ahkExecutable?: string;
  mockExecution?: boolean;
};

export function createAutoHotkeyScriptManager(options: AutoHotkeyScriptManagerOptions) {
  const root = path.resolve(options.scriptsRoot);
  const ahkExe = options.ahkExecutable ?? 'AutoHotkey64.exe';
  const mockMode = options.mockExecution ?? false;

  return {
    listPrimitives(): string[] {
      return Object.keys(VALID_PRIMITIVES);
    },

    validate(primitive: string, params: PrimitiveParams): void {
      if (!VALID_PRIMITIVES[primitive]) {
        throw new Error(`unknown primitive: ${primitive}`);
      }

      const spec = VALID_PRIMITIVES[primitive];
      for (const req of spec.required) {
        if (!(req in params)) {
          throw new Error(`missing required parameter: ${req}`);
        }
      }

      // Validate numeric ranges for mouse coordinates
      if (primitive === 'mouse.move' || primitive === 'mouse.click' || primitive === 'mouse.drag') {
        const coordParams = ['x', 'y', 'x1', 'y1', 'x2', 'y2'];
        for (const coord of coordParams) {
          if (coord in params) {
            const val = params[coord];
            if (typeof val === 'number' && (val < 0 || val > 9999)) {
              throw new Error('invalid coordinates');
            }
          }
        }
      }
    },

    async execute(primitive: string, params: PrimitiveParams): Promise<ExecutionResult> {
      // Check approval first
      if (!params.approved) {
        return {
          code: 1,
          stdout: '',
          stderr: 'approval required',
        };
      }

      // Validate parameters
      this.validate(primitive, params);

      // Mock mode for testing without actual AutoHotkey
      if (mockMode) {
        return {
          code: 0,
          stdout: `[mock] executed ${primitive} with params ${JSON.stringify(params)}`,
          stderr: '',
        };
      }

      // Real execution - build wrapper script path
      const wrapperName = primitive.replace('.', '_') + '_wrapper.ahk';
      const wrapperPath = path.join(root, wrapperName);

      try {
        const { stdout, stderr } = await execFileAsync(ahkExe, [wrapperPath, JSON.stringify(params)], {
          timeout: 10000,
          windowsHide: true,
        });
        return { code: 0, stdout: stdout ?? '', stderr: stderr ?? '' };
      } catch (err) {
        const error = err as Error & { code?: number };
        return {
          code: error.code ?? 1,
          stdout: '',
          stderr: error.message,
        };
      }
    },
  };
}
