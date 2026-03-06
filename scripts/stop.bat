@echo off
echo ========================================
echo GameBGM System - Stopping...
echo ========================================
echo.

echo [1/2] Stopping Backend (Python)...
taskkill /FI "WINDOWTITLE eq GameBGM-Backend*" /T /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :8000 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo [2/2] Stopping Frontend (Node.js)...
taskkill /FI "WINDOWTITLE eq GameBGM-Frontend*" /T /F >nul 2>&1
for /f "tokens=5" %%a in ('netstat -ano ^| findstr :5173 ^| findstr LISTENING') do (
    taskkill /PID %%a /F >nul 2>&1
)

echo.
echo ========================================
echo All services stopped!
echo ========================================
echo.
pause
