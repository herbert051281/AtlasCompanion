/**
 * Workflow Endpoint Handler
 * HTTP endpoint for POST /workflow/execute
 * 
 * Based on Anthropic Computer Use pattern
 */

import { executeWorkflow, WorkflowResult, LogEntry } from './workflow-executor.ts';

export interface WorkflowRequestBody {
  userIntent: string;
  maxIterations?: number;
}

export interface WorkflowResponse {
  success: boolean;
  iterations: number;
  message: string;
  log: LogEntry[];
  totalTime?: number;
  error?: string;
}

interface HandlerOptions {
  testMode?: boolean;
  simulateGoalReachedAt?: number;
  simulateFailureAt?: number;
}

/**
 * Handle workflow execution request
 * @param body Request body with userIntent and optional maxIterations
 * @param options Handler options including testMode
 * @returns WorkflowResponse with results
 */
export async function handleWorkflowRequest(
  body: WorkflowRequestBody,
  options: HandlerOptions = {}
): Promise<WorkflowResponse> {
  // Validate required fields
  if (!body || !body.userIntent) {
    return {
      success: false,
      iterations: 0,
      message: 'Missing required field: userIntent is required',
      log: [],
      error: 'userIntent is required',
    };
  }

  const maxIterations = body.maxIterations ?? 10;

  try {
    // Execute the workflow
    const result = await executeWorkflow(body.userIntent, {
      testMode: options.testMode,
      maxIterations,
      simulateGoalReachedAt: options.simulateGoalReachedAt,
      simulateFailureAt: options.simulateFailureAt,
      delayMs: options.testMode ? 0 : 800, // No delay in test mode
    });

    return {
      success: result.success,
      iterations: result.iterations,
      message: result.message,
      log: result.log,
      totalTime: result.totalTime,
    };
  } catch (error: any) {
    return {
      success: false,
      iterations: 0,
      message: `Workflow execution failed: ${error.message}`,
      log: [],
      error: error.message,
    };
  }
}
