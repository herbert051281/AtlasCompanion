/**
 * Vision Analyzer for Atlas Companion
 * Analyzes screenshots to identify clickable UI elements
 * Uses Claude 3.5 Sonnet vision capabilities
 */

import { readFileSync } from 'node:fs';
import Anthropic from '@anthropic-ai/sdk';

export interface UIElement {
  type: 'button' | 'textbox' | 'image' | 'text' | 'link' | 'input' | 'other';
  label: string;
  location: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  clickable: boolean;
  confidence: number; // 0-100, how confident we are this is what we think it is
}

export interface ScreenshotAnalysis {
  success: boolean;
  timestamp: string;
  currentApp?: string;
  resolution?: string;
  elements: UIElement[];
  error?: string;
  analysisTime?: number;
}

const client = new Anthropic();

/**
 * Analyze a screenshot to identify UI elements
 * @param screenshotPath Path to the PNG screenshot file
 * @returns Analysis with identified UI elements and their locations
 */
export async function analyzeScreenshot(screenshotPath: string): Promise<ScreenshotAnalysis> {
  const startTime = Date.now();
  const timestamp = new Date().toISOString();

  try {
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
              text: `Analyze this screenshot and identify all clickable UI elements.

For EACH element you find, provide:
- type: button, textbox, image, text, link, input, or other
- label: what the element says or represents (e.g., "Search", "Play", "Spotify Logo")
- location: approximate bounding box { x, y, width, height } in pixels
- clickable: true/false
- confidence: 0-100 (how sure you are this is a clickable element)

Also identify:
- The current app or window (e.g., "Spotify", "Chrome", "Notepad")
- Screen resolution if visible

Return ONLY valid JSON in this exact format:
{
  "currentApp": "Spotify",
  "resolution": "1920x1080",
  "elements": [
    {
      "type": "button",
      "label": "Play",
      "location": { "x": 960, "y": 500, "width": 50, "height": 50 },
      "clickable": true,
      "confidence": 95
    }
  ]
}

Be PRECISE with coordinates. Estimate the center and size of each element.
Only include elements that are actually clickable (buttons, inputs, links, etc).`,
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

    return {
      success: true,
      timestamp,
      currentApp: analysis.currentApp,
      resolution: analysis.resolution,
      elements: analysis.elements || [],
      analysisTime,
    };
  } catch (error: any) {
    return {
      success: false,
      timestamp,
      elements: [],
      error: error.message || 'Unknown error analyzing screenshot',
      analysisTime: Date.now() - startTime,
    };
  }
}

/**
 * Find UI elements matching a description
 * @param analysis Previous screenshot analysis
 * @param description What to look for (e.g., "search box", "play button")
 * @returns Matching UI elements
 */
export function findElementsByDescription(
  analysis: ScreenshotAnalysis,
  description: string
): UIElement[] {
  if (!analysis.success) {
    return [];
  }

  const descLower = description.toLowerCase();
  
  return analysis.elements.filter(el => {
    const labelLower = el.label.toLowerCase();
    return (
      el.clickable &&
      (labelLower.includes(descLower) ||
        descLower.includes(labelLower) ||
        el.type === 'input' && descLower.includes('search') ||
        el.type === 'button' && descLower.includes(labelLower))
    );
  });
}

/**
 * Get recommended click position for an element
 * Returns the center of the bounding box
 */
export function getClickPosition(element: UIElement): { x: number; y: number } {
  return {
    x: Math.round(element.location.x + element.location.width / 2),
    y: Math.round(element.location.y + element.location.height / 2),
  };
}
