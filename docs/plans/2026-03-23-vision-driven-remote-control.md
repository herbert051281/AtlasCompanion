# Vision-Driven Remote Control System — Design Document

**Date:** 2026-03-23  
**Goal:** Enable Atlas to see the user's screen, understand UI elements, and execute actions intelligently (like a human would)

---

## Problem Statement

**Current Issue:**
- Service sends hardcoded mouse coordinates (e.g., "click 960,100")
- Coordinates don't work because UI layout varies by resolution, app state, window size
- System acts like a blind robot, not a human

**Solution:**
- Service automatically captures screenshots
- Atlas analyzes screenshots with vision AI
- Atlas identifies clickable elements (buttons, text boxes, images)
- Atlas executes clicks based on visual understanding, not guesses

---

## Architecture

```
User Command (Telegram)
    ↓
Atlas parses ("Search for Sade and play")
    ↓
Atlas queues command to GitHub
    ↓
Windows Service (Companion)
    ↓
    |
    +→ [NEW] Take screenshot of current screen
    |
    +→ Send screenshot to Atlas for analysis
    |
    +→ [NEW] Await decision from Atlas
    |
    +→ Execute action based on Atlas's analysis
    |
    +→ Wait/repeat if needed (multi-step workflow)
    |
    v
Result: Actions happen intelligently, visually-guided


┌─────────────────────────────────────────┐
│     Windows Companion Service           │
│  ┌───────────────────────────────────┐  │
│  │ Screenshot Module (PowerShell)    │  │
│  │ - Capture full screen             │  │
│  │ - Save to file: screenshot.png    │  │
│  │ - Upload to temp storage          │  │
│  └───────────────────────────────────┘  │
│              ↓                           │
│  ┌───────────────────────────────────┐  │
│  │ Action Executor                   │  │
│  │ - mouse.move(x, y)                │  │
│  │ - mouse.click(button)             │  │
│  │ - keyboard.type(text)             │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
       ↓
   GitHub (screenshot URL)
       ↓
┌─────────────────────────────────────────┐
│         Atlas (Vision AI)                │
│  ┌───────────────────────────────────┐  │
│  │ Vision Analyzer                   │  │
│  │ - Analyze screenshot              │  │
│  │ - Identify UI elements            │  │
│  │ - Locate search box, buttons, etc │  │
│  └───────────────────────────────────┘  │
│              ↓                           │
│  ┌───────────────────────────────────┐  │
│  │ Decision Engine                   │  │
│  │ - Plan next action                │  │
│  │ - Find click coordinates          │  │
│  │ - Generate command                │  │
│  └───────────────────────────────────┘  │
└─────────────────────────────────────────┘
       ↓
   Queue next command to GitHub
       ↓
Windows Service repeats
```

---

## Key Components

### 1. Screenshot Capture (Windows Service)
**Endpoint:** `GET /screenshot`

**Response:**
```json
{
  "success": true,
  "screenshotUrl": "https://raw.githubusercontent.com/herbert051281/atlas-screenshots/main/screenshot-20260323-060000.png",
  "timestamp": "2026-03-23T06:00:00Z",
  "resolution": "1920x1080"
}
```

**Implementation:**
- Use PowerShell's `[System.Windows.Forms.Screen]` to capture screen
- Save as PNG to temporary file
- Upload PNG to GitHub (`atlas-screenshots` repo)
- Return URL

### 2. Vision Analysis (Atlas)
**Input:** Screenshot URL  
**Process:**
- Download screenshot
- Analyze with Claude vision model
- Identify: buttons, text fields, images, windows
- Locate: search boxes, play buttons, artist names, etc.
- Output structured JSON with locations and actions

**Example Response:**
```json
{
  "analysis": {
    "current_app": "Spotify",
    "elements": [
      {
        "type": "button",
        "label": "Search",
        "location": { "x": 960, "y": 100, "width": 300, "height": 40 },
        "clickable": true
      },
      {
        "type": "textbox",
        "label": "Search input",
        "location": { "x": 960, "y": 100, "width": 300, "height": 40 },
        "empty": true
      },
      {
        "type": "item",
        "label": "Sade - Smooth Operator (Playlist)",
        "location": { "x": 960, "y": 300, "width": 500, "height": 80 },
        "clickable": true
      }
    ],
    "recommended_actions": [
      {
        "action": "click_search_box",
        "coordinates": [960, 100],
        "reason": "Focus search input"
      }
    ]
  }
}
```

### 3. Command Loop (Service)
**Workflow for multi-step actions:**

```
Step 1: Service takes screenshot
Step 2: Atlas analyzes it
Step 3: Atlas recommends action
Step 4: Service executes action
Step 5: Service waits 500ms-2s (for UI to update)
Step 6: Repeat until goal reached
```

### 4. Smart Waiting
- After `mouse.click`, wait for UI to load (500-2000ms)
- After `keyboard.type`, wait for search results (2-5s)
- Atlas detects when action is complete ("Sade playlist is now visible")

---

## Workflow Example: "Search for Sade and Play"

```
User: "Search for Sade and play"
    ↓
Atlas queues: [screenshot_request]
    ↓
Service takes screenshot #1
    ↓
Atlas analyzes: "Spotify is open, search box is visible at (960, 100)"
    ↓
Atlas queues: [click_at(960, 100), type("Sade"), wait(2000)]
    ↓
Service executes: click, type, wait
    ↓
Service takes screenshot #2
    ↓
Atlas analyzes: "Search results show 'Sade - Smooth Operator Playlist' at (960, 300)"
    ↓
Atlas queues: [click_at(960, 300), click_play_button]
    ↓
Service executes: clicks playlist, then play button
    ↓
Result: "Sade - Smooth Operator is now playing" ✅
```

---

## Implementation Plan

### Phase 1: Screenshot Capture (Service)
1. Add `/screenshot` endpoint to companion service
2. Use PowerShell to capture screen → save PNG
3. Upload to GitHub (or return base64)
4. Return screenshot URL

### Phase 2: Vision Analysis (Atlas)
1. Download screenshot when requested
2. Call Claude vision model to analyze
3. Identify UI elements, clickable regions
4. Return structured analysis

### Phase 3: Decision Engine (Atlas)
1. Parse vision analysis
2. Map user intent to UI elements
3. Generate next action commands
4. Queue to GitHub

### Phase 4: Smart Execution Loop (Service)
1. Check for screenshot requests
2. Execute action commands
3. Wait for UI updates
4. Take next screenshot
5. Repeat until done

### Phase 5: Multi-Step Workflows
1. Handle long sequences (open → search → click → play)
2. Add timing/delays between steps
3. Detect completion ("music is playing")

---

## Technical Details

### Screenshot Capture (PowerShell)
```powershell
Add-Type -AssemblyName System.Windows.Forms
$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bitmap = New-Object System.Drawing.Bitmap($screen.Bounds.Width, $screen.Bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($screen.Bounds.Location, [System.Drawing.Point]::Empty, $screen.Bounds.Size)
$bitmap.Save("$PSScriptRoot\screenshot.png")
```

### Vision Analysis (Claude)
```typescript
const response = await claude.messages.create({
  model: "claude-3-5-sonnet-20241022",
  max_tokens: 2000,
  messages: [
    {
      role: "user",
      content: [
        {
          type: "image",
          source: {
            type: "base64",
            media_type: "image/png",
            data: screenshotBase64,
          },
        },
        {
          type: "text",
          text: `Analyze this screenshot. Identify all clickable UI elements.
          For each element, provide: type, label, location (x, y, width, height), and whether it's clickable.
          Format as JSON.`,
        },
      ],
    },
  ],
});
```

---

## Safety & Constraints

- ✅ Screenshots are read-only (no data extraction beyond UI location)
- ✅ Vision analysis is non-invasive (only identifies clickable elements)
- ✅ All coordinates are relative to visible UI (no blind clicking)
- ✅ User can pause/stop workflows at any time
- ✅ Each action is logged with screenshot for audit trail

---

## Success Criteria

1. ✅ Service can take screenshots automatically
2. ✅ Atlas can analyze screenshots and identify UI elements
3. ✅ Atlas can recommend actions based on visual analysis
4. ✅ Multi-step workflows work: "Open Spotify → Search → Play"
5. ✅ Works with any app (Spotify, Chrome, Notepad, etc.)
6. ✅ No additional tools required on Windows

---

## Next Steps

1. Implement `/screenshot` endpoint (Phase 1)
2. Test screenshot capture on Herb's machine
3. Integrate Claude vision analysis
4. Test with real Spotify workflow
5. Iterate and refine

**Ready to proceed?**
