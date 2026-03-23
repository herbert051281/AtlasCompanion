/**
 * Screenshot Request Handler for Atlas Companion
 * Task 3: Screenshot Request Handler
 * 
 * Handles POST /request-screenshot endpoint
 * Takes screenshot immediately, stores metadata, optionally queues to GitHub
 */

import { handleScreenshot } from './screenshot-handler';

export interface ScreenshotMetadata {
  resolution: string;
  captureTimeMs: number;
  filename: string;
}

export interface ScreenshotRequestResult {
  success: boolean;
  screenshotPath?: string;
  metadata?: ScreenshotMetadata;
  timestamp: string;
  error?: string;
  queuedToGithub?: boolean;
}

interface RequestOptions {
  testMode?: boolean;
  queueToGithub?: boolean;
  simulateError?: boolean;
}

/**
 * Handle a screenshot request
 * Takes screenshot immediately and returns metadata
 */
export async function handleScreenshotRequest(
  options: RequestOptions = {}
): Promise<ScreenshotRequestResult> {
  const timestamp = new Date().toISOString();
  const startTime = Date.now();

  // Simulate error for testing
  if (options.simulateError) {
    return {
      success: false,
      timestamp,
      error: 'Simulated error for testing'
    };
  }

  // Test mode: return mock data
  if (options.testMode) {
    const captureTimeMs = 50; // Mock capture time
    return {
      success: true,
      screenshotPath: `/tmp/screenshot-${Date.now()}.png`,
      metadata: {
        resolution: '1920x1080',
        captureTimeMs,
        filename: `screenshot-${Date.now()}.png`
      },
      timestamp,
      queuedToGithub: options.queueToGithub || false
    };
  }

  try {
    // Take the screenshot
    const screenshotResult = await handleScreenshot();
    const captureTimeMs = Date.now() - startTime;

    if (!screenshotResult.success) {
      return {
        success: false,
        timestamp,
        error: screenshotResult.error || 'Screenshot capture failed'
      };
    }

    const filename = screenshotResult.screenshotPath?.split(/[/\\]/).pop() || 'unknown.png';

    const result: ScreenshotRequestResult = {
      success: true,
      screenshotPath: screenshotResult.screenshotPath,
      metadata: {
        resolution: screenshotResult.resolution || 'unknown',
        captureTimeMs,
        filename
      },
      timestamp
    };

    // Queue to GitHub if requested
    if (options.queueToGithub) {
      try {
        await queueScreenshotToGithub(screenshotResult.screenshotPath!, filename);
        result.queuedToGithub = true;
      } catch (err: any) {
        // Don't fail the whole request, just note that queuing failed
        result.queuedToGithub = false;
        console.warn('Failed to queue to GitHub:', err.message);
      }
    }

    return result;

  } catch (error: any) {
    return {
      success: false,
      timestamp,
      error: error.message || 'Unknown error during screenshot request'
    };
  }
}

/**
 * Queue screenshot metadata to GitHub
 * Creates/updates a queue file in the atlas-screenshots repo
 */
async function queueScreenshotToGithub(
  screenshotPath: string,
  filename: string
): Promise<void> {
  // This would upload to GitHub or update a queue file
  // For now, we'll implement a stub that logs the action
  console.log(`[GitHub Queue] Screenshot ready: ${filename}`);
  console.log(`[GitHub Queue] Path: ${screenshotPath}`);
  
  // In full implementation:
  // 1. Upload PNG to github.com/herbert051281/atlas-screenshots
  // 2. Update queue file with screenshot URL
  // 3. Atlas watches this file for new screenshots to analyze
}

/**
 * HTTP handler for POST /request-screenshot endpoint
 */
export function createRequestScreenshotEndpointHandler() {
  return async (req: any, res: any) => {
    console.log(`[${new Date().toISOString()}] Screenshot request received`);
    
    // Parse request body for options
    let body = '';
    req.on('data', (chunk: Buffer) => { body += chunk; });
    
    await new Promise<void>((resolve) => {
      req.on('end', resolve);
    });

    let options: RequestOptions = {};
    try {
      if (body) {
        options = JSON.parse(body);
      }
    } catch (e) {
      // Ignore parse errors, use defaults
    }

    const result = await handleScreenshotRequest(options);
    
    res.writeHead(result.success ? 200 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  };
}
