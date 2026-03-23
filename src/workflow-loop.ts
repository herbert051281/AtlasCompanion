/**
 * Workflow Single Iteration
 * Executes one cycle: screenshot → analyze → execute action
 * 
 * Based on Anthropic Computer Use pattern
 */

import { analyzeScreenshotWithIntent, RecommendedAction } from './claude-vision-analyzer.ts';

export interface IterationResult {
  success: boolean;
  iteration: number;
  app?: string;
  action?: RecommendedAction;
  goalReached: boolean;
  screenshotPath?: string;
  analysisTime?: number;
  error?: string;
}

interface IterationOptions {
  testMode?: boolean;
  simulateScreenshotFailure?: boolean;
  simulateAnalysisFailure?: boolean;
  simulateExecutionFailure?: boolean;
  screenshotEndpoint?: string;
  executeEndpoint?: string;
}

/**
 * Capture screenshot via companion service
 */
async function captureScreenshot(options: IterationOptions = {}): Promise<{ success: boolean; screenshotPath?: string; resolution?: string; error?: string }> {
  // Test mode returns mock data
  if (options.testMode) {
    if (options.simulateScreenshotFailure) {
      return { success: false, error: 'Screenshot capture failed (simulated)' };
    }
    return {
      success: true,
      screenshotPath: '/tmp/screenshot-mock.png',
      resolution: '2560x1440',
    };
  }

  try {
    const endpoint = options.screenshotEndpoint || 'http://127.0.0.1:9999/screenshot';
    const response = await fetch(endpoint);
    const data = await response.json();
    return data;
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute an action via companion service
 */
async function executeAction(action: RecommendedAction, options: IterationOptions = {}): Promise<{ success: boolean; message?: string; error?: string }> {
  // Test mode returns mock data
  if (options.testMode) {
    if (options.simulateExecutionFailure) {
      return { success: false, error: 'Action execution failed (simulated)' };
    }
    return {
      success: true,
      message: `Executed ${action.type}: ${action.reason}`,
    };
  }

  try {
    const endpoint = options.executeEndpoint || 'http://127.0.0.1:9999/execute-primitive';
    
    // Convert recommended action to primitive format
    let primitive: string;
    let params: Record<string, any> = {};
    
    switch (action.type) {
      case 'click':
        primitive = 'mouse.click';
        if (action.coordinates) {
          params = { x: action.coordinates[0], y: action.coordinates[1], button: 'left' };
        }
        break;
      case 'type':
        primitive = 'keyboard.type';
        params = { text: action.text || '' };
        break;
      case 'wait':
        primitive = 'wait';
        params = { duration: action.duration || 1000 };
        break;
      default:
        return { success: true, message: `No action needed: ${action.type}` };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ primitive, params }),
    });
    
    const data = await response.json();
    return {
      success: data.code === 0 || data.code === undefined,
      message: data.stdout,
      error: data.stderr,
    };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Run a single iteration of the workflow loop
 * 1. Capture screenshot
 * 2. Analyze with Claude
 * 3. Execute recommended action
 * 4. Return result
 */
export async function runSingleIteration(
  userIntent: string,
  options: IterationOptions = {}
): Promise<IterationResult> {
  const iteration = 1; // This function only handles one iteration

  // 1. Capture screenshot
  const screenshotResult = await captureScreenshot(options);
  
  if (!screenshotResult.success) {
    return {
      success: false,
      iteration,
      goalReached: false,
      error: `Screenshot failed: ${screenshotResult.error}`,
    };
  }

  // 2. Analyze with Claude
  const analysis = await analyzeScreenshotWithIntent(
    screenshotResult.screenshotPath!,
    userIntent,
    { testMode: options.testMode || options.simulateAnalysisFailure }
  );

  if (!analysis.success || options.simulateAnalysisFailure) {
    return {
      success: false,
      iteration,
      goalReached: false,
      screenshotPath: screenshotResult.screenshotPath,
      error: options.simulateAnalysisFailure ? 'Analysis failed (simulated)' : `Analysis failed: ${analysis.error}`,
    };
  }

  // 3. Execute recommended action
  const actionResult = await executeAction(analysis.recommendedAction, options);
  
  if (!actionResult.success) {
    return {
      success: false,
      iteration,
      app: analysis.currentApp,
      action: analysis.recommendedAction,
      goalReached: false,
      screenshotPath: screenshotResult.screenshotPath,
      analysisTime: analysis.analysisTime,
      error: `Execution failed: ${actionResult.error}`,
    };
  }

  // 4. Return success with all context
  return {
    success: true,
    iteration,
    app: analysis.currentApp,
    action: analysis.recommendedAction,
    goalReached: analysis.goalReached,
    screenshotPath: screenshotResult.screenshotPath,
    analysisTime: analysis.analysisTime,
  };
}
