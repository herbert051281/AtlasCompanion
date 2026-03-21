/**
 * NLP Command Parser for Atlas Companion
 *
 * Parses natural language commands into structured primitives and operations.
 */

export type ParsedCommand = {
  type: 'primitive' | 'operation' | 'control';
  primitive?: string;
  operation?: string;
  action?: string;
  params: Record<string, unknown>;
};

export type ParseResult = {
  success: boolean;
  commands?: ParsedCommand[];
  error?: string;
};

/**
 * Hotkey mapping from human-readable to AutoHotkey format
 */
const HOTKEY_MAP: Record<string, string> = {
  // Ctrl combinations
  'ctrl+a': '^a',
  'ctrl+c': '^c',
  'ctrl+v': '^v',
  'ctrl+x': '^x',
  'ctrl+s': '^s',
  'ctrl+z': '^z',
  'ctrl+y': '^y',
  'ctrl+f': '^f',
  'ctrl+n': '^n',
  'ctrl+o': '^o',
  'ctrl+p': '^p',
  'ctrl+w': '^w',
  // Alt combinations
  'alt+tab': '!{Tab}',
  'alt+f4': '!{F4}',
  'alt+enter': '!{Enter}',
  // Win combinations
  'win+d': '#{d}',
  'win+e': '#{e}',
  'win+r': '#{r}',
  'win+l': '#{l}',
  'win+v': '#{v}',
  'win+tab': '#{Tab}',
  // Ctrl+Shift combinations
  'ctrl+shift+esc': '^+{Esc}',
  'ctrl+shift+n': '^+n',
  // Special keys
  'enter': '{Enter}',
  'tab': '{Tab}',
  'escape': '{Escape}',
  'esc': '{Escape}',
  'backspace': '{Backspace}',
  'delete': '{Delete}',
  'del': '{Delete}',
  'home': '{Home}',
  'end': '{End}',
  'pageup': '{PgUp}',
  'pagedown': '{PgDn}',
  'up': '{Up}',
  'down': '{Down}',
  'left': '{Left}',
  'right': '{Right}',
  'space': '{Space}',
  'f1': '{F1}',
  'f2': '{F2}',
  'f3': '{F3}',
  'f4': '{F4}',
  'f5': '{F5}',
  'f6': '{F6}',
  'f7': '{F7}',
  'f8': '{F8}',
  'f9': '{F9}',
  'f10': '{F10}',
  'f11': '{F11}',
  'f12': '{F12}',
};

/**
 * Parse a natural language command into structured commands
 */
export function parseCommand(text: string): ParseResult {
  const trimmed = text.trim();
  if (!trimmed) {
    return { success: false, error: 'Empty command' };
  }

  return parseSingleStatement(trimmed);
}

/**
 * Parse a single statement (no chaining yet - that's Task 2)
 */
function parseSingleStatement(text: string): ParseResult {
  const lower = text.toLowerCase();

  // --- Mouse primitives ---

  // "move mouse to X,Y" or "go to X,Y"
  const moveMatch = lower.match(/^(?:move\s+mouse\s+to|go\s+to)\s+(\d+)\s*[,\s]\s*(\d+)$/);
  if (moveMatch) {
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'mouse.move',
          params: { x: parseInt(moveMatch[1], 10), y: parseInt(moveMatch[2], 10) },
        },
      ],
    };
  }

  // Check for malformed move command (coordinates expected but invalid)
  if (lower.match(/^(?:move\s+mouse\s+to|go\s+to)\s+/)) {
    return { success: false, error: 'Invalid coordinate format. Expected: move mouse to X,Y' };
  }

  // "double click at X,Y"
  const doubleClickMatch = lower.match(/^double\s+click\s+at\s+(\d+)\s*[,\s]\s*(\d+)$/);
  if (doubleClickMatch) {
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'mouse.click',
          params: {
            x: parseInt(doubleClickMatch[1], 10),
            y: parseInt(doubleClickMatch[2], 10),
            clickCount: 2,
            button: 'left',
          },
        },
      ],
    };
  }

  // "right click at X,Y"
  const rightClickMatch = lower.match(/^right\s+click\s+at\s+(\d+)\s*[,\s]\s*(\d+)$/);
  if (rightClickMatch) {
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'mouse.click',
          params: {
            x: parseInt(rightClickMatch[1], 10),
            y: parseInt(rightClickMatch[2], 10),
            button: 'right',
          },
        },
      ],
    };
  }

  // "click at X,Y"
  const clickAtMatch = lower.match(/^click\s+at\s+(\d+)\s*[,\s]\s*(\d+)$/);
  if (clickAtMatch) {
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'mouse.click',
          params: {
            x: parseInt(clickAtMatch[1], 10),
            y: parseInt(clickAtMatch[2], 10),
            button: 'left',
          },
        },
      ],
    };
  }

  // Check for malformed click at command (coordinates expected but invalid)
  if (lower.match(/^(?:double\s+)?(?:right\s+)?click\s+at\s+/)) {
    return { success: false, error: 'Invalid coordinate format. Expected: click at X,Y' };
  }

  // "click" (at current position)
  if (lower === 'click') {
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'mouse.click',
          params: { button: 'left' },
        },
      ],
    };
  }

  // "right click" (at current position)
  if (lower === 'right click') {
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'mouse.click',
          params: { button: 'right' },
        },
      ],
    };
  }

  // "double click" (at current position)
  if (lower === 'double click') {
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'mouse.click',
          params: { clickCount: 2, button: 'left' },
        },
      ],
    };
  }

  // --- Keyboard primitives ---

  // "type <text>"
  if (lower.startsWith('type ')) {
    const textToType = text.slice(5); // Preserve original case
    return {
      success: true,
      commands: [
        {
          type: 'primitive',
          primitive: 'keyboard.type',
          params: { text: textToType },
        },
      ],
    };
  }

  // "press <key combo>"
  if (lower.startsWith('press ')) {
    const keyCombo = text.slice(6).trim();
    const normalizedKey = keyCombo.toLowerCase().replace(/\s+/g, '');

    // Look up in hotkey map
    const hotkeyValue = HOTKEY_MAP[normalizedKey];
    if (hotkeyValue) {
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

    // Fallback: convert generic Ctrl/Alt/Win+key
    const genericMatch = normalizedKey.match(/^(ctrl|alt|win|shift)\+(.+)$/);
    if (genericMatch) {
      const modifier = genericMatch[1];
      const key = genericMatch[2];
      let modChar = '';
      switch (modifier) {
        case 'ctrl':
          modChar = '^';
          break;
        case 'alt':
          modChar = '!';
          break;
        case 'win':
          modChar = '#';
          break;
        case 'shift':
          modChar = '+';
          break;
      }
      return {
        success: true,
        commands: [
          {
            type: 'primitive',
            primitive: 'keyboard.hotkey',
            params: { hotkey: `${modChar}${key}` },
          },
        ],
      };
    }

    // Unrecognized key combo
    return {
      success: false,
      error: `Unknown key combination: "${keyCombo}". Try: Ctrl+A, Alt+Tab, Enter, etc.`,
    };
  }

  // --- Fallback ---
  return {
    success: false,
    error: `I didn't understand "${text}". Try: "move mouse to 500,300", "click at 500,300", "type hello", "press Ctrl+A"`,
  };
}
