@echo off
chcp 65001 >nul
cd /d "%~dp0"

title YT Knowledge Base

echo ========================================
echo   YT Knowledge Base - 启动器
echo ========================================
echo.
echo 请选择启动模式:
echo.
echo   [1] 开发模式 (npm run dev)
echo   [2] 生产模式 (先 build 再 start)
echo   [3] 仅安装依赖
echo   [4] 环境检查
echo   [0] 退出
echo.
echo ========================================

set /p choice=请输入选项 (0-4):

if "%choice%"=="1" goto dev
if "%choice%"=="2" goto prod
if "%choice%"=="3" goto install
if "%choice%"=="4" goto check
if "%choice%"=="0" exit

echo 无效选项，请重新运行
pause
exit

:dev
echo.
echo ========================================
echo   开发模式
echo ========================================
echo.
call :check_env
if errorlevel 1 exit
call :check_deps
if errorlevel 1 exit
echo.
echo [+] 启动开发服务器...
echo.
echo 服务地址: http://localhost:3000
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
cmd /k "npm run dev"
exit

:prod
echo.
echo ========================================
echo   生产模式
echo ========================================
echo.
call :check_env
if errorlevel 1 exit
call :check_deps
if errorlevel 1 exit
echo.
echo [+] 构建项目中...
call npm run build
if errorlevel 1 (
    echo [!] 构建失败
    pause
    exit
)
echo.
echo [+] 启动生产服务器...
echo.
echo 服务地址: http://localhost:3000
echo.
echo 按 Ctrl+C 停止服务器
echo ========================================
cmd /k "npm run start"
exit

:install
echo.
echo [+] 正在安装依赖...
call npm install
echo.
echo [+] 依赖安装完成
pause
exit

:check
echo.
echo ========================================
echo   环境检查
echo ========================================
echo.
call :check_env
echo.
if exist "node_modules" (
    echo    [OK] node_modules 已安装
) else (
    echo    [!] node_modules 未安装
)
echo.
if exist "package.json" (
    echo    [OK] package.json 存在
) else (
    echo    [!] package.json 不存在
)
echo.
echo ========================================
echo   检查完成
echo ========================================
pause
exit

:check_env
if not exist ".env" (
    if exist ".env.example" (
        echo    [!] .env 不存在，正在创建...
        copy .env.example .env
        echo    [!] 请编辑 .env 文件配置后重试
        echo.
        exit /b 1
    ) else (
        echo    [!] .env 和 .env.example 都不存在
        exit /b 1
    )
)
echo    [OK] .env 存在
exit /b 0

:check_deps
if not exist "node_modules" (
    echo    [!] 依赖未安装，正在安装...
    call npm install
    if errorlevel 1 (
        exit /b 1
    )
)
echo    [OK] 依赖已安装
exit /b 0
