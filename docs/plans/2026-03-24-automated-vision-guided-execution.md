# Automated Vision-Guided Execution — Complete Redesign

**Date:** 2026-03-24  
**Problem:** Atlas gives blind coordinates without understanding the UI. Not human-like at all.

**Goal:** Build a system where:
1. Service automatically takes screenshots
2. Atlas analyzes them with Claude vision (Sonnet)
3. Atlas understands the UI layout
4. Atlas identifies clickable elements
5. Atlas executes intelligent actions
6. **All automatically — no manual coordinate guessing**

---

## The Complete Loop

```
User Command (Telegram)
    ↓ "Open Spotify and play Sade"
    ↓
Atlas (me, VPS)
    ├─ Parse intent
    ├─ Queue initial action: "screenshot"
    ↓
Windows Service
    ├─ Take screenshot
    ├─ POST screenshot to analysis endpoint
    ↓
Atlas analyzes screenshot
    ├─ Download PNG
    ├─ Call Claude Sonnet vision model
    ├─ Identify: app type, UI elements, buttons, text boxes
    ├─ Find where to click based on intent
    ├─ Generate next action
    ↓
Queue next action (click, type, etc.)
    ↓
Windows Service executes
    ├─ Click at coordinates identified by vision
    ├─ Type text
    ├─ Wait for UI update
    ↓
Loop: Take screenshot → Analyze → Decide → Execute
    ↓
Until goal reached (Sade playlist is playing)
```

---

## System Architecture

### Phase 1: Automated Screenshot Loop
**Service behavior:**
- After executing an action, automatically take another screenshot
- Send screenshot to analysis queue
- Wait for next action recommendation

**Endpoints needed:**
- `POST /execute-and-screenshot` — Execute action, then take screenshot
- `POST /analyze-and-decide` — Analyze screenshot, decide next action

### Phase 2: Vision Analysis (Claude Sonnet)
**Input:** Screenshot PNG (base64)  
**Process:**
```typescript
const response = await claude.messages.create({
  model: "claude-3-5-sonnet-20241022",
  messages: [{
    role: "user",
    content: [
      { type: "image", source: { type: "base64", media_type: "image/png", data: base64Image } },
      { type: "text", text: `Analyze this screenshot. 
        - What app is open?
        - What UI elements are visible? (buttons, search boxes, text fields)
        - For EACH element: type, label, approximate bounding box (x, y, width, height)
        - Which elements are clickable?
        
        Return JSON: { app, elements: [{ type, label, box: {x, y, w, h}, clickable }] }` }
    ]
  }]
});
```

**Output:** Structured JSON with all UI elements and their locations

### Phase 3: Decision Engine
**Input:**
- User intent: "Open Spotify and play Sade"
- Current screenshot analysis
- Previous actions taken

**Logic:**
```typescript
function decideNextAction(intent, analysis, history) {
  // Look at what's on screen
  const currentApp = analysis.app;
  const elements = analysis.elements;
  
  if (intent.includes("open spotify")) {
    if (currentApp === "Spotify") {
      // Spotify is open, move to next intent
      return { action: "search", query: "Sade" };
    } else {
      // Need to open Spotify
      return { action: "launch_app", app: "spotify" };
    }
  }
  
  if (intent.includes("search") && currentApp === "Spotify") {
    // Find search box
    const searchBox = elements.find(e => e.type === "search" || e.label.includes("search"));
    if (searchBox) {
      return { action: "click", position: searchBox.box.center() };
    }
  }
  
  if (previousAction === "click_search" && !history.includes("type_query")) {
    // Search was clicked, now type
    return { action: "type", text: "Sade" };
  }
  
  if (previousAction === "type_query") {
    // Wait for results to appear
    return { action: "wait", duration: 2000 };
  }
  
  // After wait, look for first result
  if (elements.some(e => e.label.includes("Sade"))) {
    const result = elements.find(e => e.label.includes("Sade"));
    return { action: "click", position: result.box.center() };
  }
  
  // Look for play button
  if (elements.some(e => e.type === "button" && e.label === "Play")) {
    const playBtn = elements.find(e => e.type === "button" && e.label === "Play");
    return { action: "click", position: playBtn.box.center() };
  }
  
  return { action: "screenshot" }; // Keep analyzing
}
```

### Phase 4: Execution Loop
**Pseudo-code:**
```typescript
async function executeWorkflow(userIntent) {
  let actionHistory = [];
  let maxIterations = 10; // Prevent infinite loops
  
  while (actionHistory.length < maxIterations) {
    // 1. Take screenshot
    const screenshot = await service.screenshot();
    
    // 2. Analyze it
    const analysis = await visionAnalyzer.analyze(screenshot.path);
    
    // 3. Decide next action
    const decision = decideNextAction(userIntent, analysis, actionHistory);
    
    // 4. Execute
    if (decision.action === "done") {
      return { success: true, message: "Goal reached!" };
    }
    
    await service.execute(decision);
    actionHistory.push(decision);
    
    // 5. Wait a bit for UI to update
    await sleep(500);
  }
  
  return { success: false, message: "Max iterations reached" };
}
```

---

## Implementation Plan

### Task 1: Screenshot + Analyze Endpoint
**Endpoint:** `POST /analyze-screenshot`
- Takes screenshot automatically
- Passes to Claude vision
- Returns analysis: `{ app, elements: [...] }`

### Task 2: Vision Decision Engine
**Module:** `src/vision-decision-engine.ts`
- Receives: (userIntent, screenshotAnalysis, actionHistory)
- Returns: Next action (click, type, wait, screenshot)
- Understands context: "If Spotify is open and search box is visible, click search"

### Task 3: Workflow Executor
**Module:** `src/workflow-executor.ts`
- Loop: Screenshot → Analyze → Decide → Execute
- Tracks action history
- Detects completion ("Music is now playing")
- Max 10 iterations safety limit

### Task 4: Integration
- Add `/analyze-screenshot` endpoint
- Wire decision engine + executor
- Test: "Open Spotify and play Sade" → full workflow works

---

## Why This Works

✅ **Sees the screen** — Claude vision analyzes actual UI  
✅ **Understands context** — Knows app type, element types, clickable regions  
✅ **Acts intelligently** — Clicks based on what's visible, not blind guesses  
✅ **Adapts to changes** — Different Spotify layouts, resolutions, UI updates — all handled  
✅ **Handles multi-step workflows** — Search → wait → click result → play → done  
✅ **No external tools** — All runs on your Windows machine via Claude API  

---

## Example Execution (Spotify)

```
User: "Open Spotify and play Sade"

Iteration 1:
  Screenshot → Desktop visible
  Analysis: { app: "desktop", elements: [...] }
  Decision: Launch Spotify
  Execute: app.launch("spotify.exe")

Iteration 2:
  Screenshot → Spotify opening (splash screen)
  Analysis: { app: "spotify_splash", elements: [...] }
  Decision: Wait for Spotify to load
  Execute: wait(2000)

Iteration 3:
  Screenshot → Spotify fully open
  Analysis: { app: "spotify", elements: [
    { type: "search", label: "Search", box: {x: 1280, y: 100} },
    { type: "button", label: "Home", box: {x: 100, y: 200} },
    ...
  ]}
  Decision: Click search box
  Execute: click(1280, 100)

Iteration 4:
  Screenshot → Search box is focused (cursor visible)
  Analysis: { app: "spotify", elements: [...] }
  Decision: Type "Sade"
  Execute: type("Sade")

Iteration 5:
  Screenshot → Search results appearing
  Analysis: { app: "spotify", elements: [
    { type: "result", label: "Sade - Best Of", box: {...} },
    { type: "result", label: "Sade Playlist", box: {...} },
    ...
  ]}
  Decision: Wait for results to fully load
  Execute: wait(1500)

Iteration 6:
  Screenshot → Results fully loaded
  Analysis: { app: "spotify", elements: [...] }
  Decision: Click "Sade - Best Of" result
  Execute: click(960, 300)

Iteration 7:
  Screenshot → Album page open, play button visible
  Analysis: { app: "spotify", elements: [
    { type: "button", label: "Play", box: {x: 960, y: 250} },
    ...
  ]}
  Decision: Click play button
  Execute: click(960, 250)

Iteration 8:
  Screenshot → Music playing (player showing elapsed time)
  Analysis: { app: "spotify", playingNow: "Sade - Smooth Operator" }
  Decision: Goal reached!
  Execute: return { success: true }

Result: ✅ "Sade is now playing!"
```

---

## Success Criteria

1. ✅ Service can take screenshots on demand
2. ✅ Claude Sonnet analyzes and identifies UI elements accurately
3. ✅ Decision engine generates intelligent next actions
4. ✅ Full workflow: "Open Spotify and play Sade" works end-to-end
5. ✅ Works with ANY app (not just Spotify)
6. ✅ Handles multi-step sequences automatically
7. ✅ No blind coordinate guessing

---

## Ready to Build?

This approach makes Atlas **genuinely intelligent**:
- It SEES your screen
- It UNDERSTANDS the UI
- It DECIDES what to do
- It EXECUTES accurately

No more robot guessing. Human-like interaction.

**Approve to proceed?**
