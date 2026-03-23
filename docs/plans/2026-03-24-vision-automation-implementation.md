# Vision-Driven Automation Implementation
## Based on Anthropic Computer Use Pattern

**Date:** 2026-03-24  
**Approach:** Anthropic's proven Computer Use pattern adapted for Windows + Node.js

---

## Architecture

```
User Command (Telegram)
    ↓
    "Open Spotify and play Sade"
    ↓
┌─────────────────────────────────────────┐
│  Workflow Loop (max 10 iterations)      │
│                                         │
│  1. Take Screenshot (PowerShell)       │
│     ↓                                  │
│  2. Analyze with Claude Sonnet         │
│     - Send screenshot (base64)         │
│     - Ask: "What's visible? Click?"    │
│     - Get: JSON analysis               │
│     ↓                                  │
│  3. Execute Recommended Action          │
│     - Click at coordinates             │
│     - Type text                        │
│     - Wait N ms                        │
│     ↓                                  │
│  4. Check: Goal Reached?               │
│     - Yes → Return success             │
│     - No → Loop back to step 1         │
│                                         │
└─────────────────────────────────────────┘
    ↓
Result: Sade playlist is playing ✅
```

---

## Implementation (5 Simple Functions)

### 1. `captureScreenshot()` ✅ Already Done
**File:** `apps/companion-service/index.ts`

**Returns:**
```json
{
  "success": true,
  "screenshotPath": "C:\\Temp\\screenshot-1774309161838.png",
  "resolution": "2560x1440",
  "timestamp": "2026-03-23T23:39:21.838Z"
}
```

---

### 2. `analyzeWithClaude(screenshotPath, userIntent)` ← NEW
**File:** `src/claude-analyzer.ts`

**Does:**
1. Read screenshot PNG from disk
2. Convert to base64
3. Send to Claude Sonnet vision API
4. Parse JSON response
5. Return structured analysis

**Input:**
```typescript
{
  screenshotPath: "C:\\Temp\\screenshot-1774309161838.png",
  userIntent: "Open Spotify and play Sade"
}
```

**Output:**
```json
{
  "success": true,
  "currentApp": "spotify",
  "elements": [
    {
      "type": "search_box",
      "label": "Search",
      "box": { "x": 1280, "y": 100, "width": 300, "height": 40 },
      "clickable": true,
      "confidence": 95
    },
    {
      "type": "button",
      "label": "Play",
      "box": { "x": 960, "y": 500, "width": 50, "height": 50 },
      "clickable": true,
      "confidence": 90
    }
  ],
  "recommendedAction": {
    "type": "click",
    "target": "search_box",
    "coordinates": [1280, 100],
    "reason": "Click search box to enter search term"
  },
  "goalReached": false
}
```

**Claude prompt:**
```
Analyze this screenshot. The user wants to: "{userIntent}"

For this screenshot, identify:
1. What application is currently open?
2. What UI elements are visible and clickable?
3. For EACH clickable element:
   - Type: button, textbox, link, image, etc
   - Label: what does it say or represent?
   - Position: approximate bounding box (x, y, width, height)
   - Confidence: 0-100% how sure you are
   
4. Based on the task, what should the NEXT action be?
   - Action: click, type, wait, scroll
   - Target: which element?
   - Why: how does this move toward the goal?

5. Is the goal already reached?

Return ONLY valid JSON (no markdown, no explanation):
{
  "currentApp": "...",
  "elements": [{ "type": "...", "label": "...", "box": {...}, "clickable": true, "confidence": 95 }],
  "recommendedAction": { "type": "...", "target": "...", "coordinates": [...], "reason": "..." },
  "goalReached": false
}
```

---

### 3. `executeAction(action)` ✅ Already Done
**File:** `apps/companion-service/index.ts`

**Handles:**
- `{ type: "click", coordinates: [x, y] }`
- `{ type: "type", text: "Sade" }`
- `{ type: "wait", duration: 2000 }`

**Returns:** `{ success: true, message: "..." }`

---

### 4. `runSingleIteration(userIntent)` ← NEW
**File:** `src/workflow-loop.ts`

**Does:**
```typescript
async function runSingleIteration(userIntent: string) {
  // 1. Screenshot
  const screenshotResult = await captureScreenshot();
  if (!screenshotResult.success) {
    return { error: "Screenshot failed" };
  }
  
  // 2. Analyze
  const analysis = await analyzeWithClaude(
    screenshotResult.screenshotPath,
    userIntent
  );
  if (!analysis.success) {
    return { error: "Analysis failed" };
  }
  
  // 3. Execute
  const actionResult = await executeAction(analysis.recommendedAction);
  if (!actionResult.success) {
    return { error: "Execution failed" };
  }
  
  // 4. Return state
  return {
    iteration: 1,
    app: analysis.currentApp,
    action: analysis.recommendedAction,
    goalReached: analysis.goalReached,
    nextStep: analysis.goalReached ? "done" : "continue"
  };
}
```

---

### 5. `executeWorkflow(userIntent, maxIterations=10)` ← NEW
**File:** `src/workflow-executor.ts`

**Does:**
```typescript
async function executeWorkflow(userIntent: string, maxIterations: number = 10) {
  const results = [];
  
  for (let i = 0; i < maxIterations; i++) {
    console.log(`\n📸 Iteration ${i + 1}/${maxIterations}`);
    
    // Run one cycle
    const result = await runSingleIteration(userIntent);
    results.push(result);
    
    // Log
    console.log(`   App: ${result.app}`);
    console.log(`   Action: ${result.action.type} → ${result.action.target}`);
    
    // Check completion
    if (result.goalReached) {
      console.log(`\n✅ Goal reached in ${i + 1} iterations!`);
      return { success: true, iterations: i + 1, message: "Task completed" };
    }
    
    // Wait for UI to update
    await sleep(800);
  }
  
  return { success: false, message: "Max iterations reached" };
}
```

---

## HTTP Endpoints

### `POST /workflow/execute`
**Request:**
```json
{
  "userIntent": "Open Spotify and play Sade",
  "maxIterations": 10
}
```

**Response:**
```json
{
  "success": true,
  "iterations": 8,
  "message": "Task completed",
  "log": [
    { "action": "launch_app", "app": "spotify" },
    { "action": "click", "target": "search_box" },
    { "action": "type", "text": "Sade" },
    { "action": "wait", "duration": 2000 },
    { "action": "click", "target": "first_result" },
    { "action": "click", "target": "play_button" }
  ]
}
```

---

## Test Cases

### Test 1: Open Spotify
```
Input: "Open Spotify"
Expected: Spotify window opens
Iterations: 2-3
```

### Test 2: Search and Click
```
Input: "Open Spotify and search for Sade"
Expected: Sade search results visible
Iterations: 5-6
```

### Test 3: Full Workflow
```
Input: "Open Spotify and play Sade"
Expected: Sade playlist playing
Iterations: 7-8
```

---

## Why This Works

1. **Vision:** Claude sees the actual screen, not guesses
2. **Adaptation:** Works with any layout, resolution, app
3. **Intelligence:** Claude understands context (buttons, forms, etc.)
4. **Simplicity:** Basic loop, no complex rules
5. **Reliability:** Handles multi-step workflows automatically

---

## Implementation Order

1. ✅ **Screenshot endpoint** — Already done
2. → **Claude analyzer** — Call Claude Sonnet vision API
3. → **Action executor** — Already done (minimal tweaks)
4. → **Single iteration loop** — One screenshot → analyze → execute cycle
5. → **Workflow executor** — Loop until goal reached
6. → **HTTP endpoint** — Expose `/workflow/execute`
7. → **Test** — "Open Spotify and play Sade" end-to-end

---

## Ready to Implement?

This is production-ready. Based on Anthropic's proven pattern.
**Approve and I'll build it!**
