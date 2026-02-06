# Windows PowerShell helper for fixing EPERM / locked node_modules issues.
# Run:
#   powershell -ExecutionPolicy Bypass -File .\scripts\windows-clean-install.ps1

$ErrorActionPreference = 'Continue'

Write-Host "[1/5] Stop node.exe (if running)"
try { taskkill /F /IM node.exe | Out-Null } catch {}

Write-Host "[2/5] Remove .next"
if (Test-Path .next) {
  try { Remove-Item -Recurse -Force .next } catch {}
}

Write-Host "[3/5] Remove node_modules"
if (Test-Path node_modules) {
  try { Remove-Item -Recurse -Force node_modules } catch {}
}

Write-Host "[4/5] Remove package-lock.json"
if (Test-Path package-lock.json) {
  try { Remove-Item -Force package-lock.json } catch {}
}

Write-Host "[5/5] Fresh install"
npm install --no-audit --no-fund

Write-Host "Done. Now run: npm run dev"
