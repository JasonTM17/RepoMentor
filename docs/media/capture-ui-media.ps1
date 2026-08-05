[CmdletBinding()]
param(
  [int]$Port = 3100,
  [string]$OutputPath = (Join-Path $PSScriptRoot "repomentor-ui.gif")
)

$ErrorActionPreference = "Stop"

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$webRoot = Join-Path $repositoryRoot "apps\web"
$buildIdPath = Join-Path $webRoot ".next\BUILD_ID"

if (-not (Test-Path -LiteralPath $buildIdPath)) {
  throw "Build the real web app first: pnpm --filter @repomentor/web build"
}

$chromeCandidates = @(
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
  "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
  (Join-Path $env:LOCALAPPDATA "Google\Chrome\Application\chrome.exe")
)
$chromePath = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1

if (-not $chromePath) {
  throw "Google Chrome is required for real UI capture. No mock or synthetic media is produced."
}

$magickCommand = Get-Command magick -ErrorAction SilentlyContinue

if (-not $magickCommand) {
  throw "ImageMagick (magick) is required to encode the captured frames as a GIF."
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("repomentor-ui-" + [guid]::NewGuid().ToString("N"))
$frameRoot = Join-Path $tempRoot "frames"
$stdoutPath = Join-Path $tempRoot "web.out.log"
$stderrPath = Join-Path $tempRoot "web.err.log"
$server = $null
$serverProcessIdsBefore = @(
  Get-CimInstance Win32_Process |
    Where-Object { $_.CommandLine -like "*next start*--port $Port*" } |
    Select-Object -ExpandProperty ProcessId
)
$portProcessIdsBefore = @(
  Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
    Select-Object -ExpandProperty OwningProcess
)

New-Item -ItemType Directory -Path $frameRoot -Force | Out-Null

try {
  $server = Start-Process -FilePath "pnpm.cmd" `
    -ArgumentList @("exec", "next", "start", "--hostname", "127.0.0.1", "--port", $Port) `
    -WorkingDirectory $webRoot `
    -RedirectStandardOutput $stdoutPath `
    -RedirectStandardError $stderrPath `
    -WindowStyle Hidden `
    -PassThru

  $ready = $false

  for ($attempt = 0; $attempt -lt 30; $attempt++) {
    Start-Sleep -Seconds 1

    try {
      $response = Invoke-WebRequest -Uri "http://127.0.0.1:$Port/" -UseBasicParsing -TimeoutSec 2

      if ($response.StatusCode -eq 200) {
        $ready = $true
        break
      }
    } catch {
      # The server is still starting.
    }
  }

  if (-not $ready) {
    Get-Content -Raw $stdoutPath -ErrorAction SilentlyContinue
    Get-Content -Raw $stderrPath -ErrorAction SilentlyContinue
    throw "The built Next web app did not become ready on port $Port."
  }

  $routes = @("/", "/login", "/register")
  $frames = [System.Collections.Generic.List[string]]::new()
  $frameNumber = 0

  foreach ($route in $routes) {
    $frameNumber += 1
    $profilePath = Join-Path $frameRoot ("profile-$frameNumber")
    $framePath = Join-Path $frameRoot ("frame-$frameNumber.png")
    $url = "http://127.0.0.1:$Port$route"

    & $chromePath `
      "--headless=new" `
      "--disable-gpu" `
      "--hide-scrollbars" `
      "--window-size=1440,900" `
      "--virtual-time-budget=2500" `
      "--user-data-dir=$profilePath" `
      "--screenshot=$framePath" `
      $url | Out-Null

    if (-not (Test-Path -LiteralPath $framePath)) {
      throw "Chrome did not capture $url. No GIF was produced."
    }

    $frames.Add($framePath)
  }

  $outputDirectory = Split-Path -Parent $OutputPath
  New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

  $magickArguments = [System.Collections.Generic.List[string]]::new()
  foreach ($frame in $frames) {
    $magickArguments.Add($frame)
  }
  $magickArguments.Add("-coalesce")
  $magickArguments.Add("-resize")
  $magickArguments.Add("960x600")
  $magickArguments.Add("-delay")
  $magickArguments.Add("120")
  $magickArguments.Add("-loop")
  $magickArguments.Add("0")
  $magickArguments.Add("-layers")
  $magickArguments.Add("Optimize")
  $magickArguments.Add($OutputPath)

  & $magickCommand.Source @magickArguments

  if (-not (Test-Path -LiteralPath $OutputPath)) {
    throw "ImageMagick did not write $OutputPath."
  }

  & $magickCommand.Source identify $OutputPath
  Write-Output "Captured real UI routes $($routes -join ', ') to $OutputPath"
} finally {
  if ($server -and (Get-Process -Id $server.Id -ErrorAction SilentlyContinue)) {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
  }

  $portProcessIdsAfter = @(
    Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty OwningProcess
  )

  foreach ($processId in $portProcessIdsAfter) {
    if ($portProcessIdsBefore -notcontains $processId) {
      Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
    }
  }

  $serverProcessesAfter = @(
    Get-CimInstance Win32_Process |
      Where-Object {
        $_.CommandLine -like "*next start*--port $Port*" -and
        $serverProcessIdsBefore -notcontains $_.ProcessId
      } |
      Select-Object -ExpandProperty ProcessId
  )

  foreach ($processId in $serverProcessesAfter) {
    Stop-Process -Id $processId -Force -ErrorAction SilentlyContinue
  }

  if (Test-Path -LiteralPath $tempRoot) {
    Remove-Item -LiteralPath $tempRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}
