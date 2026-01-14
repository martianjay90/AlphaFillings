# Next.js Dev Reset (safe)
# - 기본: 포트 기반으로 해당 dev만 종료
# - 옵션: -KillAllNode 로 모든 node.exe 종료
# - 옵션: -Reinstall 로 npm install 강제

param(
  [switch]$KillAllNode,
  [switch]$Reinstall,
  [int]$Port = 3000
)

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

# 프로젝트 루트로 이동 (스크립트 위치 기준)
$projectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $projectRoot

Write-Host ""
Write-Host ("Next.js Dev Reset Started ({0})" -f $projectRoot) -ForegroundColor Cyan

# 1) 포트 기반으로 dev 서버 종료 (3000~3010)
Write-Host ""
Write-Host "1. Stopping dev servers on ports 3000-3010..." -ForegroundColor Yellow

$ports = 3000..3010
$stopped = @()

foreach ($p in $ports) {
  try {
    $conn = Get-NetTCPConnection -LocalPort $p -ErrorAction SilentlyContinue | Where-Object { $_.State -eq "Listen" }
    if ($conn) {
      $pid = $conn.OwningProcess
      if ($pid) {
        $proc = Get-Process -Id $pid -ErrorAction SilentlyContinue
        # node 프로세스일 때만 종료 (안전)
        if ($proc -and $proc.ProcessName -eq "node") {
          Stop-Process -Id $pid -Force -ErrorAction SilentlyContinue
          $stopped += $p
        }
      }
    }
  } catch {}
}

if ($stopped.Count -gt 0) {
  $portsList = $stopped -join ', '
  Write-Host ("   OK: Stopped node dev servers on ports: {0}" -f $portsList) -ForegroundColor Green
} else {
  Write-Host "   OK: No node dev servers listening on 3000-3010" -ForegroundColor Green
}

# 2) (옵션) 모든 node.exe 종료
if ($KillAllNode) {
  Write-Host ""
  Write-Host "2. KillAllNode enabled: terminating ALL node.exe..." -ForegroundColor Yellow
  try {
    $null = & taskkill /F /T /IM node.exe 2>&1
    Write-Host "   OK: taskkill executed" -ForegroundColor Green
  } catch {
    Write-Host ("   WARNING: taskkill failed (continuing): {0}" -f $_) -ForegroundColor Yellow
  }
} else {
  Write-Host ""
  Write-Host "2. KillAllNode disabled: skipping global node.exe termination" -ForegroundColor Gray
}

Start-Sleep -Seconds 1

# 3) 캐시 삭제
Write-Host ""
Write-Host "3. Deleting caches..." -ForegroundColor Yellow
$cacheDirs = @(".next", ".turbo", "node_modules\.cache")

foreach ($dir in $cacheDirs) {
  if (Test-Path $dir) {
    try {
      Remove-Item -Path $dir -Recurse -Force -ErrorAction Stop
      Write-Host ("   OK: Deleted {0}" -f $dir) -ForegroundColor Green
    } catch {
      Write-Host ("   Retrying deletion of {0}..." -f $dir) -ForegroundColor Gray
      Start-Sleep -Seconds 2
      try {
        Remove-Item -Path $dir -Recurse -Force -ErrorAction Stop
        Write-Host ("   OK: Deleted {0} (retry)" -f $dir) -ForegroundColor Green
      } catch {
        Write-Host ("   WARNING: Failed to delete {0}: {1}" -f $dir, $_) -ForegroundColor Yellow
      }
    }
  } else {
    Write-Host ("   INFO: Not found {0}" -f $dir) -ForegroundColor Gray
  }
}

# 4) 의존성 설치 (기본: node_modules 없을 때만, 옵션: -Reinstall)
Write-Host ""
Write-Host "4. Checking dependencies..." -ForegroundColor Yellow

$needInstall = $false
if ($Reinstall) {
  $needInstall = $true
} elseif (-not (Test-Path "node_modules")) {
  $needInstall = $true
}

if ($needInstall) {
  Write-Host "   Running npm install..." -ForegroundColor Yellow
  npm install
  if ($LASTEXITCODE -eq 0) {
    Write-Host "   OK: npm install completed" -ForegroundColor Green
  } else {
    Write-Host "   WARNING: npm install failed (continuing)" -ForegroundColor Yellow
  }
} else {
  Write-Host "   OK: Dependencies unchanged (skipping npm install)" -ForegroundColor Green
}

# 5) dev 시작 (포트 고정)
Write-Host ""
Write-Host ("5. Starting dev server on port {0}..." -f $Port) -ForegroundColor Yellow
Write-Host ("   http://localhost:{0}" -f $Port) -ForegroundColor Cyan
Write-Host ""

npm run dev -- -p $Port
