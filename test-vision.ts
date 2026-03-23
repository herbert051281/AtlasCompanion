/**
 * Test Vision-Driven System
 * Tests screenshot capture and analysis
 */

import { handleScreenshot } from './apps/companion-service/src/screenshot-handler.ts';
import { analyzeScreenshot } from './src/vision-analyzer.ts';
import { decideNextAction, decisionToCommand } from './src/decision-engine.ts';

async function testVisionSystem() {
  console.log('🎬 Testing Vision-Driven Remote Control System\n');

  try {
    // Step 1: Request a screenshot
    console.log('📸 Step 1: Taking screenshot from your Windows machine...');
    const screenshotResult = await handleScreenshot();
    
    if (!screenshotResult.success) {
      console.error('❌ Screenshot failed:', screenshotResult.error);
      process.exit(1);
    }

    console.log(`✅ Screenshot captured: ${screenshotResult.screenshotPath}`);
    console.log(`   Resolution: ${screenshotResult.resolution}`);

    // Step 2: Analyze the screenshot
    console.log('\n🔍 Step 2: Analyzing screenshot with Claude vision...');
    const analysis = await analyzeScreenshot(screenshotResult.screenshotPath!);

    if (!analysis.success) {
      console.error('❌ Analysis failed:', analysis.error);
      process.exit(1);
    }

    console.log(`✅ Analysis complete in ${analysis.analysisTime}ms`);
    console.log(`   App: ${analysis.currentApp}`);
    console.log(`   Elements found: ${analysis.elements.length}`);
    
    if (analysis.elements.length > 0) {
      console.log('\n📍 UI Elements Detected:');
      analysis.elements.slice(0, 10).forEach((el, i) => {
        console.log(`   ${i + 1}. [${el.type}] ${el.label}`);
        console.log(`      Position: (${el.location.x}, ${el.location.y}) Size: ${el.location.width}x${el.location.height}`);
        console.log(`      Clickable: ${el.clickable}, Confidence: ${el.confidence}%`);
      });
    }

    // Step 3: Decide next action
    console.log('\n🧠 Step 3: Deciding next action...');
    const userIntent = 'Search for Sade and play';
    const decision = decideNextAction(userIntent, analysis);

    console.log(`✅ Decision made:`);
    console.log(`   Action: ${decision.action}`);
    console.log(`   Reason: ${decision.reason}`);
    console.log(`   Confidence: ${decision.confidence}%`);

    if (decision.coordinates) {
      console.log(`   Click at: (${decision.coordinates.x}, ${decision.coordinates.y})`);
    }
    if (decision.text) {
      console.log(`   Type: "${decision.text}"`);
    }

    // Step 4: Convert to command
    console.log('\n⚙️ Step 4: Converting to queue command...');
    const command = decisionToCommand(decision);
    console.log(`✅ Command generated:`);
    console.log(JSON.stringify(command, null, 2));

    console.log('\n🎉 Vision-driven system is working!');
    console.log('Next: Deploy to production and test with real Spotify');

  } catch (error: any) {
    console.error('❌ Test failed:', error.message);
    process.exit(1);
  }
}

testVisionSystem();
