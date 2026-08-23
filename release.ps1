$ErrorActionPreference = 'Stop'

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
