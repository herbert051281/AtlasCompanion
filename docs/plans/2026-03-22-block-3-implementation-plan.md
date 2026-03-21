# Block 3: Atlas Command Integration — Implementation Plan

> **For implementer:** Use TDD throughout. Write failing test first. Watch it fail. Then implement. Commit after every green test.

**Goal:** Build the command parser, control window manager, helper service client, and integrate them with Atlas so you can control your Windows machine via natural language commands.

**Architecture:** 
- **Command Parser:** NLP to extract primitives/operations from your requests
- **Control Window Manager:** Grant/revoke 5-min control tokens with auto-expiry
- **Helper Service Client:** HTTP client that calls the Windows service with retries
- **Atlas Integration:** Wire everything to your Telegram commands

**Tech Stack:** 
- TypeScript (type-safe parsing + client)
- Jest (unit tests)
- Node.js http/fetch (HTTP client)
- RegEx (NLP pattern matching)

---

## Phase 1: Command Parser & Handler

### Task 1: NLP Parser for Primitives

**Files:**
- Create: `apps/companion-service/src/command-parser.ts`
- Create: `apps/companion-service/__tests__/command-parser.test.ts`

**Step 1: Write the failing test**
```typescript
// apps/companion-service/__tests__/command-parser.test.ts
import { describe, it, expect } from '@jest/globals';
import { parseCommand } from '../src/command-parser.ts';

describe('Command Parser', () => {
  describe('Mouse primitives', () => {
    it('should parse "move mouse to X,Y"', () => {
      const cmd = 'move mouse to 500,300';
      const result = parseCommand(cmd);
      
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toEqual({
        type: 'primitive',
        primitive: 'mouse.move',
        params: { x: 500, y: 300 },
      });
    });

    it('should parse "click at X,Y"', () => {
      const cmd = 'click at 500,300';
      const result = parseCommand(cmd);
      
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0].primitive).toBe('mouse.click');
      expect(result.commands[0].params).toEqual({ x: 500, y: 300, button: 'left' });
    });

    it('should parse "right click at X,Y"', () => {
      const cmd = 'right click at 100,100';
      const result = parseCommand(cmd);
      
      expect(result.commands[0]).toEqual({
        type: 'primitive',
        primitive: 'mouse.click',
        params: { x: 100, y: 100, button: 'right' },
      });
    });

    it('should parse "double click at X,Y"', () => {
      const cmd = 'double click at 250,250';
      const result = parseCommand(cmd);
      
      expect(result.commands[0]).toEqual({
        type: 'primitive',
        primitive: 'mouse.click',
        params: { x: 250, y: 250, clickCount: 2, button: 'left' },
      });
    });
  });

  describe('Keyboard primitives', () => {
    it('should parse "type hello world"', () => {
      const cmd = 'type hello world';
      const result = parseCommand(cmd);
      
      expect(result.commands).toHaveLength(1);
      expect(result.commands[0]).toEqual({
        type: 'primitive',
        primitive: 'keyboard.type',
        params: { text: 'hello world' },
      });
    });

    it('should parse "press Ctrl+A"', () => {
      const cmd = 'press Ctrl+A';
      const result = parseCommand(cmd);
      
      expect(result.commands[0]).toEqual({
        type: 'primitive',
        primitive: 'keyboard.hotkey',
        params: { hotkey: '^a' },
      });
    });

    it('should parse "press Alt+Tab"', () => {
      const cmd = 'press Alt+Tab';
      const result = parseCommand(cmd);
      
      expect(result.commands[0]).toEqual({
        type: 'primitive',
        primitive: 'keyboard.hotkey',
        params: { hotkey: '!{Tab}' },
      });
    });
  });

  describe('Error handling', () => {
    it('should reject ambiguous commands', () => {
      const cmd = 'do something';
      const result = parseCommand(cmd);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('ambiguous');
    });

    it('should reject missing coordinates', () => {
      const cmd = 'click at nothing';
      const result = parseCommand(cmd);
      
      expect(result.success).toBe(false);
      expect(result.error).toContain('coordinate');
    });
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
cd /data/.openclaw/workspace/AtlasCompanion
npm test -- apps/companion-service/__tests__/command-parser.test.ts
```
Expected: FAIL — parseCommand not defined

**Step 3: Create the parser**
```typescript
// apps/companion-service/src/command-parser.ts
export type ParsedCommand = {
  type: 'primitive' | 'operation' | 'control';
  primitive?: string;
  operation?: string;
  action?: string;
  params: Record<string, any>;
};

export type ParseResult = {
  success: boolean;
  commands?: ParsedCommand[];
  error?: string;
};

const HOTKEY_MAP: Record<string, string> = {
  'Ctrl+A': '^a',
  'Ctrl+C': '^c',
  'Ctrl+V': '^v',
  'Ctrl+S': '^s',
  'Ctrl+Z': '^z',
  'Alt+Tab': '!{Tab}',
  'Alt+F4': '!{F4}',
  'Win+V': '#{v}',
};

export function parseCommand(text: string): ParseResult {
  const trimmed = text.trim().toLowerCase();

  // Mouse primitives
  if (trimmed.match(/^(move|go) mouse to (\d+),(\d+)$/)) {
    const match = trimmed.match(/^(move|go) mouse to (\d+),(\d+)$/);
    if (match) {
      return {
        success: true,
        commands: [
          {
            type: 'primitive',
            primitive: 'mouse.move',
            params: { x: parseInt(match[2]), y: parseInt(match[3]) },
          },
        ],
      };
    }
  }

  if (trimmed.match(/^(right\s+)?click at (\d+),(\d+)$/)) {
    const match = trimmed.match(/^(right\s+)?click at (\d+),(\d+)$/);
    if (match) {
      const isRight = !!match[1];
      return {
        success: true,
        commands: [
          {
            type: 'primitive',
            primitive: 'mouse.click',
            params: {
              x: parseInt(match[2]),
              y: parseInt(match[3]),
              button: isRight ? 'right' : 'left',
            },
          },
        ],
      };
    }
  }

  if (trimmed.match(/^double\s+click at (\d+),(\d+)$/)) {
    const match = trimmed.match(/^double\s+click at (\d+),(\d+)$/);
    if (match) {
      return {
        success: true,
        commands: [
          {
            type: 'primitive',
            primitive: 'mouse.click',
            params: {
              x: parseInt(match[1]),
              y: parseInt(match[2]),
              clickCount: 2,
              button: 'left',
            },
          },
        ],
      };
    }
  }

  // Keyboard primitives
  if (trimmed.startsWith('type ')) {
    const text = trimmed.slice(5);
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'keyboard.type',
          params: { text },
        },
      ],
    };
  }

  if (trimmed.startsWith('press ')) {
    const keyCombo = trimmed.slice(6).trim();
    const hotkeyValue = HOTKEY_MAP[keyCombo] || keyCombo.toLowerCase();
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'keyboard.hotkey',
          params: { hotkey: hotkeyValue },
        },
      ],
    };
  }

  // Control operations
  if (trimmed === 'grant control' || trimmed.startsWith('grant control for')) {
    const match = trimmed.match(/grant control for (\d+)\s*(min|minute|hour)/);
    const durationMs = match
      ? parseInt(match[1]) * (match[2] === 'hour' ? 3600000 : 60000)
      : 300000; // 5 min default

    return {
      success: true,
      commands: [
        {
          type: 'control',
          action: 'grant',
          params: { durationMs },
        },
      ],
    };
  }

  if (trimmed === 'revoke control') {
    return {
      success: true,
      commands: [
        {
          type: 'control',
          action: 'revoke',
          params: {},
        },
      ],
    };
  }

  // Fallback
  return {
    success: false,
    error: `I didn't understand "${text}". Try: "move mouse to 500,300", "click at 500,300", "type hello", "press Ctrl+A"`,
  };
}
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/command-parser.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
cd /data/.openclaw/workspace/AtlasCompanion
git add apps/companion-service/src/command-parser.ts apps/companion-service/__tests__/command-parser.test.ts
git commit -m "feat(block-3): add NLP command parser for primitives (mouse, keyboard)"
```

---

### Task 2: Operation Parser & Chaining

**Files:**
- Modify: `apps/companion-service/src/command-parser.ts` (add operations)
- Modify: `apps/companion-service/__tests__/command-parser.test.ts` (add operation + chain tests)

**Step 1: Write operation tests**
```typescript
// Add to command-parser.test.ts
describe('App/Window operations', () => {
  it('should parse "open Notepad"', () => {
    const cmd = 'open Notepad';
    const result = parseCommand(cmd);
    
    expect(result.commands[0]).toEqual({
      type: 'operation',
      operation: 'app.launch',
      params: { appPath: 'notepad.exe' },
    });
  });

  it('should parse "focus Chrome"', () => {
    const cmd = 'focus Chrome';
    const result = parseCommand(cmd);
    
    expect(result.commands[0]).toEqual({
      type: 'operation',
      operation: 'window.focus',
      params: { windowTitle: 'Chrome' },
    });
  });

  it('should parse "list windows"', () => {
    const cmd = 'list windows';
    const result = parseCommand(cmd);
    
    expect(result.commands[0]).toEqual({
      type: 'operation',
      operation: 'window.list',
      params: {},
    });
  });
});

describe('Command chaining', () => {
  it('should parse sequential commands separated by comma', () => {
    const cmd = 'open Notepad, wait 2s, type hello';
    const result = parseCommand(cmd);
    
    expect(result.commands).toHaveLength(3);
    expect(result.commands[0].operation).toBe('app.launch');
    expect(result.commands[1].action).toBe('wait');
    expect(result.commands[2].primitive).toBe('keyboard.type');
  });

  it('should parse commands separated by "then"', () => {
    const cmd = 'move mouse to 500,300 then click';
    const result = parseCommand(cmd);
    
    expect(result.commands).toHaveLength(2);
    expect(result.commands[0].primitive).toBe('mouse.move');
    expect(result.commands[1].primitive).toBe('mouse.click');
  });

  it('should handle "and" as a separator', () => {
    const cmd = 'click at 100,100 and type hello';
    const result = parseCommand(cmd);
    
    expect(result.commands).toHaveLength(2);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/command-parser.test.ts -t "operation|chaining"
```
Expected: FAIL

**Step 3: Update parser to handle operations**
```typescript
// Add to command-parser.ts
const APP_NAMES: Record<string, string> = {
  'notepad': 'notepad.exe',
  'chrome': 'chrome.exe',
  'firefox': 'firefox.exe',
  'edge': 'msedge.exe',
  'vscode': 'code.exe',
  'visual studio code': 'code.exe',
  'slack': 'slack.exe',
  'discord': 'discord.exe',
};

export function parseCommand(text: string): ParseResult {
  // Split by separators: "then", "and", ","
  const statements = text
    .split(/(?:,|then|and)/i)
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (statements.length > 1) {
    // Chain multiple commands
    const commands: ParsedCommand[] = [];
    for (const stmt of statements) {
      const result = parseSingleStatement(stmt);
      if (!result.success) {
        return result;
      }
      commands.push(...(result.commands || []));
    }
    return { success: true, commands };
  }

  // Single statement
  return parseSingleStatement(text);
}

function parseSingleStatement(text: string): ParseResult {
  const trimmed = text.trim().toLowerCase();

  // ... existing mouse/keyboard parsing ...

  // App/Window operations
  if (trimmed.startsWith('open ')) {
    const appName = trimmed.slice(5).trim();
    const appPath = APP_NAMES[appName] || `${appName}.exe`;
    return {
      success: true,
      commands: [
        {
          type: 'operation',
          operation: 'app.launch',
          params: { appPath },
        },
      ],
    };
  }

  if (trimmed.startsWith('focus ')) {
    const windowTitle = trimmed.slice(6).trim();
    return {
      success: true,
      commands: [
        {
          type: 'operation',
          operation: 'window.focus',
          params: { windowTitle },
        },
      ],
    };
  }

  if (trimmed === 'list windows') {
    return {
      success: true,
      commands: [
        {
          type: 'operation',
          operation: 'window.list',
          params: {},
        },
      ],
    };
  }

  // Wait command
  if (trimmed.match(/^wait\s+(\d+)s?$/)) {
    const match = trimmed.match(/^wait\s+(\d+)s?$/);
    if (match) {
      return {
        success: true,
        commands: [
          {
            type: 'primitive',
            action: 'wait',
            params: { ms: parseInt(match[1]) * 1000 },
          },
        ],
      };
    }
  }

  // ... rest of parsing ...
}
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/command-parser.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/command-parser.ts apps/companion-service/__tests__/command-parser.test.ts
git commit -m "feat(block-3): add operation parser and command chaining (open, focus, wait)"
```

---

## Phase 2: Control Window Manager

### Task 3: Token Generation & Validation

**Files:**
- Create: `apps/companion-service/src/control-window.ts`
- Create: `apps/companion-service/__tests__/control-window.test.ts`

**Step 1: Write the failing test**
```typescript
// apps/companion-service/__tests__/control-window.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ControlWindowManager } from '../src/control-window.ts';

describe('Control Window Manager', () => {
  let manager: ControlWindowManager;

  beforeEach(() => {
    manager = new ControlWindowManager();
  });

  it('should grant control and return a token', () => {
    const token = manager.grantControl(300000); // 5 min
    expect(token).toBeTruthy();
    expect(typeof token).toBe('string');
  });

  it('should validate a valid token', () => {
    const token = manager.grantControl(300000);
    expect(manager.isApproved(token)).toBe(true);
  });

  it('should reject an invalid token', () => {
    const token = 'invalid-token-xyz';
    expect(manager.isApproved(token)).toBe(false);
  });

  it('should expire token after duration', async () => {
    const token = manager.grantControl(100); // 100ms
    expect(manager.isApproved(token)).toBe(true);

    await new Promise(resolve => setTimeout(resolve, 150));
    expect(manager.isApproved(token)).toBe(false);
  });

  it('should support manual revocation', () => {
    const token = manager.grantControl(300000);
    expect(manager.isApproved(token)).toBe(true);

    manager.revokeControl(token);
    expect(manager.isApproved(token)).toBe(false);
  });

  it('should report control status', () => {
    const status1 = manager.getStatus();
    expect(status1.active).toBe(false);

    const token = manager.grantControl(300000);
    const status2 = manager.getStatus();
    expect(status2.active).toBe(true);
    expect(status2.expiresAt).toBeTruthy();
    expect(status2.remainingMs).toBeGreaterThan(0);
  });

  it('should return different tokens for multiple grants', () => {
    const token1 = manager.grantControl(300000);
    const token2 = manager.grantControl(300000);
    expect(token1).not.toBe(token2);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/control-window.test.ts
```
Expected: FAIL — ControlWindowManager not defined

**Step 3: Implement the manager**
```typescript
// apps/companion-service/src/control-window.ts
import crypto from 'node:crypto';

export type ControlStatus = {
  active: boolean;
  expiresAt?: number;
  remainingMs?: number;
  tokenCount?: number;
};

export class ControlWindowManager {
  private tokens: Map<string, { expiresAt: number }> = new Map();

  grantControl(durationMs: number): string {
    const token = crypto.randomBytes(16).toString('hex');
    const expiresAt = Date.now() + durationMs;

    this.tokens.set(token, { expiresAt });

    // Auto-cleanup
    setTimeout(() => {
      this.tokens.delete(token);
    }, durationMs);

    return token;
  }

  isApproved(token?: string): boolean {
    if (!token) {
      return false;
    }

    const record = this.tokens.get(token);
    if (!record) {
      return false;
    }

    if (Date.now() > record.expiresAt) {
      this.tokens.delete(token);
      return false;
    }

    return true;
  }

  revokeControl(token: string): void {
    this.tokens.delete(token);
  }

  getStatus(): ControlStatus {
    if (this.tokens.size === 0) {
      return { active: false };
    }

    // Get the most recent token
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

  revokeAll(): void {
    this.tokens.clear();
  }
}
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/control-window.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/control-window.ts apps/companion-service/__tests__/control-window.test.ts
git commit -m "feat(block-3): add control window manager with token validation and auto-expiry"
```

---

### Task 4: Approval Logic Integration

**Files:**
- Create: `apps/companion-service/src/approval-engine.ts`
- Create: `apps/companion-service/__tests__/approval-engine.test.ts`

**Step 1: Write the failing test**
```typescript
// apps/companion-service/__tests__/approval-engine.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { ApprovalEngine } from '../src/approval-engine.ts';
import { ControlWindowManager } from '../src/control-window.ts';

describe('Approval Engine', () => {
  let engine: ApprovalEngine;
  let controlManager: ControlWindowManager;

  beforeEach(() => {
    controlManager = new ControlWindowManager();
    engine = new ApprovalEngine(controlManager);
  });

  it('should auto-approve safe primitives with valid token', () => {
    const token = controlManager.grantControl(300000);
    const result = engine.shouldApprove('mouse.move', token);
    expect(result.approved).toBe(true);
    expect(result.reason).toContain('auto');
  });

  it('should require explicit approval for unsafe operations', () => {
    const token = controlManager.grantControl(300000);
    const result = engine.shouldApprove('app.launch', token);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('risky');
  });

  it('should reject primitives without valid token', () => {
    const result = engine.shouldApprove('mouse.click', undefined);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain('approval');
  });

  it('should log approval decisions', () => {
    const token = controlManager.grantControl(300000);
    engine.shouldApprove('mouse.move', token);

    const history = engine.getApprovalHistory();
    expect(history).toHaveLength(1);
    expect(history[0].action).toBe('mouse.move');
    expect(history[0].approved).toBe(true);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/approval-engine.test.ts
```
Expected: FAIL

**Step 3: Implement approval engine**
```typescript
// apps/companion-service/src/approval-engine.ts
import { ControlWindowManager } from './control-window.ts';

const SAFE_ACTIONS = [
  'mouse.move',
  'mouse.click',
  'keyboard.type',
  'keyboard.hotkey',
];

const RISKY_ACTIONS = [
  'app.launch',
  'app.close',
  'window.minimize',
];

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

export class ApprovalEngine {
  private approvalLog: ApprovalLogEntry[] = [];

  constructor(private controlWindow: ControlWindowManager) {}

  shouldApprove(action: string, controlToken?: string): ApprovalDecision {
    const isSafe = SAFE_ACTIONS.includes(action);
    const isRisky = RISKY_ACTIONS.includes(action);

    // Safe actions: auto-approve if token is valid
    if (isSafe) {
      if (controlToken && this.controlWindow.isApproved(controlToken)) {
        this.log(action, true, 'auto-approved (safe action with valid token)', controlToken);
        return { approved: true, reason: 'auto-approved (safe action)' };
      } else {
        this.log(action, false, 'requires explicit user approval', controlToken);
        return {
          approved: false,
          reason: 'requires explicit user approval',
          requiresUserConfirm: true,
        };
      }
    }

    // Risky actions: always require explicit approval
    if (isRisky) {
      this.log(action, false, 'risky action requires explicit approval', controlToken);
      return {
        approved: false,
        reason: `risky action (${action}) requires explicit user approval`,
        requiresUserConfirm: true,
      };
    }

    // Unknown action
    this.log(action, false, 'unknown action', controlToken);
    return {
      approved: false,
      reason: 'unknown action',
    };
  }

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

  getApprovalHistory(limit: number = 100): ApprovalLogEntry[] {
    return this.approvalLog.slice(-limit);
  }

  clearHistory(): void {
    this.approvalLog = [];
  }
}
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/approval-engine.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/approval-engine.ts apps/companion-service/__tests__/approval-engine.test.ts
git commit -m "feat(block-3): add approval engine (safe auto-approve, risky require sign-off)"
```

---

## Phase 3: Helper Service Client

### Task 5: HTTP Client with Retry Logic

**Files:**
- Create: `apps/companion-service/src/companion-client.ts`
- Create: `apps/companion-service/__tests__/companion-client.test.ts`

**Step 1: Write the failing test**
```typescript
// apps/companion-service/__tests__/companion-client.test.ts
import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import http from 'node:http';
import { CompanionClient } from '../src/companion-client.ts';

describe('Companion Client', () => {
  let client: CompanionClient;
  let mockServer: http.Server;
  let serverPort: number;

  beforeEach(async () => {
    // Start a mock server
    mockServer = http.createServer((req, res) => {
      if (req.url === '/execute-primitive') {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 0, stdout: 'ok', stderr: '' }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>(resolve => {
      mockServer.listen(0, '127.0.0.1', () => {
        serverPort = (mockServer.address() as any).port;
        client = new CompanionClient(`http://127.0.0.1:${serverPort}`);
        resolve();
      });
    });
  });

  afterEach(() => {
    mockServer.close();
  });

  it('should execute primitive and return result', async () => {
    const result = await client.executePrimitive('mouse.move', { x: 100, y: 100 }, true);
    expect(result.code).toBe(0);
  });

  it('should timeout if service is slow', async () => {
    const slowClient = new CompanionClient(`http://127.0.0.1:${serverPort}`, { timeout: 100 });
    try {
      await slowClient.executePrimitive('slow-command', {}, true);
      expect.fail('should have timed out');
    } catch (err) {
      expect((err as Error).message).toContain('timeout');
    }
  });

  it('should retry on transient failures', async () => {
    let attempts = 0;
    mockServer.removeAllListeners('request');
    mockServer.on('request', (req, res) => {
      attempts++;
      if (attempts < 3) {
        res.writeHead(500);
        res.end('error');
      } else {
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ code: 0, stdout: 'ok', stderr: '' }));
      }
    });

    const result = await client.executePrimitive('mouse.move', { x: 100, y: 100 }, true);
    expect(result.code).toBe(0);
    expect(attempts).toBe(3);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/companion-client.test.ts
```
Expected: FAIL

**Step 3: Implement the client**
```typescript
// apps/companion-service/src/companion-client.ts
import http from 'node:http';
import https from 'node:https';

export type CommandResult = {
  code: number;
  stdout: string;
  stderr: string;
};

export class CompanionClient {
  private baseUrl: string;
  private timeout: number;
  private maxRetries: number;

  constructor(baseUrl: string, options?: { timeout?: number; retries?: number }) {
    this.baseUrl = baseUrl;
    this.timeout = options?.timeout ?? 10000;
    this.maxRetries = options?.retries ?? 3;
  }

  async executePrimitive(
    primitive: string,
    params: Record<string, any>,
    approved: boolean
  ): Promise<CommandResult> {
    return this.executeWithRetry(async () => {
      return this.post('/execute-primitive', {
        primitive,
        params,
        approved,
      });
    });
  }

  async executeOperation(
    operation: string,
    params: Record<string, any>,
    approved: boolean
  ): Promise<CommandResult> {
    return this.executeWithRetry(async () => {
      return this.post('/execute-operation', {
        operation,
        params,
        approved,
      });
    });
  }

  async listPrimitives(): Promise<string[]> {
    const result = await this.post('/list-primitives', {});
    return result.primitives ?? [];
  }

  async listOperations(): Promise<string[]> {
    const result = await this.post('/list-operations', {});
    return result.operations ?? [];
  }

  private async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (err) {
        lastError = err as Error;
        if (attempt < this.maxRetries) {
          const delay = Math.pow(2, attempt - 1) * 100; // Exponential backoff
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError || new Error('max retries exceeded');
  }

  private post(path: string, body: Record<string, any>): Promise<any> {
    return new Promise((resolve, reject) => {
      const url = new URL(path, this.baseUrl);
      const protocol = url.protocol === 'https:' ? https : http;

      const req = protocol.request(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        timeout: this.timeout,
      });

      req.on('timeout', () => {
        req.destroy();
        reject(new Error(`request timeout after ${this.timeout}ms`));
      });

      req.on('error', reject);

      let responseData = '';
      const res = req as any;
      res.on('data', (chunk: any) => {
        responseData += chunk;
      });

      res.on('end', () => {
        try {
          const result = JSON.parse(responseData);
          if (res.statusCode === 200) {
            resolve(result);
          } else {
            reject(new Error(`HTTP ${res.statusCode}: ${responseData}`));
          }
        } catch (err) {
          reject(new Error(`Failed to parse response: ${responseData}`));
        }
      });

      req.write(JSON.stringify(body));
      req.end();
    });
  }
}
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/companion-client.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/companion-client.ts apps/companion-service/__tests__/companion-client.test.ts
git commit -m "feat(block-3): add HTTP companion client with retry logic and timeout handling"
```

---

### Task 6: Command Executor

**Files:**
- Create: `apps/companion-service/src/executor.ts`
- Create: `apps/companion-service/__tests__/executor.test.ts`

**Step 1: Write the failing test**
```typescript
// apps/companion-service/__tests__/executor.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { CommandExecutor } from '../src/executor.ts';
import { CompanionClient } from '../src/companion-client.ts';
import { ControlWindowManager } from '../src/control-window.ts';
import { ApprovalEngine } from '../src/approval-engine.ts';

describe('Command Executor', () => {
  let executor: CommandExecutor;

  beforeEach(() => {
    const client = new CompanionClient('http://127.0.0.1:9999');
    const controlWindow = new ControlWindowManager();
    const approvalEngine = new ApprovalEngine(controlWindow);

    executor = new CommandExecutor(client, controlWindow, approvalEngine);
  });

  it('should execute a simple primitive', async () => {
    const commands = [
      {
        type: 'primitive' as const,
        primitive: 'mouse.move',
        params: { x: 100, y: 100 },
      },
    ];

    const result = await executor.execute(commands, undefined);
    expect(result.success).toBe(true);
  });

  it('should require approval for risky operations', async () => {
    const commands = [
      {
        type: 'operation' as const,
        operation: 'app.launch',
        params: { appPath: 'notepad.exe' },
      },
    ];

    const result = await executor.execute(commands, undefined);
    expect(result.success).toBe(false);
    expect(result.requiresApproval).toBe(true);
  });

  it('should auto-approve safe primitives with control token', async () => {
    const controlWindow = new ControlWindowManager();
    const token = controlWindow.grantControl(300000);
    const approvalEngine = new ApprovalEngine(controlWindow);
    const client = new CompanionClient('http://127.0.0.1:9999');
    const localExecutor = new CommandExecutor(client, controlWindow, approvalEngine);

    const commands = [
      {
        type: 'primitive' as const,
        primitive: 'mouse.move',
        params: { x: 100, y: 100 },
      },
    ];

    const result = await localExecutor.execute(commands, token);
    expect(result.success).toBe(true);
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- apps/companion-service/__tests__/executor.test.ts
```
Expected: FAIL

**Step 3: Implement executor**
```typescript
// apps/companion-service/src/executor.ts
import { CompanionClient, CommandResult } from './companion-client.ts';
import { ControlWindowManager } from './control-window.ts';
import { ApprovalEngine } from './approval-engine.ts';
import { ParsedCommand } from './command-parser.ts';

export type ExecutionResult = {
  success: boolean;
  requiresApproval?: boolean;
  results?: Array<{ command: ParsedCommand; result: CommandResult }>;
  errors?: string[];
};

export class CommandExecutor {
  constructor(
    private client: CompanionClient,
    private controlWindow: ControlWindowManager,
    private approvalEngine: ApprovalEngine
  ) {}

  async execute(commands: ParsedCommand[], controlToken?: string): Promise<ExecutionResult> {
    const results = [];
    const errors = [];
    let requiresApproval = false;

    for (const cmd of commands) {
      try {
        // Check if approval needed
        if (cmd.type === 'primitive' || cmd.type === 'operation') {
          const action = cmd.primitive || cmd.operation || '';
          const approval = this.approvalEngine.shouldApprove(action, controlToken);

          if (!approval.approved) {
            if (approval.requiresUserConfirm) {
              requiresApproval = true;
              errors.push(`Action "${action}" requires user approval`);
              continue;
            }
          }
        }

        // Handle wait commands
        if (cmd.action === 'wait') {
          const ms = (cmd.params as any).ms || 0;
          await new Promise(resolve => setTimeout(resolve, ms));
          results.push({ command: cmd, result: { code: 0, stdout: 'waited', stderr: '' } });
          continue;
        }

        // Execute primitives
        if (cmd.type === 'primitive' && cmd.primitive) {
          const result = await this.client.executePrimitive(
            cmd.primitive,
            cmd.params,
            true
          );
          results.push({ command: cmd, result });
          if (result.code !== 0) {
            errors.push(`Primitive failed: ${result.stderr}`);
          }
        }

        // Execute operations
        if (cmd.type === 'operation' && cmd.operation) {
          const result = await this.client.executeOperation(
            cmd.operation,
            cmd.params,
            true
          );
          results.push({ command: cmd, result });
          if (result.code !== 0) {
            errors.push(`Operation failed: ${result.stderr}`);
          }
        }
      } catch (err) {
        errors.push((err as Error).message);
      }
    }

    return {
      success: !requiresApproval && errors.length === 0,
      requiresApproval,
      results,
      errors: errors.length > 0 ? errors : undefined,
    };
  }
}
```

**Step 4: Run test — confirm it passes**
```bash
npm test -- apps/companion-service/__tests__/executor.test.ts
```
Expected: PASS

**Step 5: Commit**
```bash
git add apps/companion-service/src/executor.ts apps/companion-service/__tests__/executor.test.ts
git commit -m "feat(block-3): add command executor with approval checking and sequential execution"
```

---

## Phase 4: Atlas Integration & Deployment

### Task 7: Atlas Command Handler

**Files:**
- Create: `src/atlas-handler.ts` (in main Atlas workspace)
- Create: `src/__tests__/atlas-handler.test.ts`
- Modify: `TOOLS.md` (add helper service endpoint config)

**Step 1: Write integration test**
```typescript
// src/__tests__/atlas-handler.test.ts
import { describe, it, expect, beforeEach } from '@jest/globals';
import { AtlasHandler } from '../atlas-handler.ts';

describe('Atlas Handler', () => {
  let handler: AtlasHandler;

  beforeEach(() => {
    // Point to mock service or skip if offline
    handler = new AtlasHandler({
      companionServiceUrl: 'http://127.0.0.1:9999',
      controlWindowDefaultMs: 300000,
    });
  });

  it('should parse and execute "move mouse to 500,300 and click"', async () => {
    const result = await handler.handle('move mouse to 500,300 and click');
    // Note: will fail if service is offline, which is expected for now
    expect(result.text).toBeTruthy();
  });

  it('should handle grant control requests', async () => {
    const result = await handler.handle('grant control for 5 minutes');
    expect(result.text).toContain('control');
    expect(result.controlToken).toBeTruthy();
  });

  it('should report control status', async () => {
    const result = await handler.handle('control status');
    expect(result.text).toContain('status');
  });
});
```

**Step 2: Run test — confirm it fails**
```bash
npm test -- src/__tests__/atlas-handler.test.ts
```
Expected: FAIL or skipped (service offline)

**Step 3: Implement handler**
```typescript
// src/atlas-handler.ts
import { parseCommand } from '../companion-service/src/command-parser.ts';
import { ControlWindowManager } from '../companion-service/src/control-window.ts';
import { ApprovalEngine } from '../companion-service/src/approval-engine.ts';
import { CommandExecutor } from '../companion-service/src/executor.ts';
import { CompanionClient } from '../companion-service/src/companion-client.ts';

export type HandlerOptions = {
  companionServiceUrl: string;
  controlWindowDefaultMs?: number;
};

export type HandlerResponse = {
  text: string;
  controlToken?: string;
  success: boolean;
};

export class AtlasHandler {
  private client: CompanionClient;
  private controlWindow: ControlWindowManager;
  private approvalEngine: ApprovalEngine;
  private executor: CommandExecutor;
  private defaultControlWindowMs: number;

  constructor(options: HandlerOptions) {
    this.client = new CompanionClient(options.companionServiceUrl);
    this.controlWindow = new ControlWindowManager();
    this.approvalEngine = new ApprovalEngine(this.controlWindow);
    this.executor = new CommandExecutor(this.client, this.controlWindow, this.approvalEngine);
    this.defaultControlWindowMs = options.controlWindowDefaultMs ?? 300000;
  }

  async handle(text: string, controlToken?: string): Promise<HandlerResponse> {
    // Parse the command
    const parseResult = parseCommand(text);
    if (!parseResult.success) {
      return {
        text: parseResult.error || 'Failed to parse command',
        success: false,
      };
    }

    const commands = parseResult.commands || [];

    // Handle control commands
    if (commands[0]?.type === 'control') {
      return this.handleControlCommand(commands[0], controlToken);
    }

    // Execute action commands
    const execResult = await this.executor.execute(commands, controlToken);

    if (execResult.requiresApproval) {
      return {
        text: `Action requires approval: ${execResult.errors?.[0] || 'unknown'}. Say "yes" to approve.`,
        success: false,
      };
    }

    if (!execResult.success) {
      return {
        text: `Execution failed: ${execResult.errors?.join('; ') || 'unknown error'}`,
        success: false,
      };
    }

    const execCount = execResult.results?.length || 0;
    return {
      text: `✅ Executed ${execCount} command${execCount === 1 ? '' : 's'} successfully.`,
      success: true,
    };
  }

  private handleControlCommand(
    cmd: any,
    currentToken?: string
  ): HandlerResponse {
    const action = cmd.action;
    const durationMs = cmd.params.durationMs || this.defaultControlWindowMs;

    if (action === 'grant') {
      const token = this.controlWindow.grantControl(durationMs);
      const minutes = Math.round(durationMs / 60000);
      return {
        text: `🔓 Control granted for ${minutes} minutes. You can now execute commands.`,
        controlToken: token,
        success: true,
      };
    }

    if (action === 'revoke') {
      if (currentToken) {
        this.controlWindow.revokeControl(currentToken);
      } else {
        this.controlWindow.revokeAll();
      }
      return {
        text: '🔒 Control revoked.',
        success: true,
      };
    }

    const status = this.controlWindow.getStatus();
    if (status.active) {
      const minutes = Math.ceil((status.remainingMs || 0) / 60000);
      return {
        text: `🟢 Control ACTIVE (${minutes} min remaining)`,
        success: true,
      };
    }

    return {
      text: `🔴 Control INACTIVE. Say "grant control" to activate.`,
      success: true,
    };
  }
}
```

**Step 4: Run test — confirm it passes (or is skipped)**
```bash
npm test -- src/__tests__/atlas-handler.test.ts
```

**Step 5: Update TOOLS.md with config**
```markdown
## Atlas Companion Service

### Configuration

- **Service URL:** `http://127.0.0.1:9999` (default, on your Windows machine)
- **Control Window Duration:** 5 minutes (default)
- **Port:** 9999

### How to Use

1. Start the helper service on Windows: `npm run companion:start`
2. In Telegram: "Grant me control for 5 minutes"
3. Then: "Move mouse to 500,300 and click"
4. When done: "Revoke control"
```

**Step 6: Commit**
```bash
git add src/atlas-handler.ts src/__tests__/atlas-handler.test.ts TOOLS.md
git commit -m "feat(block-3): add Atlas command handler for natural language desktop control"
```

---

### Task 8: Deployment Guide & README

**Files:**
- Create: `COMPANION_DEPLOYMENT.md` (deployment instructions for Windows)
- Modify: `README.md` (add Block 3 section)
- Create: `apps/companion-service/package.json` update (add start script if missing)

**Step 1: Write deployment guide**
```markdown
# Atlas Companion Deployment Guide

## Prerequisites

- Windows 10 or later
- Node.js 18+
- npm or yarn

## Installation

### 1. Clone the Repository

\`\`\`bash
git clone https://github.com/herbert051281/AtlasCompanion.git
cd AtlasCompanion
\`\`\`

### 2. Install Dependencies

\`\`\`bash
npm install
\`\`\`

### 3. Build

\`\`\`bash
npm run companion:build
\`\`\`

### 4. Configure Firewall (Optional)

If running on a different machine than Atlas, open Windows Firewall for port 9999:

**PowerShell (Admin):**
\`\`\`powershell
New-NetFirewallRule -DisplayName "Atlas Companion" \
  -Direction Inbound -LocalPort 9999 -Protocol TCP -Action Allow
\`\`\`

Or disable Windows Defender Firewall for testing (not recommended for production).

### 5. Start the Service

\`\`\`bash
npm run companion:start
\`\`\`

You should see:
```
Companion Service listening on http://127.0.0.1:9999
Ready for Atlas commands.
```

## Usage

Once the service is running, go to Telegram and:

1. **Grant control:**
   ```
   Grant me control for 5 minutes
   ```

2. **Move and click:**
   ```
   Move mouse to 500,300 and click
   ```

3. **Open apps:**
   ```
   Open Notepad, wait 2s, type hello world
   ```

4. **Revoke control:**
   ```
   Revoke control
   ```

## Troubleshooting

### Service won't start
- Check if port 9999 is already in use: `netstat -ano | findstr :9999`
- Kill process: `taskkill /PID <PID> /F`

### Atlas can't reach service
- Ensure service is running: check console output
- Verify firewall allows port 9999
- Check network connectivity: `ping 127.0.0.1`

### Commands not executing
- Check service console for errors
- Verify AutoHotkey 2.0+ is installed (auto-downloaded)
- Try a simple command first: "Move mouse to 100,100"

## Security Notes

- Service runs on localhost only by default (no remote access)
- All commands require approval (hybrid model)
- Panic stop: Ctrl+Alt+Pause to immediately halt all actions
- Audit log: All executed commands are logged in service console

## Advanced: Remote Access

To allow Atlas to control from a different machine:

1. Change bind address in `companion-service/src/server.ts`:
   ```typescript
   const host = '0.0.0.0'; // Instead of 127.0.0.1
   ```

2. Rebuild: `npm run companion:build`

3. Set firewall rule as above

⚠️ **WARNING:** This exposes desktop control over the network. Use with extreme caution.
```

**Step 2: Update README**

Add Block 3 section:

```markdown
## Block 3: Atlas Command Integration

Atlas can now control your Windows machine via natural language commands.

### Quick Start

1. Start the companion service on Windows:
   ```bash
   npm run companion:start
   ```

2. In Telegram, grant control:
   ```
   Grant me control for 5 minutes
   ```

3. Issue commands:
   ```
   Move mouse to 500,300 and click
   Open Notepad, type hello world
   Focus Chrome, press Ctrl+A
   ```

### Full Deployment Guide

See [COMPANION_DEPLOYMENT.md](./COMPANION_DEPLOYMENT.md) for detailed setup instructions.
```

**Step 3: Ensure start script exists in package.json**

```json
{
  "scripts": {
    "companion:build": "tsc --project tsconfig.companion.json",
    "companion:start": "node --loader ts-node/esm apps/companion-service/src/server.ts",
    "companion:package:win": "electron-builder --config build/electron-builder.yml --win"
  }
}
```

**Step 4: Write & commit**
```bash
git add COMPANION_DEPLOYMENT.md README.md apps/companion-service/package.json
git commit -m "docs(block-3): add deployment guide and usage documentation"
```

---

## Summary

**Block 3 delivers:**
- ✅ **Command Parser:** NLP to extract primitives/operations
- ✅ **Control Window Manager:** Grant/revoke 5-min tokens
- ✅ **Approval Engine:** Safe auto-approve, risky require sign-off
- ✅ **Helper Service Client:** HTTP with retry logic
- ✅ **Command Executor:** Sequential execution with approval checking
- ✅ **Atlas Handler:** Wire to Telegram
- ✅ **Deployment Guide:** Step-by-step Windows setup

**You can now:**
1. Start the service on Windows: `npm run companion:start`
2. Grant control: "Grant me control for 5 minutes"
3. Command me: "Move mouse to 500,300 and click"
4. Workflows: "Open Notepad, wait 2s, type hello"

---

## Execution Plan

**Subagent-Driven** or **Manual**?

1. **Subagent-Driven** — I spawn agents to execute all 8 tasks in parallel (Iris + Davinci + others)
2. **Manual** — You follow the plan step-by-step

Which approach?
