param(
  [string]$ExportPath = "./exports/companion-demo-logs.json"
)

$ErrorActionPreference = 'Stop'

Write-Host "Starting Skillmaster Companion demo..."
$runner = Join-Path $PSScriptRoot "companion-demo-runner.mjs"
$proc = Start-Process -FilePath "node" -ArgumentList "--import", "tsx", $runner -RedirectStandardOutput "$env:TEMP\companion-demo.out" -RedirectStandardError "$env:TEMP\companion-demo.err" -PassThru

try {
  $port = $null
  for ($i = 0; $i -lt 40; $i++) {
    Start-Sleep -Milliseconds 250
    if (Test-Path "$env:TEMP\companion-demo.out") {
      $line = Get-Content "$env:TEMP\companion-demo.out" | Select-String "SERVICE_PORT=" | Select-Object -Last 1
      if ($line) {
        $port = [int]($line.ToString().Split('=')[1])
        break
      }
    }
  }

  if (-not $port) { throw "Failed to read service port" }

  $base = "http://127.0.0.1:$port"
  Write-Host "Service up at $base"

  # health
  $health = Invoke-RestMethod "$base/health" -Method GET
  Write-Host "Health: $($health.status)"

  # session
  $session = Invoke-RestMethod "$base/session/token" -Method POST -ContentType "application/json" -Body "{}"
  $token = $session.token
  $headers = @{ Authorization = "Bearer $token" }
  Write-Host "Session token issued (ttlMs=$($session.ttlMs))"

  # task create
  $taskCreate = Invoke-RestMethod "$base/tasks" -Method POST -Headers $headers -ContentType "application/json" -Body '{"action":"read_status","riskLevel":"low"}'
  $taskId = $taskCreate.task.id
  Write-Host "Task queued: $taskId"

  # task start
  $null = Invoke-RestMethod "$base/tasks/$taskId/start" -Method POST -Headers $headers -ContentType "application/json" -Body '{"durationMs":1200}'
  Start-Sleep -Milliseconds 1600
  $taskState = Invoke-RestMethod "$base/tasks/$taskId" -Method GET
  Write-Host "Task state after run: $($taskState.task.state)"

  # stop
  $panic = Invoke-RestMethod "$base/panic-stop" -Method POST -Headers $headers -ContentType "application/json" -Body '{}'
  Write-Host "Panic stop: $($panic.status)"

  # log export
  $logs = Invoke-RestMethod "$base/logs/export" -Method GET
  $logsJson = $logs | ConvertTo-Json -Depth 8
  $exportFull = Resolve-Path -Path (Split-Path -Parent $ExportPath) -ErrorAction SilentlyContinue
  if (-not $exportFull) {
    New-Item -ItemType Directory -Path (Split-Path -Parent $ExportPath) -Force | Out-Null
  }
  $logsJson | Out-File -FilePath $ExportPath -Encoding utf8
  Write-Host "Exported logs to $ExportPath (events=$($logs.count))"

  Write-Host "Demo complete."
}
finally {
  if ($proc -and -not $proc.HasExited) {
    Stop-Process -Id $proc.Id -Force
  }
}
