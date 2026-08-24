$ErrorActionPreference = 'Stop'

# --- gate: no release ships unless the live two-instance call test passes ---
Write-Host "Running pre-release E2E (two instances, real call)..."
$exe = "$PWD\node_modules\electron\dist\electron.exe"
if (-not (Test-Path $exe)) { Write-Host "electron not installed? run npm install"; exit 1 }
$aLog = "$env:TEMP\rel-a.log"; $bLog = "$env:TEMP\rel-b.log"
$env:SMOKE_PEER = 'A'
$a = Start-Process -FilePath $exe -ArgumentList '.' -PassThru -NoNewWindow -RedirectStandardOutput $aLog -RedirectStandardError "$env:TEMP\rel-a.err"
Start-Sleep -Seconds 2
$env:SMOKE_PEER = 'B'
$b = Start-Process -FilePath $exe -ArgumentList '.' -PassThru -NoNewWindow -RedirectStandardOutput $bLog -RedirectStandardError "$env:TEMP\rel-b.err"
Wait-Process -Id $a.Id -Timeout 170 -ErrorAction SilentlyContinue
if (-not $a.HasExited) { Stop-Process -Id $a.Id -Force }
if (-not $b.HasExited) { Stop-Process -Id $b.Id -Force }
Remove-Item Env:SMOKE_PEER -ErrorAction SilentlyContinue
$all = (Get-Content $aLog, $bLog -ErrorAction SilentlyContinue) | Out-String
foreach ($mark in 'CALL_CONNECTED', 'chat-ok', 'FILE_OK', 'BIGFILE_DISK_OK', 'SHARE_LIVE', 'SHARE_CLEARED') {
  if ($all -notmatch [regex]::Escape($mark)) {
    Write-Host "E2E FAILED (missing $mark) — release aborted."
    exit 1
  }
}
Write-Host "E2E passed. Shipping."
# -----------------------------------------------------------------------------

git add -A
$staged = git diff --cached --name-only
if (-not $staged) {
  Write-Host 'Nothing changed since last release.'
  exit 1
}

git commit -m "changes: $($args -join ' ')"

# bump patch version -> creates the vX.Y.Z commit + tag
npm version patch

Write-Host "Pushing code + tags (this triggers the GitHub Actions build & release)..."
git push origin main --follow-tags

# keep the local installer in the project root fresh too
Write-Host "Building local installer..."
npx electron-builder --win nsis --publish never
Copy-Item "dist\gooncall setup.exe" "gooncall setup.exe" -Force
Write-Host "Root copy refreshed: gooncall setup.exe"

Write-Host ""
Write-Host "Done. Track CI: https://github.com/demon-of-fire/gooncall/actions"
