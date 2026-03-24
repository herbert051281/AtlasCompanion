/**
 * Workflow Executor
 * Runs the vision-driven automation loop:
 * Screenshot → Analyze → Execute → Repeat until goal reached
 */

import { analyzeScreenshot, ScreenshotAnalysis, RecommendedAction } from './claude-vision-analyzer.ts';

export interface IterationResult {
  iteration: number;
  screenshotPath?: string;
  analysis?: ScreenshotAnalysis;
  actionExecuted?: RecommendedAction;
  success: boolean;
  error?: string;
}

export interface WorkflowResult {
  success: boolean;
  iterations: number;
  message: string;
  log: IterationResult[];
  totalTimeMs: number;
}

// Helper to sleep
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Execute a single iteration: Screenshot → Analyze → Execute
 */
export async function runSingleIteration(
  userIntent: string,
  iteration: number,
  serviceUrl: string = 'http://127.0.0.1:9999'
): Promise<IterationResult> {
  console.log(`\n📸 Iteration ${iteration}: Taking screenshot...`);

  try {
    // 1. Take screenshot
    const screenshotResponse = await fetch(`${serviceUrl}/screenshot`);
    const screenshotData = await screenshotResponse.json();

    if (!screenshotData.success) {
      return {
        iteration,
        success: false,
        error: `Screenshot failed: ${screenshotData.error}`,
      };
    }

    const screenshotPath = screenshotData.screenshotPath;
    console.log(`   Screenshot: ${screenshotPath}`);

    // 2. Analyze with Claude
    console.log(`🔍 Analyzing with Claude Sonnet...`);
    const analysis = await analyzeScreenshot(screenshotPath, userIntent);

    if (!analysis.success) {
      return {
        iteration,
        screenshotPath,
        success: false,
        error: `Analysis failed: ${analysis.error}`,
      };
    }

    console.log(`   App: ${analysis.currentApp}`);
    console.log(`   Elements found: ${analysis.elements.length}`);
    console.log(`   Recommended: ${analysis.recommendedAction.type} → ${analysis.recommendedAction.target || analysis.recommendedAction.app || 'N/A'}`);
    console.log(`   Reason: ${analysis.recommendedAction.reason}`);
    console.log(`   Goal reached: ${analysis.goalReached}`);

    // 3. Execute action (if not goal reached)
    if (!analysis.goalReached && analysis.recommendedAction.type !== 'none') {
      console.log(`⚡ Executing: ${analysis.recommendedAction.type}...`);
      
      const actionResult = await executeAction(analysis.recommendedAction, serviceUrl);
      
      if (!actionResult.success) {
        console.log(`   ⚠️ Action warning: ${actionResult.error}`);
      } else {
        console.log(`   ✓ Action completed`);
      }
    }

    return {
      iteration,
      screenshotPath,
      analysis,
      actionExecuted: analysis.recommendedAction,
      success: true,
    };
  } catch (error: any) {
    return {
      iteration,
      success: false,
      error: error.message || 'Unknown error',
    };
  }
}

/**
 * Execute an action via the companion service
 */
async function executeAction(
  action: RecommendedAction,
  serviceUrl: string
): Promise<{ success: boolean; error?: string }> {
  try {
    let endpoint: string;
    let body: any;

    switch (action.type) {
      case 'click':
        endpoint = '/execute-primitive';
        body = {
          primitive: 'mouse.click',
          params: {
            x: action.coordinates?.[0] || 0,
            y: action.coordinates?.[1] || 0,
            button: 'left',
          },
        };
        break;

      case 'type':
        endpoint = '/execute-primitive';
        body = {
          primitive: 'keyboard.type',
          params: { text: action.text || '' },
        };
        break;

      case 'wait':
        endpoint = '/execute-primitive';
        body = {
          primitive: 'wait',
          params: { duration: action.duration || 1000 },
        };
        break;

      case 'launch_app':
        endpoint = '/execute-operation';
        body = {
          operation: 'app.launch',
          params: { appPath: action.app || '' },
        };
        break;

      case 'none':
        return { success: true };

      default:
        return { success: false, error: `Unknown action type: ${action.type}` };
    }

    const response = await fetch(`${serviceUrl}${endpoint}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    const result = await response.json();
    return { success: result.code === 0 || result.success, error: result.stderr || result.error };
  } catch (error: any) {
    return { success: false, error: error.message };
  }
}

/**
 * Execute the full workflow loop
 * @param userIntent What the user wants to accomplish
 * @param maxIterations Maximum iterations before giving up (default 10)
 * @param serviceUrl Companion service URL
 */
export async function executeWorkflow(
  userIntent: string,
  maxIterations: number = 10,
  serviceUrl: string = 'http://127.0.0.1:9999'
): Promise<WorkflowResult> {
  const startTime = Date.now();
  const log: IterationResult[] = [];

  console.log(`\n🚀 Starting workflow: "${userIntent}"`);
  console.log(`   Max iterations: ${maxIterations}`);
  console.log(`   Service: ${serviceUrl}`);

  for (let i = 1; i <= maxIterations; i++) {
    const result = await runSingleIteration(userIntent, i, serviceUrl);
    log.push(result);

    if (!result.success) {
      console.log(`\n❌ Iteration ${i} failed: ${result.error}`);
      continue; // Try again
    }

    // Check if goal reached
    if (result.analysis?.goalReached) {
      console.log(`\n🎉 Goal reached in ${i} iteration(s)!`);
      return {
        success: true,
        iterations: i,
        message: `Task completed: ${userIntent}`,
        log,
        totalTimeMs: Date.now() - startTime,
      };
    }

    // Wait for UI to update before next iteration
    console.log(`   ⏳ Waiting 1s for UI update...`);
    await sleep(1000);
  }

  console.log(`\n⚠️ Max iterations (${maxIterations}) reached without completing goal`);
  return {
    success: false,
    iterations: maxIterations,
    message: 'Max iterations reached without completing goal',
    log,
    totalTimeMs: Date.now() - startTime,
  };
}
