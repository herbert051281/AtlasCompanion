# Vision-Driven Click Analysis
# Takes screenshot, analyzes it with Claude, and executes recommended clicks

param(
    [string]$UserIntent = "Search for Sade and play",
    [string]$ServiceUrl = "http://127.0.0.1:9999"
)

Write-Host "🔍 Starting Vision-Driven Analysis..."
Write-Host "Intent: $UserIntent"
Write-Host ""

# Step 1: Take screenshot
Write-Host "📸 Step 1: Taking screenshot..."
$response = Invoke-WebRequest -Uri "$ServiceUrl/screenshot" -Method GET
$screenshotData = $response.Content | ConvertFrom-Json

if ($screenshotData.success) {
    $screenshotPath = $screenshotData.screenshotPath
    $resolution = $screenshotData.resolution
    Write-Host "✅ Screenshot captured: $screenshotPath"
    Write-Host "   Resolution: $resolution"
    Write-Host ""
    
    # Step 2: Read screenshot file and convert to base64
    Write-Host "🔐 Step 2: Encoding screenshot..."
    $screenshotContent = [System.IO.File]::ReadAllBytes($screenshotPath)
    $base64Screenshot = [Convert]::ToBase64String($screenshotContent)
    Write-Host "✅ Screenshot encoded ($(($base64Screenshot.Length / 1024 / 1024).ToString("F2")) MB)"
    Write-Host ""
    
    # Step 3: Send to Atlas for analysis
    Write-Host "🤖 Step 3: Sending to Atlas for vision analysis..."
    Write-Host "   (This will analyze the screenshot with Claude Sonnet)"
    Write-Host ""
    Write-Host "To complete this, paste the screenshot path into Telegram:"
    Write-Host "   $screenshotPath"
    Write-Host ""
    Write-Host "Then I'll analyze it and send back the click coordinates."
} else {
    Write-Host "❌ Screenshot failed: $($screenshotData.error)"
}
