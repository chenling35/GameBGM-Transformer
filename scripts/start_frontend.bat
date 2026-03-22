@echo off
chcp 936 >nul
set FRONTEND_DIR=%~dp0..\frontend
cd /d "%FRONTEND_DIR%"
echo [前端] 已启动，按 Ctrl+C 停止
npm run dev
pause
