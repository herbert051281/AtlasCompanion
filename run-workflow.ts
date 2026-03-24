#!/usr/bin/env node
/**
 * Run Vision-Driven Workflow
 * Usage: npx tsx run-workflow.ts "Open Spotify and play Sade"
 */

import { executeWorkflow } from './src/workflow-executor.ts';

const userIntent = process.argv[2] || 'Open Spotify and play Sade';
const maxIterations = parseInt(process.argv[3] || '10', 10);

console.log('═══════════════════════════════════════════════════════════════');
console.log('   Atlas Vision-Driven Workflow Executor');
console.log('   Based on Anthropic Computer Use Pattern');
console.log('═══════════════════════════════════════════════════════════════');
console.log(`\n📋 User Intent: "${userIntent}"`);
console.log(`🔄 Max Iterations: ${maxIterations}`);
console.log('');

async function main() {
  try {
    const result = await executeWorkflow(userIntent, maxIterations);
    
    console.log('\n═══════════════════════════════════════════════════════════════');
    console.log('   WORKFLOW COMPLETE');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`\n✅ Success: ${result.success}`);
    console.log(`📊 Iterations: ${result.iterations}`);
    console.log(`⏱️  Total Time: ${(result.totalTimeMs / 1000).toFixed(1)}s`);
    console.log(`💬 Message: ${result.message}`);
    
    if (result.log.length > 0) {
      console.log('\n📝 Action Log:');
      result.log.forEach((item, i) => {
        const action = item.actionExecuted;
        if (action) {
          console.log(`   ${i + 1}. ${action.type} → ${action.target || action.app || action.text || 'N/A'}`);
        }
      });
    }
    
    process.exit(result.success ? 0 : 1);
  } catch (error: any) {
    console.error(`\n❌ Fatal error: ${error.message}`);
    process.exit(1);
  }
}

main();
