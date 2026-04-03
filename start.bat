@echo off
chcp 65001 >nul
title YT Knowledge Base

echo ========================================
echo   YT Knowledge Base - 启动中...
echo ========================================
echo.

cd /d "%~dp0"

:: 检查 .env
if not exist ".env" (
    if exist ".env.example" (
        echo [!] 正在创建 .env 文件...
        copy .env.example .env
        echo [!] 请先编辑 .env 文件配置 API 密钥
        echo.
        pause
        exit
    )
)

:: 检查依赖
if not exist "node_modules" (
    echo [!] 正在安装依赖，请稍候...
    call npm install
    echo.
)

echo [+] 启动开发服务器...
echo.
echo 访问地址: http://localhost:3000
echo.
echo ========================================
echo   按 Ctrl+C 停止服务器
echo ========================================

cmd /k "npm run dev"
