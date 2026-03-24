/**
 * Claude Vision Analyzer
 * Analyzes screenshots using Claude 3.5 Sonnet vision API
 * Based on Anthropic Computer Use pattern
 */

import Anthropic from '@anthropic-ai/sdk';
import { readFileSync } from 'node:fs';

const client = new Anthropic();

export interface UIElement {
  type: string;
  label: string;
  box: { x: number; y: number; width: number; height: number };
  clickable: boolean;
  confidence: number;
}

export interface RecommendedAction {
  type: 'click' | 'type' | 'wait' | 'scroll' | 'launch_app' | 'none';
  target?: string;
  coordinates?: [number, number];
  text?: string;
  duration?: number;
  app?: string;
  reason: string;
}

export interface ScreenshotAnalysis {
  success: boolean;
  currentApp?: string;
  elements: UIElement[];
  recommendedAction: RecommendedAction;
  goalReached: boolean;
  error?: string;
  analysisTimeMs?: number;
}

/**
 * Analyze a screenshot with Claude Sonnet vision
 * @param screenshotPath Path to PNG file
 * @param userIntent What the user wants to accomplish
 * @returns Analysis with UI elements and recommended action
 */
export async function analyzeScreenshot(
  screenshotPath: string,
  userIntent: string
): Promise<ScreenshotAnalysis> {
  const startTime = Date.now();

  try {
    // Read screenshot and convert to base64
    const imageData = readFileSync(screenshotPath);
    const base64Image = imageData.toString('base64');

    // Call Claude Sonnet vision
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2000,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'base64',
                media_type: 'image/png',
                data: base64Image,
              },
            },
            {
              type: 'text',
              text: `Analyze this screenshot. The user wants to: "${userIntent}"

For this screenshot, identify:
1. What application is currently open? (e.g., "spotify", "chrome", "desktop", "notepad")
2. What UI elements are visible and clickable?
3. For EACH clickable element, provide:
   - type: button, textbox, search_box, link, menu_item, icon, etc
   - label: what does it say or represent?
   - box: approximate bounding box { x, y, width, height } in pixels
   - clickable: true/false
   - confidence: 0-100 how sure you are

4. Based on the task "${userIntent}", what should the NEXT action be?
   - type: click, type, wait, scroll, launch_app, none
   - target: which element? (use the label)
   - coordinates: [x, y] center of the element to click
   - text: if type="type", what text to enter
   - duration: if type="wait", how many milliseconds
   - app: if type="launch_app", which app (e.g., "spotify.exe")
   - reason: why this action helps achieve the goal

5. Is the goal "${userIntent}" already reached? (true/false)
   - For "play music" goals: true if music player shows playing state
   - For "open app" goals: true if that app is visible and active
   - For "search" goals: true if search results are visible

Return ONLY valid JSON (no markdown, no explanation, no code blocks):
{
  "currentApp": "...",
  "elements": [
    { "type": "...", "label": "...", "box": { "x": 0, "y": 0, "width": 0, "height": 0 }, "clickable": true, "confidence": 95 }
  ],
  "recommendedAction": {
    "type": "click",
    "target": "...",
    "coordinates": [0, 0],
    "reason": "..."
  },
  "goalReached": false
}`,
            },
          ],
        },
      ],
    });

    // Parse Claude's response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Extract JSON from response (handle potential markdown wrapping)
    let jsonText = content.text.trim();
    
    // Remove markdown code blocks if present
    if (jsonText.startsWith('```json')) {
      jsonText = jsonText.slice(7);
    }
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.slice(3);
    }
    if (jsonText.endsWith('```')) {
      jsonText = jsonText.slice(0, -3);
    }
    jsonText = jsonText.trim();

    const analysis = JSON.parse(jsonText);

    return {
      success: true,
      currentApp: analysis.currentApp,
      elements: analysis.elements || [],
      recommendedAction: analysis.recommendedAction || { type: 'none', reason: 'No action recommended' },
      goalReached: analysis.goalReached || false,
      analysisTimeMs: Date.now() - startTime,
    };
  } catch (error: any) {
    return {
      success: false,
      elements: [],
      recommendedAction: { type: 'none', reason: 'Analysis failed' },
      goalReached: false,
      error: error.message || 'Unknown error',
      analysisTimeMs: Date.now() - startTime,
    };
  }
}
