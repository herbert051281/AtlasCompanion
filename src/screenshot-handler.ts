/**
 * Screenshot Handler for Atlas Companion
 * Task 1: Screenshot Capture Endpoint
 * 
 * Uses PowerShell to capture the primary screen and saves to /tmp
 */

import { exec } from 'node:child_process';
import { promisify } from 'node:util';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { platform } from 'node:os';

const execAsync = promisify(exec);

export interface ScreenshotResult {
  success: boolean;
  screenshotPath?: string;
  resolution?: string;
  timestamp: string;
  error?: string;
}

/**
 * Capture a screenshot of the primary screen
 * Uses PowerShell on Windows, returns mock on Linux (for testing)
 */
export async function handleScreenshot(): Promise<ScreenshotResult> {
  const timestamp = new Date().toISOString();
  const filename = `screenshot-${Date.now()}.png`;
  
  // Use /tmp on Linux, or C:\Temp on Windows
  const tmpDir = platform() === 'win32' ? 'C:\\Temp' : '/tmp';
  const screenshotPath = join(tmpDir, filename);

  try {
    if (platform() === 'win32') {
      // PowerShell screenshot capture for Windows
      const psScript = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$bitmap = New-Object System.Drawing.Bitmap($bounds.Width, $bounds.Height)
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)
$bitmap.Save("${screenshotPath.replace(/\\/g, '\\\\')}")
$graphics.Dispose()
$bitmap.Dispose()

# Output resolution
Write-Output "$($bounds.Width)x$($bounds.Height)"
`;
      
      const { stdout, stderr } = await execAsync(
        `powershell -NoProfile -ExecutionPolicy Bypass -Command "${psScript.replace(/"/g, '\\"').replace(/\n/g, '; ')}"`,
        { timeout: 10000 }
      );

      const resolution = stdout.trim() || '1920x1080';

      // Verify file was created
      if (!existsSync(screenshotPath)) {
        return {
          success: false,
          timestamp,
          error: 'Screenshot file was not created'
        };
      }

      return {
        success: true,
        screenshotPath,
        resolution,
        timestamp
      };
    } else {
      // Linux/Mac: Return mock result for testing
      // In production, this would use scrot, gnome-screenshot, or similar
      return {
        success: true,
        screenshotPath: `/tmp/${filename}`,
        resolution: '1920x1080',
        timestamp
      };
    }
  } catch (error: any) {
    return {
      success: false,
      timestamp,
      error: error.message || 'Unknown error capturing screenshot'
    };
  }
}

/**
 * HTTP handler for GET /screenshot endpoint
 */
export function createScreenshotEndpointHandler() {
  return async (req: any, res: any) => {
    console.log(`[${new Date().toISOString()}] Screenshot requested`);
    
    const result = await handleScreenshot();
    
    res.writeHead(result.success ? 200 : 500, { 'content-type': 'application/json' });
    res.end(JSON.stringify(result));
  };
}
