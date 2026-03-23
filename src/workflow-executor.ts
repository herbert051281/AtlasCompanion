/**
 * Workflow Executor
 * Loops through iterations until goal is reached or max iterations hit
 * 
 * Based on Anthropic Computer Use pattern
 */

import { runSingleIteration, IterationResult } from './workflow-loop.ts';

export interface LogEntry {
  iteration: number;
  action: string;
  app?: string;
  target?: string;
  goalReached: boolean;
  timestamp: string;
  error?: string;
}

export interface WorkflowResult {
  success: boolean;
  iterations: number;
  message: string;
  log: LogEntry[];
  totalTime: number;
  finalApp?: string;
}

interface ExecutorOptions {
  testMode?: boolean;
  maxIterations?: number;
  delayMs?: number;
  simulateGoalReachedAt?: number;
  simulateFailureAt?: number;
  screenshotEndpoint?: string;
  executeEndpoint?: string;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Execute a workflow with multiple iterations until goal is reached
 * @param userIntent What the user wants to accomplish
 * @param options Execution options including maxIterations
 * @returns WorkflowResult with success status, iteration count, and log
 */
export async function executeWorkflow(
  userIntent: string,
  options: ExecutorOptions = {}
): Promise<WorkflowResult> {
  const maxIterations = options.maxIterations ?? 10;
  const delayMs = options.delayMs ?? (options.testMode ? 0 : 800);
  const startTime = Date.now();
  
  const log: LogEntry[] = [];
  let finalApp: string | undefined;

  for (let i = 1; i <= maxIterations; i++) {
    console.log(`\n📸 Iteration ${i}/${maxIterations}`);
    
    // Check if we should simulate goal reached (test mode)
    const simulateGoalReached = options.testMode && 
      options.simulateGoalReachedAt !== undefined && 
      i >= options.simulateGoalReachedAt;
    
    // Check if we should simulate failure (test mode)
    const simulateFailure = options.testMode &&
      options.simulateFailureAt !== undefined &&
      i >= options.simulateFailureAt;

    // Run single iteration (with test overrides if needed)
    let result: IterationResult;
    
    if (options.testMode) {
      result = await runSingleIteration(userIntent, {
        testMode: true,
        screenshotEndpoint: options.screenshotEndpoint,
        executeEndpoint: options.executeEndpoint,
      });
      
      // Override goalReached for test simulation
      if (simulateGoalReached) {
        result.goalReached = true;
      }
      if (simulateFailure) {
        result.success = false;
        result.error = 'Simulated failure';
      }
    } else {
      result = await runSingleIteration(userIntent, {
        screenshotEndpoint: options.screenshotEndpoint,
        executeEndpoint: options.executeEndpoint,
      });
    }

    // Log this iteration
    const logEntry: LogEntry = {
      iteration: i,
      action: result.action?.type ?? 'unknown',
      app: result.app,
      target: result.action?.target,
      goalReached: result.goalReached,
      timestamp: new Date().toISOString(),
      error: result.error,
    };
    log.push(logEntry);

    // Track final app
    if (result.app) {
      finalApp = result.app;
    }

    // Log to console
    console.log(`   App: ${result.app ?? 'unknown'}`);
    console.log(`   Action: ${result.action?.type ?? 'none'} → ${result.action?.target ?? 'N/A'}`);
    
    if (result.error) {
      console.log(`   ⚠️ Error: ${result.error}`);
    }

    // Check if goal reached
    if (result.goalReached) {
      console.log(`\n✅ Goal reached in ${i} iteration(s)!`);
      return {
        success: true,
        iterations: i,
        message: `Task completed successfully in ${i} iteration(s)`,
        log,
        totalTime: Date.now() - startTime,
        finalApp,
      };
    }

    // Check if iteration failed completely
    if (!result.success) {
      console.log(`\n⚠️ Iteration ${i} failed: ${result.error}`);
      // Continue trying unless it's a critical failure
    }

    // Wait before next iteration (skip in test mode for speed)
    if (i < maxIterations && delayMs > 0) {
      await sleep(delayMs);
    }
  }

  // Max iterations reached
  console.log(`\n⚠️ Max iterations (${maxIterations}) reached without completing goal`);
  return {
    success: false,
    iterations: maxIterations,
    message: `Max iterations (${maxIterations}) reached. The workflow did not complete.`,
    log,
    totalTime: Date.now() - startTime,
    finalApp,
  };
}
