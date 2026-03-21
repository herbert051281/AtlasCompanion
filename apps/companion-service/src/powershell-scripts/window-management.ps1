param(
    [Parameter(Mandatory=$true)]
    [string]$Operation,
    
    [Parameter(Mandatory=$false)]
    [string]$Params = '{}'
)

# Parse parameters
$parsedParams = $Params | ConvertFrom-Json

# Window management functions
function Get-Windows {
    Get-Process | Where-Object { $_.MainWindowHandle -ne 0 } | 
        Select-Object Name, Id, @{Name='MainWindowTitle'; Expression={$_.MainWindowTitle}}, 
        @{Name='Handle'; Expression={$_.MainWindowHandle.ToString()}} | 
        ConvertTo-Json -Compress
}

function Focus-Window {
    param([string]$WindowTitle)
    $window = Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
    if ($window) {
        # Use Windows API to set foreground window
        Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class WindowHelper {
                [DllImport("user32.dll")]
                public static extern bool SetForegroundWindow(IntPtr hWnd);
            }
"@
        [WindowHelper]::SetForegroundWindow($window.MainWindowHandle) | Out-Null
        @{ success = $true; message = "Focused window: $($window.MainWindowTitle)" } | ConvertTo-Json -Compress
    } else {
        @{ success = $false; error = "Window '$WindowTitle' not found" } | ConvertTo-Json -Compress
    }
}

function Minimize-Window {
    param([string]$WindowTitle)
    $window = Get-Process | Where-Object { $_.MainWindowTitle -like "*$WindowTitle*" } | Select-Object -First 1
    if ($window) {
        Add-Type @"
            using System;
            using System.Runtime.InteropServices;
            public class WindowMinimizer {
                [DllImport("user32.dll")]
                public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
                public const int SW_MINIMIZE = 6;
            }
"@
        [WindowMinimizer]::ShowWindow($window.MainWindowHandle, [WindowMinimizer]::SW_MINIMIZE) | Out-Null
        @{ success = $true; message = "Minimized: $($window.MainWindowTitle)" } | ConvertTo-Json -Compress
    } else {
        @{ success = $false; error = "Window '$WindowTitle' not found" } | ConvertTo-Json -Compress
    }
}

function Start-App {
    param(
        [string]$AppPath,
        [string[]]$Arguments
    )
    try {
        if ($Arguments -and $Arguments.Count -gt 0) {
            $proc = Start-Process -FilePath $AppPath -ArgumentList $Arguments -PassThru -ErrorAction Stop
        } else {
            $proc = Start-Process -FilePath $AppPath -PassThru -ErrorAction Stop
        }
        @{ success = $true; message = "Launched $AppPath"; pid = $proc.Id } | ConvertTo-Json -Compress
    } catch {
        @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
    }
}

function Stop-App {
    param([string]$ProcessName)
    try {
        $processes = Get-Process -Name $ProcessName -ErrorAction SilentlyContinue
        if ($processes) {
            $processes | Stop-Process -Force
            @{ success = $true; message = "Closed $ProcessName"; count = $processes.Count } | ConvertTo-Json -Compress
        } else {
            @{ success = $false; error = "Process '$ProcessName' not found" } | ConvertTo-Json -Compress
        }
    } catch {
        @{ success = $false; error = $_.Exception.Message } | ConvertTo-Json -Compress
    }
}

# Dispatch based on operation
switch ($Operation) {
    "window-list" { Get-Windows }
    "window-focus" { Focus-Window -WindowTitle $parsedParams.windowTitle }
    "window-minimize" { Minimize-Window -WindowTitle $parsedParams.windowTitle }
    "app-launch" { Start-App -AppPath $parsedParams.appPath -Arguments $parsedParams.arguments }
    "app-close" { Stop-App -ProcessName $parsedParams.processName }
    default { 
        @{ success = $false; error = "Unknown operation: $Operation" } | ConvertTo-Json -Compress
        exit 1
    }
}
