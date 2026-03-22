@echo off
chcp 936 >nul
echo ========================================
echo  GameBGM System - 启动检查
echo ========================================
echo.

set CONDA_PATH=C:\Users\11060\miniconda3
set FRONTEND_DIR=%~dp0..\frontend
set CONDA_ENV=GameBGM-Transformer
set BACKEND_PORT=8000
set FRONTEND_PORT=5173

:: --- 检查 1: conda ---
echo [检查 1/4] 检测 Conda 环境...
if not exist "%CONDA_PATH%\Scripts\activate.bat" (
    echo [错误] 未找到 Conda: %CONDA_PATH%
    pause
    exit /b 1
)
call "%CONDA_PATH%\Scripts\activate.bat" >nul 2>&1
call conda env list 2>nul | findstr /C:"%CONDA_ENV%" >nul
if errorlevel 1 (
    echo [错误] 未找到 conda 环境 "%CONDA_ENV%"
    echo        请先运行: conda env create -f environment.yml
    pause
    exit /b 1
)
echo [OK] Conda 环境 "%CONDA_ENV%" 存在

:: --- 检查 2: Node.js ---
echo [检查 2/4] 检测 Node.js...
where node >nul 2>&1
if errorlevel 1 (
    echo [错误] 未找到 node.exe，请安装 Node.js: https://nodejs.org/
    pause
    exit /b 1
)
for /f "tokens=*" %%v in ('node --version 2^>nul') do echo [OK] Node.js %%v
for /f "tokens=*" %%v in ('npm --version 2^>nul') do echo [OK] npm v%%v

:: --- 检查 3: node_modules ---
echo [检查 3/4] 检测前端依赖...
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [信息] 未找到 node_modules，自动执行 npm install...
    cd /d "%FRONTEND_DIR%"
    npm install
    if errorlevel 1 (
        echo [错误] npm install 失败
        pause
        exit /b 1
    )
    echo [OK] npm install 完成
) else (
    echo [OK] node_modules 已存在
)

echo.
echo ========================================
echo  所有检查通过，开始启动服务
echo ========================================
echo.

echo [1/2] 启动后端服务 (端口 %BACKEND_PORT%)...
start "GameBGM-Backend [:%BACKEND_PORT%]" cmd /k "%~dp0start_backend.bat"

timeout /t 3 /nobreak >nul

echo [2/2] 启动前端服务 (端口 %FRONTEND_PORT%)...
start "GameBGM-Frontend [:%FRONTEND_PORT%]" cmd /k "%~dp0start_frontend.bat"

echo.
echo ========================================
echo  服务已启动！
echo ========================================
echo.
echo  后端 API:  http://localhost:%BACKEND_PORT%
echo  前端 UI:   http://localhost:%FRONTEND_PORT%
echo  API 文档:  http://localhost:%BACKEND_PORT%/docs
echo.
echo  停止服务：在各自窗口按 Ctrl+C，或运行 scripts\stop.bat
echo.
pause
