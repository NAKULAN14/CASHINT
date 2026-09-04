# PowerShell script to start the application
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host " PREDICTIVE CASH-OUT INTELLIGENCE - STARTUP SCRIPT " -ForegroundColor Cyan
Write-Host "==========================================================" -ForegroundColor Cyan

$root = $PSScriptRoot
$frontend = Join-Path $root "frontend"

Write-Host "Starting Backend on http://localhost:8000..." -ForegroundColor Green
Start-Process -FilePath "python" -ArgumentList "-m uvicorn backend.main:app --port 8000 --reload" -WorkingDirectory $root

Start-Sleep -Seconds 2

Write-Host "Starting Frontend on http://localhost:5173..." -ForegroundColor Green
Start-Process -FilePath "cmd.exe" -ArgumentList "/c npm run dev" -WorkingDirectory $frontend

Write-Host "Both servers launched successfully!" -ForegroundColor Cyan
Write-Host "Backend:  http://localhost:8000"
Write-Host "Frontend: http://localhost:5173"
