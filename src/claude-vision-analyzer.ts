/**
 * Claude Vision Analyzer for Atlas Companion
 * Takes screenshot path + user intent, analyzes with Claude 3.5 Sonnet vision
 * Returns structured analysis with recommended actions
 * 
 * Based on Anthropic Computer Use pattern
 */

import { readFileSync, existsSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

export interface UIElement {
  type: string;
  label: string;
  coordinates: [number, number]; // [x, y] center point
  box?: { x: number; y: number; width: number; height: number };
  clickable: boolean;
  confidence: number; // 0-100
}

export interface RecommendedAction {
  type: 'click' | 'type' | 'wait' | 'scroll' | 'launch_app' | 'none';
  target?: string;
  coordinates?: [number, number];
  text?: string;
  duration?: number;
  reason: string;
}

export interface ScreenshotAnalysis {
  success: boolean;
  timestamp: string;
  currentApp?: string;
  resolution?: string;
  elements: UIElement[];
  recommendedAction: RecommendedAction;
  goalReached: boolean;
  analysisTime?: number;
  error?: string;
}

interface AnalyzeOptions {
  testMode?: boolean;
}

const client = new Anthropic();

/**
 * Analyze a screenshot with Claude vision to identify UI elements and recommend actions
 * @param screenshotPath Path to the PNG screenshot file
 * @param userIntent What the user wants to accomplish
 * @param options Options including testMode for unit testing
 * @returns Analysis with UI elements, recommended action, and goal status
 */
export async function analyzeScreenshotWithIntent(
  screenshotPath: string,
  userIntent: string,
  options: AnalyzeOptions = {}
): Promise<ScreenshotAnalysis> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  // Test mode returns mock data for unit tests
  if (options.testMode) {
    return getMockAnalysis(screenshotPath, userIntent, timestamp, startTime);
  }

  try {
    // Check if file exists
    if (!existsSync(screenshotPath)) {
      return {
        success: false,
        timestamp,
        elements: [],
        recommendedAction: { type: 'none', reason: 'Screenshot file not found' },
        goalReached: false,
        error: `File not found: ${screenshotPath}`,
        analysisTime: Date.now() - startTime,
      };
    }

    // Read the screenshot file
    const screenshotBuffer = readFileSync(screenshotPath);
    const base64Image = screenshotBuffer.toString('base64');

    // Call Claude with vision capabilities
    const response = await client.messages.create({
      model: 'claude-3-5-sonnet-20241022',
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
              text: buildAnalysisPrompt(userIntent),
            },
          ],
        },
      ],
    });

    // Parse the response
    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Extract JSON from the response
    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in Claude response');
    }

    const analysis = JSON.parse(jsonMatch[0]);
    const analysisTime = Date.now() - startTime;

    // Transform elements to have coordinates array
    const elements: UIElement[] = (analysis.elements || []).map((el: any) => ({
      type: el.type,
      label: el.label,
      coordinates: el.coordinates || [
        el.box ? el.box.x + el.box.width / 2 : 0,
        el.box ? el.box.y + el.box.height / 2 : 0,
      ],
      box: el.box,
      clickable: el.clickable ?? true,
      confidence: el.confidence ?? 80,
    }));

    return {
      success: true,
      timestamp,
      currentApp: analysis.currentApp,
      resolution: analysis.resolution,
      elements,
      recommendedAction: analysis.recommendedAction || { type: 'none', reason: 'No action recommended' },
      goalReached: analysis.goalReached ?? false,
      analysisTime,
    };
  } catch (error: any) {
    return {
      success: false,
      timestamp,
      elements: [],
      recommendedAction: { type: 'none', reason: 'Analysis failed' },
      goalReached: false,
      error: error.message || 'Unknown error analyzing screenshot',
      analysisTime: Date.now() - startTime,
    };
  }
}

/**
 * Build the prompt for Claude vision analysis
 */
function buildAnalysisPrompt(userIntent: string): string {
  return `Analyze this screenshot. The user wants to: "${userIntent}"

For this screenshot, identify:
1. What application is currently open?
2. What UI elements are visible and clickable?
3. For EACH clickable element:
   - Type: button, textbox, link, image, menu, icon, etc
   - Label: what does it say or represent?
   - Position: bounding box { x, y, width, height } in pixels
   - Confidence: 0-100% how sure you are
   
4. Based on the task, what should the NEXT action be?
   - Action type: click, type, wait, scroll, launch_app, none
   - Target: which element?
   - Coordinates: [x, y] center point for click actions
   - Why: how does this move toward the goal?

5. Is the goal already reached? (e.g., if user asked to play Sade and music is playing)

Return ONLY valid JSON (no markdown, no explanation):
{
  "currentApp": "Spotify",
  "resolution": "2560x1440",
  "elements": [
    {
      "type": "textbox",
      "label": "Search",
      "box": { "x": 1280, "y": 100, "width": 300, "height": 40 },
      "clickable": true,
      "confidence": 95
    }
  ],
  "recommendedAction": {
    "type": "click",
    "target": "search_box",
    "coordinates": [1430, 120],
    "reason": "Click search box to enter search term"
  },
  "goalReached": false
}

Be PRECISE with coordinates. Estimate the center of each element.`;
}

/**
 * Generate mock analysis for test mode
 */
function getMockAnalysis(
  screenshotPath: string,
  userIntent: string,
  timestamp: string,
  startTime: number
): ScreenshotAnalysis {
  const intentLower = userIntent.toLowerCase();
  
  // Simulate file not found for specific path
  if (screenshotPath.includes('nonexistent')) {
    return {
      success: false,
      timestamp,
      elements: [],
      recommendedAction: { type: 'none', reason: 'File not found' },
      goalReached: false,
      error: 'File not found',
      analysisTime: Date.now() - startTime,
    };
  }

  // Generate contextual mock elements based on intent
  const elements: UIElement[] = [
    {
      type: 'textbox',
      label: 'Search',
      coordinates: [1430, 120],
      box: { x: 1280, y: 100, width: 300, height: 40 },
      clickable: true,
      confidence: 95,
    },
    {
      type: 'button',
      label: 'Play',
      coordinates: [960, 500],
      box: { x: 935, y: 475, width: 50, height: 50 },
      clickable: true,
      confidence: 90,
    },
    {
      type: 'link',
      label: 'Sade - Smooth Operator',
      coordinates: [400, 300],
      box: { x: 250, y: 280, width: 300, height: 40 },
      clickable: true,
      confidence: 85,
    },
  ];

  // Generate contextual recommended action
  let recommendedAction: RecommendedAction;
  
  if (intentLower.includes('search') || intentLower.includes('click search')) {
    recommendedAction = {
      type: 'click',
      target: 'search_box',
      coordinates: [1430, 120],
      reason: 'Click search box to enter search term',
    };
  } else if (intentLower.includes('play')) {
    recommendedAction = {
      type: 'click',
      target: 'play_button',
      coordinates: [960, 500],
      reason: 'Click play button to start playback',
    };
  } else if (intentLower.includes('type')) {
    recommendedAction = {
      type: 'type',
      text: 'Sade',
      reason: 'Type search query',
    };
  } else {
    recommendedAction = {
      type: 'click',
      target: 'first_element',
      coordinates: [400, 300],
      reason: 'Click to proceed',
    };
  }

  return {
    success: true,
    timestamp,
    currentApp: 'Spotify',
    resolution: '2560x1440',
    elements,
    recommendedAction,
    goalReached: false,
    analysisTime: Date.now() - startTime,
  };
}
