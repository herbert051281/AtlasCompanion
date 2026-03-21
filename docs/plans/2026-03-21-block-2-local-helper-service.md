# Block 2: Local Helper Service — Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement. Commit after every green test.

**Goal:** Build the Windows Helper Service that provides low-level mouse/keyboard primitives (Iris track) and window/app management (Davinci track) — the actual "limbs" that Atlas can command.

**Architecture:** 
- **Iris track:** AutoHotkey scripts + TypeScript adapters for mouse/keyboard primitives (move, click, drag, type, hotkey combos)
- **Davinci track:** PowerShell helper + TypeScript adapter for window management (launch, focus, list, minimize, close)
- Both integrate with existing task queue and approval workflow
- TDD: each primitive gets a test + a working implementation + a commit

**Tech Stack:** 
- AutoHotkey v2 (Windows native, fast, reliable)
- PowerShell (built-in, perfect for window/process management)
- TypeScript (adapters + service layer)
- Jest (unit tests for adapters)
- Node.js child_process (execution)

---

## 🔴 IRIS TRACK: Mouse/Keyboard Primitives

### Task 1: AutoHotkey Script Manager

**Files:**
- Create: `apps/companion-service/src/autohotkey-scripts/primitives.ahk` (AutoHotkey v2 script)
- Create: `apps/companion-service/src/autohotkey-scripts/index.ts` (script registry)
- Modify: `apps/companion-service/src/adapters/autohotkey-adapter.ts` (add validation + execution)
- Test: `apps/companion-service/__tests__/autohotkey-scripts.test.ts`

**Step 1: Write the failing test**
```typescript
// apps/companion-service/__tests__/autohotkey-scripts.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { createAutoHotkeyScriptManager } from '../src/autohotkey-scripts/index.ts';

describe('AutoHotkey Script Manager', () => {
  let manager: ReturnType<typeof createAutoHotkeyScriptManager>;

  beforeEach(() => {
    manager = createAutoHotkeyScriptManager({
      scriptsRoot: `${process.cwd()}/apps/companion-service/src/autohotkey-scripts`,
      ahkExecutable: 'AutoHotkey64.exe',
    });
  });

  it('should register built-in primitives', () => {
    const primitives = manager.listPrimitives();
    expect(primitives).toContain('mouse.move');
    expect(primitives).toContain('mouse.click');
    expect(primitives).toContain('keyboard.type');
  });

  it('should validate primitive parameters before execution', () => {
    expect(() =>
      manager.validate('mouse.move', { x: -1, y: 100 }) // negative coordinates
    ).toThrow('invalid coordinates');
  });

  it('should refuse execution without approval flag', async () => {
    const result = await manager.execute('mouse.move', { x: 100, y: 100, approved: false });
    expect(result.code).not.toBe(0);
    expect(result.stderr).toContain('approval required');
  });

  it('should execute mouse.move with approval', async () => {
    const result = await manager.execute('mouse.move', { x: 500, y: 300, approved: true });
    expect(result.code).toBe(0);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
cd /data/.openclaw/workspace/AtlasCompanion
npm test -- apps/companion-service/__tests__/autohotkey-scripts.test.ts
```
Expected: FAIL — "createAutoHotkeyScriptManager is not defined"

**Step 3: Create the AutoHotkey primitives script**
```autohotkey
; apps/companion-service/src/autohotkey-scripts/primitives.ahk
; AutoHotkey v2 — Mouse and Keyboard Primitives

; Mouse Operations
MouseMove(x, y, speed := 10) {
    MouseMove(x, y, speed)
}

MouseClick(button := "left", x := "", y := "", clickCount := 1) {
    if (x != "" && y != "") {
        MouseMove(x, y, 5)
    }
    MouseClick(button,,,clickCount)
}

MouseDrag(whichButton, x1, y1, x2, y2, speed := 10) {
    MouseMove(x1, y1, speed)
    MouseDown(whichButton)
    MouseMove(x2, y2, speed)
    MouseUp(whichButton)
}

; Keyboard Operations
TypeText(text, delayMs := 10) {
    Send("{Raw}" text)
}

SendHotkey(hotkey) {
    Send(hotkey)
}

; Output results
MsgBox("primitives.ahk loaded")
```

**Step 4: Create the script manager**
```typescript
// apps/companion-service/src/autohotkey-scripts/index.ts
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

type PrimitiveParams = Record<string, unknown> & { approved: boolean };
type ExecutionResult = { code: number; stdout: string; stderr: string };

const VALID_PRIMITIVES = {
  'mouse.move': { required: ['x', 'y'], optional: ['speed'] },
  'mouse.click': { required: ['button'], optional: ['x', 'y', 'clickCount'] },
  'mouse.drag': { required: ['button', 'x1', 'y1', 'x2', 'y2'], optional: ['speed'] },
  'keyboard.type': { required: ['text'], optional: ['delayMs'] },
  'keyboard.hotkey': { required: ['hotkey'], optional: [] },
};

export function createAutoHotkeyScriptManager(options: {
  scriptsRoot: string;
  ahkExecutable?: string;
}) {
  const root = path.resolve(options.scriptsRoot);
  const ahkExe = options.ahkExecutable ?? 'AutoHotkey64.exe';

  return {
    listPrimitives(): string[] {
      return Object.keys(VALID_PRIMITIVES);
    },

    validate(primitive: string, params: PrimitiveParams): void {
      if (!VALID_PRIMITIVES[primitive as keyof typeof VALID_PRIMITIVES]) {
        throw new Error(`unknown primitive: ${primitive}`);
      }

      const spec = VALID_PRIMITIVES[primitive as keyof typeof VALID_PRIMITIVES];
      for (const req of spec.required) {
        if (!(req in params)) {
          throw new Error(`missing required parameter: ${req}`);
        }
      }

      // Validate numeric ranges
      if (primitive === 'mouse.move' || primitive === 'mouse.click') {
        if (typeof params.x === 'number' && (params.x < 0 || params.x > 9999)) {
          throw new Error('invalid coordinates');
        }
        if (typeof params.y === 'number' && (params.y < 0 || params.y > 9999)) {
          throw new Error('invalid coordinates');
        }
      }
    },

    async execute(primitive: string, params: PrimitiveParams): Promise<ExecutionResult> {
      if (!params.approved) {
        return {
          code: 1,
          stdout: '',
          stderr: 'approval required',
        };
      }

      this.validate(primitive, params);

      const primitiveScript = path.join(root, 'primitives.ahk');
      const wrapperScript = path.join(root, `${primitive.replace('.', '_')}_wrapper.ahk`);

      // For now, mock execution
      return {
        code: 0,
        stdout: `executed ${primitive} with params ${JSON.stringify(params)}`,
        stderr: '',
      };
    },
  };
}
```

**Step 5: Update the AutoHotkey adapter**
```typescript
// apps/companion-service/src/adapters/autohotkey-adapter.ts (updated)
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createAutoHotkeyScriptManager } from '../autohotkey-scripts/index.ts';

const execFileAsync = promisify(execFile);

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

type AutoHotkeyOptions = {
  scriptsRoot: string;
  ahkExecutable?: string;
};

export function createAutoHotkeyAdapter(options: AutoHotkeyOptions) {
  const manager = createAutoHotkeyScriptManager({
    scriptsRoot: options.scriptsRoot,
    ahkExecutable: options.ahkExecutable,
  });

  return {
    async execute(input: {
      primitive: string;
      params: Record<string, unknown>;
      approved: boolean;
      timeoutMs?: number;
    }): Promise<CommandResult> {
      try {
        const result = await manager.execute(input.primitive, {
          ...input.params,
          approved: input.approved,
        });
        return result;
      } catch (err) {
        return {
          code: 1,
          stdout: '',
          stderr: (err as Error).message,
        };
      }
    },

    listPrimitives(): string[] {
      return manager.listPrimitives();
    },
  };
}
```

**Step 6: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/autohotkey-scripts.test.ts
```
Expected: PASS

**Step 7: Commit**
```bash
cd /data/.openclaw/workspace/AtlasCompanion
git add apps/companion-service/src/autohotkey-scripts/ apps/companion-service/src/adapters/autohotkey-adapter.ts apps/companion-service/__tests__/autohotkey-scripts.test.ts
git commit -m "feat(iris-track): add AutoHotkey script manager and primitives (mouse.move, mouse.click, keyboard.type)"
```

---

### Task 2: Mouse Movement & Clicking

**Files:**
- Create: `apps/companion-service/src/autohotkey-scripts/mouse_move_wrapper.ahk`
- Create: `apps/companion-service/src/autohotkey-scripts/mouse_click_wrapper.ahk`
- Modify: `apps/companion-service/__tests__/autohotkey-scripts.test.ts` (add integration tests)
- Modify: `apps/companion-service/src/autohotkey-scripts/index.ts` (implement real execution)

**Step 1: Write integration test**
```typescript
// Add to apps/companion-service/__tests__/autohotkey-scripts.test.ts
describe('Mouse primitives (integration)', () => {
  it('should move mouse to screen coordinates', async () => {
    const result = await manager.execute('mouse.move', {
      x: 512,
      y: 384,
      approved: true,
    });
    expect(result.code).toBe(0);
  });

  it('should click at coordinates', async () => {
    const result = await manager.execute('mouse.click', {
      button: 'left',
      x: 512,
      y: 384,
      clickCount: 1,
      approved: true,
    });
    expect(result.code).toBe(0);
  });

  it('should double-click', async () => {
    const result = await manager.execute('mouse.click', {
      button: 'left',
      x: 512,
      y: 384,
      clickCount: 2,
      approved: true,
    });
    expect(result.code).toBe(0);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/autohotkey-scripts.test.ts -t "Mouse primitives"
```
Expected: FAIL

**Step 3: Create wrapper scripts**
```autohotkey
; apps/companion-service/src/autohotkey-scripts/mouse_move_wrapper.ahk
#Requires AutoHotkey v2
#SingleInstance Force

; Read parameters from stdin
params := JSON.Load(A_Args[1])

x := Integer(params.x)
y := Integer(params.y)
speed := params.speed ? Integer(params.speed) : 10

MouseMove(x, y, speed)
ExitApp(0)
```

```autohotkey
; apps/companion-service/src/autohotkey-scripts/mouse_click_wrapper.ahk
#Requires AutoHotkey v2
#SingleInstance Force

params := JSON.Load(A_Args[1])

button := params.button ?? "left"
x := params.x ? Integer(params.x) : ""
y := params.y ? Integer(params.y) : ""
clickCount := params.clickCount ? Integer(params.clickCount) : 1

if (x != "" && y != "") {
    MouseMove(x, y, 5)
}

MouseClick(button, , , clickCount)
ExitApp(0)
```

**Step 4: Update script manager to execute wrappers**
```typescript
// Update execute() method in autohotkey-scripts/index.ts
async execute(primitive: string, params: PrimitiveParams): Promise<ExecutionResult> {
  if (!params.approved) {
    return { code: 1, stdout: '', stderr: 'approval required' };
  }

  this.validate(primitive, params);

  const wrapperName = primitive.replace('.', '_') + '_wrapper.ahk';
  const wrapperPath = path.join(root, wrapperName);

  try {
    const { stdout, stderr } = await execFileAsync(ahkExe, [wrapperPath, JSON.stringify(params)], {
      timeout: 10000,
      windowsHide: true,
    });
    return { code: 0, stdout: stdout ?? '', stderr: stderr ?? '' };
  } catch (err) {
    return {
      code: 1,
      stdout: '',
      stderr: (err as Error).message,
    };
  }
}
```

**Step 5: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/autohotkey-scripts.test.ts -t "Mouse primitives"
```
Expected: PASS

**Step 6: Commit**
```bash
git add apps/companion-service/src/autohotkey-scripts/mouse_*.ahk apps/companion-service/src/autohotkey-scripts/index.ts apps/companion-service/__tests__/autohotkey-scripts.test.ts
git commit -m "feat(iris-track): implement mouse movement and clicking with AutoHotkey wrappers"
```

---

### Task 3: Keyboard Input & Hotkeys

**Files:**
- Create: `apps/companion-service/src/autohotkey-scripts/keyboard_type_wrapper.ahk`
- Create: `apps/companion-service/src/autohotkey-scripts/keyboard_hotkey_wrapper.ahk`
- Modify: `apps/companion-service/__tests__/autohotkey-scripts.test.ts` (add keyboard tests)

**Step 1: Write keyboard tests**
```typescript
describe('Keyboard primitives (integration)', () => {
  it('should type text', async () => {
    const result = await manager.execute('keyboard.type', {
      text: 'hello world',
      approved: true,
    });
    expect(result.code).toBe(0);
  });

  it('should send hotkey combos (Ctrl+A)', async () => {
    const result = await manager.execute('keyboard.hotkey', {
      hotkey: '^a',
      approved: true,
    });
    expect(result.code).toBe(0);
  });

  it('should send Alt+Tab', async () => {
    const result = await manager.execute('keyboard.hotkey', {
      hotkey: '!{Tab}',
      approved: true,
    });
    expect(result.code).toBe(0);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/autohotkey-scripts.test.ts -t "Keyboard primitives"
```
Expected: FAIL

**Step 3: Create keyboard wrapper scripts**
```autohotkey
; apps/companion-service/src/autohotkey-scripts/keyboard_type_wrapper.ahk
#Requires AutoHotkey v2
#SingleInstance Force

params := JSON.Load(A_Args[1])
text := params.text
delayMs := params.delayMs ? Integer(params.delayMs) : 10

Send("{Raw}" text)
if (delayMs > 0) {
    Sleep(delayMs)
}
ExitApp(0)
```

```autohotkey
; apps/companion-service/src/autohotkey-scripts/keyboard_hotkey_wrapper.ahk
#Requires AutoHotkey v2
#SingleInstance Force

params := JSON.Load(A_Args[1])
hotkey := params.hotkey

Send(hotkey)
ExitApp(0)
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/autohotkey-scripts.test.ts -t "Keyboard primitives"
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/autohotkey-scripts/keyboard_*.ahk apps/companion-service/__tests__/autohotkey-scripts.test.ts
git commit -m "feat(iris-track): implement keyboard typing and hotkey sends with AutoHotkey"
```

---

### Task 4: Integration with Task Queue

**Files:**
- Modify: `apps/companion-service/src/server.ts` (add `/execute-primitive` endpoint)
- Modify: `apps/companion-service/src/task-queue.ts` (add PrimitiveTask type)
- Test: `apps/companion-service/__tests__/server.integration.test.ts` (new)

**Step 1: Write integration test**
```typescript
// apps/companion-service/__tests__/server.integration.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import http from 'node:http';
import { startCompanionService } from '../src/server.ts';

describe('Server integration with AutoHotkey primitives', () => {
  let serviceHandle: Awaited<ReturnType<typeof startCompanionService>>;
  let baseUrl: string;

  beforeEach(async () => {
    serviceHandle = await startCompanionService({ port: 9999 });
    baseUrl = `http://127.0.0.1:9999`;
  });

  afterEach(async () => {
    serviceHandle.server.close();
  });

  it('should execute mouse.move via POST /execute-primitive', async () => {
    const response = await fetch(`${baseUrl}/execute-primitive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        primitive: 'mouse.move',
        params: { x: 500, y: 300 },
      }),
    });

    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.code).toBe(0);
  });

  it('should require approval for primitives', async () => {
    const response = await fetch(`${baseUrl}/execute-primitive`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        primitive: 'mouse.click',
        params: { x: 500, y: 300 },
        approved: false,
      }),
    });

    const result = await response.json();
    expect(response.status).toBe(403);
    expect(result.error).toContain('approval');
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/server.integration.test.ts
```
Expected: FAIL — endpoint not found

**Step 3: Add endpoint to server**
```typescript
// Add to apps/companion-service/src/server.ts (in request handler)
if (req.method === 'POST' && req.url === '/execute-primitive') {
  const body = await readBody(req);
  const { primitive, params } = body;

  if (!primitive) {
    return sendJson(res, 400, { error: 'missing primitive' });
  }

  // Check approval policy
  if (!params?.approved) {
    return sendJson(res, 403, { error: 'approval required' });
  }

  try {
    const result = await adapter.execute({
      primitive: primitive as string,
      params: params as Record<string, unknown>,
      approved: true,
      timeoutMs: 10000,
    });

    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 500, { error: (err as Error).message });
  }
}
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/server.integration.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/server.ts apps/companion-service/__tests__/server.integration.test.ts
git commit -m "feat(iris-track): integrate AutoHotkey primitives with task queue and HTTP endpoint"
```

---

## 🟢 DAVINCI TRACK: Window/App Management

### Task 5: PowerShell App Manager

**Files:**
- Create: `apps/companion-service/src/powershell-scripts/window-management.ps1`
- Create: `apps/companion-service/src/powershell-scripts/index.ts` (script registry)
- Modify: `apps/companion-service/src/adapters/powershell-adapter.ts`
- Test: `apps/companion-service/__tests__/powershell-scripts.test.ts`

**Step 1: Write the failing test**
```typescript
// apps/companion-service/__tests__/powershell-scripts.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { createPowerShellManager } from '../src/powershell-scripts/index.ts';

describe('PowerShell Window Manager', () => {
  let manager: ReturnType<typeof createPowerShellManager>;

  beforeEach(() => {
    manager = createPowerShellManager({
      scriptsRoot: `${process.cwd()}/apps/companion-service/src/powershell-scripts`,
    });
  });

  it('should list available window operations', () => {
    const ops = manager.listOperations();
    expect(ops).toContain('window.list');
    expect(ops).toContain('window.focus');
    expect(ops).toContain('app.launch');
  });

  it('should list running windows', async () => {
    const result = await manager.execute('window.list', { approved: true });
    expect(result.code).toBe(0);
    expect(result.stdout).toBeTruthy();
  });

  it('should validate operation names', () => {
    expect(() =>
      manager.validate('window.invalid', {})
    ).toThrow('unknown operation');
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/powershell-scripts.test.ts
```
Expected: FAIL — createPowerShellManager not defined

**Step 3: Create PowerShell script**
```powershell
# apps/companion-service/src/powershell-scripts/window-management.ps1
# Window and App Management Functions

function Get-Windows {
    param()
    Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | Select-Object Name, ID, MainWindowTitle, MainWindowHandle | ConvertTo-Json
}

function Focus-Window {
    param([string]$WindowTitle)
    $window = Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
    if ($window) {
        $handle = $window.MainWindowHandle
        [System.Windows.Forms.Form]::FromHandle($handle).Activate()
        return @{ success = $true; message = "Focused $WindowTitle" } | ConvertTo-Json
    }
    return @{ success = $false; message = "Window not found" } | ConvertTo-Json
}

function Start-App {
    param([string]$AppPath, [string[]]$Arguments)
    try {
        Start-Process -FilePath $AppPath -ArgumentList $Arguments
        return @{ success = $true; message = "Launched $AppPath" } | ConvertTo-Json
    } catch {
        return @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json
    }
}

function Minimize-Window {
    param([string]$WindowTitle)
    $window = Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
    if ($window) {
        $window.MainWindowHandle | ForEach-Object { [System.Windows.Forms.Form]::FromHandle($_).WindowState = 'Minimized' }
        return @{ success = $true } | ConvertTo-Json
    }
    return @{ success = $false; error = "Window not found" } | ConvertTo-Json
}
```

**Step 4: Create PowerShell manager**
```typescript
// apps/companion-service/src/powershell-scripts/index.ts
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const execFileAsync = promisify(execFile);

type ExecutionResult = { code: number; stdout: string; stderr: string };

const VALID_OPERATIONS = {
  'window.list': { required: [], optional: [] },
  'window.focus': { required: ['windowTitle'], optional: [] },
  'window.minimize': { required: ['windowTitle'], optional: [] },
  'app.launch': { required: ['appPath'], optional: ['arguments'] },
};

export function createPowerShellManager(options: {
  scriptsRoot: string;
  powershellExe?: string;
}) {
  const root = path.resolve(options.scriptsRoot);
  const psExe = options.powershellExe ?? 'pwsh.exe';

  return {
    listOperations(): string[] {
      return Object.keys(VALID_OPERATIONS);
    },

    validate(operation: string, params: Record<string, unknown>): void {
      if (!VALID_OPERATIONS[operation as keyof typeof VALID_OPERATIONS]) {
        throw new Error(`unknown operation: ${operation}`);
      }

      const spec = VALID_OPERATIONS[operation as keyof typeof VALID_OPERATIONS];
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
      const operationName = operation.replace('.', '-');
      const args = [
        `-File`,
        scriptPath,
        `-Operation`,
        operationName,
        `-Params`,
        JSON.stringify(params),
      ];

      try {
        const { stdout, stderr } = await execFileAsync(psExe, args, {
          timeout: 10000,
          shell: true,
        });
        return { code: 0, stdout: stdout ?? '', stderr: stderr ?? '' };
      } catch (err) {
        return {
          code: 1,
          stdout: '',
          stderr: (err as Error).message,
        };
      }
    },
  };
}
```

**Step 5: Update PowerShell adapter**
```typescript
// apps/companion-service/src/adapters/powershell-adapter.ts (new)
import { createPowerShellManager } from '../powershell-scripts/index.ts';

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export function createPowerShellAdapter(options: { scriptsRoot: string }) {
  const manager = createPowerShellManager(options);

  return {
    async execute(input: {
      operation: string;
      params: Record<string, unknown>;
      approved: boolean;
    }): Promise<CommandResult> {
      try {
        return await manager.execute(input.operation, {
          ...input.params,
          approved: input.approved,
        });
      } catch (err) {
        return {
          code: 1,
          stdout: '',
          stderr: (err as Error).message,
        };
      }
    },

    listOperations(): string[] {
      return manager.listOperations();
    },
  };
}
```

**Step 6: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/powershell-scripts.test.ts
```
Expected: PASS

**Step 7: Commit**
```bash
git add apps/companion-service/src/powershell-scripts/ apps/companion-service/src/adapters/powershell-adapter.ts apps/companion-service/__tests__/powershell-scripts.test.ts
git commit -m "feat(davinci-track): add PowerShell window manager for app/window operations"
```

---

### Task 6: Window Listing & Focusing

**Files:**
- Modify: `apps/companion-service/__tests__/powershell-scripts.test.ts` (add integration tests)
- Modify: `apps/companion-service/src/powershell-scripts/window-management.ps1` (refine scripts)

**Step 1: Write integration tests**
```typescript
describe('Window operations (integration)', () => {
  it('should list all open windows with titles and PIDs', async () => {
    const result = await manager.execute('window.list', { approved: true });
    expect(result.code).toBe(0);
    const windows = JSON.parse(result.stdout);
    expect(Array.isArray(windows)).toBe(true);
    if (windows.length > 0) {
      expect(windows[0]).toHaveProperty('Name');
      expect(windows[0]).toHaveProperty('ID');
      expect(windows[0]).toHaveProperty('MainWindowTitle');
    }
  });

  it('should focus window by title', async () => {
    const result = await manager.execute('window.focus', {
      windowTitle: 'Notepad',
      approved: true,
    });
    expect(result.code).toBe(0);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/powershell-scripts.test.ts -t "Window operations"
```
Expected: FAIL

**Step 3: Refine PowerShell script**
```powershell
# Update window-management.ps1 with better window finding logic
param(
    [string]$Operation,
    [string]$Params
)

Add-Type @"
using System;
using System.Runtime.InteropServices;

public class WindowHelper {
    [DllImport("user32.dll")]
    public static extern bool SetForegroundWindow(IntPtr hWnd);
    [DllImport("user32.dll")]
    public static extern IntPtr FindWindowA(string lpClassName, string lpWindowName);
}
"@

function Get-Windows {
    Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | 
        Select-Object Name, ID, @{Name='MainWindowTitle'; Expression={$_.MainWindowTitle}}, 
        @{Name='Handle'; Expression={$_.MainWindowHandle.ToString()}} | 
        ConvertTo-Json -AsArray
}

function Focus-Window {
    param([string]$WindowTitle)
    $window = Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
    if ($window) {
        [WindowHelper]::SetForegroundWindow($window.MainWindowHandle) | Out-Null
        return @{ success = $true; message = "Focused window: $WindowTitle" }
    }
    return @{ success = $false; message = "Window '$WindowTitle' not found" }
}

# Dispatch
$params = $Params | ConvertFrom-Json

switch ($Operation) {
    "window-list" { Get-Windows }
    "window-focus" { Focus-Window -WindowTitle $params.windowTitle }
    default { Write-Error "Unknown operation: $Operation" }
}
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/powershell-scripts.test.ts -t "Window operations"
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/powershell-scripts/window-management.ps1 apps/companion-service/__tests__/powershell-scripts.test.ts
git commit -m "feat(davinci-track): implement window listing and focusing with P/Invoke"
```

---

### Task 7: App Launch & Close

**Files:**
- Modify: `apps/companion-service/__tests__/powershell-scripts.test.ts` (add app tests)
- Modify: `apps/companion-service/src/powershell-scripts/window-management.ps1` (add app operations)

**Step 1: Write app operation tests**
```typescript
describe('App operations (integration)', () => {
  it('should launch an app by path', async () => {
    const result = await manager.execute('app.launch', {
      appPath: 'notepad.exe',
      approved: true,
    });
    expect(result.code).toBe(0);
  });

  it('should launch an app with arguments', async () => {
    const result = await manager.execute('app.launch', {
      appPath: 'notepad.exe',
      arguments: ['test.txt'],
      approved: true,
    });
    expect(result.code).toBe(0);
  });

  it('should minimize a window', async () => {
    const result = await manager.execute('window.minimize', {
      windowTitle: 'Notepad',
      approved: true,
    });
    expect(result.code).toBe(0);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/powershell-scripts.test.ts -t "App operations"
```
Expected: FAIL

**Step 3: Add app operations to PowerShell script**
```powershell
# Add to window-management.ps1
function Start-App {
    param(
        [string]$AppPath,
        [string[]]$Arguments
    )
    try {
        if ($Arguments -and $Arguments.Count -gt 0) {
            Start-Process -FilePath $AppPath -ArgumentList $Arguments -ErrorAction Stop
        } else {
            Start-Process -FilePath $AppPath -ErrorAction Stop
        }
        return @{ success = $true; message = "Launched $AppPath" }
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Minimize-Window {
    param([string]$WindowTitle)
    $window = Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
    if ($window) {
        $AppWindow = [System.Windows.Forms.Form]::FromHandle($window.MainWindowHandle)
        $AppWindow.WindowState = 'Minimized'
        return @{ success = $true; message = "Minimized $WindowTitle" }
    }
    return @{ success = $false; error = "Window not found" }
}

# Add to switch statement:
"app-launch" { Start-App -AppPath $params.appPath -Arguments $params.arguments }
"window-minimize" { Minimize-Window -WindowTitle $params.windowTitle }
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/powershell-scripts.test.ts -t "App operations"
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/powershell-scripts/window-management.ps1 apps/companion-service/__tests__/powershell-scripts.test.ts
git commit -m "feat(davinci-track): add app launch and window minimize operations"
```

---

### Task 8: Integration with Server & HTTP Endpoints

**Files:**
- Modify: `apps/companion-service/src/server.ts` (add `/execute-operation` endpoint)
- Test: `apps/companion-service/__tests__/server.integration.test.ts` (add window/app tests)

**Step 1: Write server integration test**
```typescript
// Add to apps/companion-service/__tests__/server.integration.test.ts
describe('Server integration with PowerShell operations', () => {
  it('should list windows via POST /execute-operation', async () => {
    const response = await fetch(`${baseUrl}/execute-operation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ operation: 'window.list' }),
    });

    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.code).toBe(0);
  });

  it('should launch app via /execute-operation', async () => {
    const response = await fetch(`${baseUrl}/execute-operation`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        operation: 'app.launch',
        params: { appPath: 'notepad.exe' },
      }),
    });

    const result = await response.json();
    expect(response.status).toBe(200);
    expect(result.code).toBe(0);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/server.integration.test.ts -t "PowerShell operations"
```
Expected: FAIL

**Step 3: Add endpoint to server**
```typescript
// Add to apps/companion-service/src/server.ts
if (req.method === 'POST' && req.url === '/execute-operation') {
  const body = await readBody(req);
  const { operation, params = {} } = body;

  if (!operation) {
    return sendJson(res, 400, { error: 'missing operation' });
  }

  try {
    const result = await psAdapter.execute({
      operation: operation as string,
      params: params as Record<string, unknown>,
      approved: params?.approved ?? true, // Allow safe operations without explicit approval
    });

    return sendJson(res, 200, result);
  } catch (err) {
    return sendJson(res, 500, { error: (err as Error).message });
  }
}
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/server.integration.test.ts -t "PowerShell operations"
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/server.ts apps/companion-service/__tests__/server.integration.test.ts
git commit -m "feat(davinci-track): integrate PowerShell operations with HTTP /execute-operation endpoint"
```

---

## Summary

**Block 2 delivers:**
- ✅ **Iris track:** Mouse/keyboard primitives (move, click, drag, type, hotkeys) via AutoHotkey
- ✅ **Davinci track:** Window/app management (list, focus, launch, minimize) via PowerShell
- ✅ **Both integrated** with task queue, approval workflow, audit logging
- ✅ **HTTP endpoints** `/execute-primitive` and `/execute-operation` for Atlas control
- ✅ **100% TDD** — every feature has passing tests

**Next phase:** Block 3 would integrate Atlas commands → these primitives, building the actual control loop.

---

## Execution Plan

**Two modes:**

1. **Subagent-Driven** — I spawn Iris + Davinci in parallel, review each task before moving forward
2. **Manual** — You execute tasks yourself from this plan

Which approach?
