# Health Gate Initialization Script (PowerShell)
# Fails fast on any error to protect harness integrity.
$ErrorActionPreference = "Stop"

Write-Host "=== 1. Checking Dependencies ===" -ForegroundColor Cyan
if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    npm install
}

Write-Host "=== 2. Running Linter ===" -ForegroundColor Cyan
npm run lint

Write-Host "=== 3. Running Automated Tests ===" -ForegroundColor Cyan
npm test

Write-Host "=== 4. Verifying Production Build ===" -ForegroundColor Cyan
npm run build

Write-Host "`n=== Environment healthy ===" -ForegroundColor Green
