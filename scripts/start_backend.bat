@echo off
chcp 936 >nul
set CONDA_PATH=C:\Users\11060\miniconda3
set BACKEND_DIR=%~dp0..\backend
set CONDA_ENV=GameBGM-Transformer
call "%CONDA_PATH%\Scripts\activate.bat"
call conda activate %CONDA_ENV%
cd /d "%BACKEND_DIR%"
echo [后端] 已启动，按 Ctrl+C 停止
python main.py
pause
