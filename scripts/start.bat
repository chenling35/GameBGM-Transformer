@echo off
echo ========================================
echo GameBGM System - Starting...
echo ========================================
echo.

set CONDA_PATH=C:\Users\11060\miniconda3
set BACKEND_DIR=%~dp0..\backend
set FRONTEND_DIR=%~dp0..\frontend

echo [1/2] Starting Backend Server (Port 8000)...
echo Activating conda environment: GameBGM-Transformer
start "GameBGM-Backend" cmd /k "call "%CONDA_PATH%\Scripts\activate.bat" && call conda activate GameBGM-Transformer && cd /d "%BACKEND_DIR%" && python main.py"

echo Waiting 3 seconds for backend to start...
timeout /t 3 /nobreak >nul

echo [2/2] Starting Frontend Server (Port 5173)...
start "GameBGM-Frontend" cmd /k "cd /d "%FRONTEND_DIR%" && npm run dev"

echo.
echo ========================================
echo Started Successfully!
echo ========================================
echo.
echo Backend:  http://localhost:8000
echo Frontend: http://localhost:5173
echo.
echo Two windows opened:
echo - GameBGM-Backend (conda env: GameBGM-Transformer)
echo - GameBGM-Frontend (Vite dev server)
echo.
echo Press Ctrl+C in each window to stop
echo Or run scripts\stop.bat to stop all services
echo.
pause
