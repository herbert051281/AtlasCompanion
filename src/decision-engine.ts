/**
 * Decision Engine for Atlas Companion
 * Parses user intent and vision analysis to generate click/type commands
 */

import { ScreenshotAnalysis, findElementsByDescription, getClickPosition, UIElement } from './vision-analyzer.ts';

export interface Decision {
  action: 'click' | 'type' | 'wait' | 'screenshot' | 'none';
  coordinates?: { x: number; y: number };
  text?: string;
  duration?: number; // milliseconds for wait
  reason: string;
  confidence: number; // 0-100
}

/**
 * Decide the next action based on user intent and current screenshot
 * @param userIntent What the user asked for (e.g., "Search for Sade")
 * @param analysis Current screenshot analysis
 * @param actionHistory Previous actions taken
 */
export function decideNextAction(
  userIntent: string,
  analysis: ScreenshotAnalysis,
  actionHistory: string[] = []
): Decision {
  const intentLower = userIntent.toLowerCase();

  // If screenshot failed, request another one
  if (!analysis.success) {
    return {
      action: 'screenshot',
      reason: 'Screenshot analysis failed, retrying',
      confidence: 100,
    };
  }

  // Determine what we're trying to do
  const isSearching = intentLower.includes('search');
  const isPlaying = intentLower.includes('play') || intentLower.includes('listen');
  const isOpening = intentLower.includes('open');

  // If searching, try to find and click search box
  if (isSearching) {
    const searchElements = findElementsByDescription(analysis, 'search');
    
    if (searchElements.length > 0) {
      // Check if we already clicked search
      if (actionHistory.includes('click_search')) {
        // Now type the search query
        const query = extractSearchQuery(userIntent);
        if (query) {
          return {
            action: 'type',
            text: query,
            reason: `Type search query: "${query}"`,
            confidence: 90,
          };
        }
      } else {
        // Click the search box first
        const position = getClickPosition(searchElements[0]);
        return {
          action: 'click',
          coordinates: position,
          reason: `Click search box at (${position.x}, ${position.y})`,
          confidence: 95,
        };
      }
    }
  }

  // If playing, look for play button
  if (isPlaying) {
    const playElements = findElementsByDescription(analysis, 'play');
    
    if (playElements.length > 0) {
      const position = getClickPosition(playElements[0]);
      return {
        action: 'click',
        coordinates: position,
        reason: `Click play button at (${position.x}, ${position.y})`,
        confidence: 90,
      };
    }
  }

  // If looking for search results, try to click first result
  const hasSearchResults = analysis.elements.some(el => 
    el.label.toLowerCase().includes('sade') ||
    el.label.toLowerCase().includes('result') ||
    el.type === 'link'
  );

  if (hasSearchResults && isSearching) {
    // After typing, wait for results to load
    if (actionHistory.includes('type_search')) {
      const resultElements = analysis.elements.filter(el =>
        el.clickable &&
        (el.label.toLowerCase().includes('sade') ||
         el.type === 'link')
      );

      if (resultElements.length > 0) {
        const position = getClickPosition(resultElements[0]);
        return {
          action: 'click',
          coordinates: position,
          reason: `Click search result: "${resultElements[0].label}"`,
          confidence: 85,
        };
      }
    } else {
      // Wait for search results to appear
      return {
        action: 'wait',
        duration: 1500,
        reason: 'Waiting for search results to appear',
        confidence: 90,
      };
    }
  }

  // Default: take another screenshot to see current state
  return {
    action: 'screenshot',
    reason: 'Taking screenshot to analyze current state',
    confidence: 100,
  };
}

/**
 * Extract search query from user intent
 * e.g., "Search for Sade" → "Sade"
 */
function extractSearchQuery(userIntent: string): string | null {
  const match = userIntent.match(/search\s+(?:for\s+)?([^,\.;]+)/i);
  if (match && match[1]) {
    return match[1].trim();
  }

  // Alternative: look for "search ... and play"
  const match2 = userIntent.match(/search\s+(?:for\s+)?([^,\.;]+)\s+and/i);
  if (match2 && match2[1]) {
    return match2[1].trim();
  }

  return null;
}

/**
 * Convert decision to a command for the queue
 */
export function decisionToCommand(decision: Decision): any {
  switch (decision.action) {
    case 'click':
      return {
        type: 'primitive',
        primitive: 'mouse.click',
        params: {
          button: 'left',
          x: decision.coordinates?.x,
          y: decision.coordinates?.y,
        },
      };

    case 'type':
      return {
        type: 'primitive',
        primitive: 'keyboard.type',
        params: {
          text: decision.text,
        },
      };

    case 'wait':
      return {
        type: 'primitive',
        primitive: 'wait',
        params: {
          duration: decision.duration,
        },
      };

    case 'screenshot':
      return {
        type: 'operation',
        operation: 'screenshot',
        params: {},
      };

    default:
      return null;
  }
}
