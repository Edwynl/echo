# YT Knowledge Base - PowerShell 启动脚本
# 使用方法: 右键 -> "使用 PowerShell 运行" 或 .\start.ps1

$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot

function Write-Header {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  YT Knowledge Base - 启动器" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
}

function Test-Environment {
    Write-Host "[+] 检查环境..." -ForegroundColor Yellow

    # Check .env
    $envFile = Join-Path $projectRoot ".env"
    $envExample = Join-Path $projectRoot ".env.example"

    if (-not (Test-Path $envFile)) {
        if (Test-Path $envExample) {
            Write-Host "    [!] .env 不存在，正在创建..." -ForegroundColor Red
            Copy-Item $envExample $envFile
            Write-Host "    [!] 请编辑 .env 文件配置后重试" -ForegroundColor Red
            return $false
        } else {
            Write-Host "    [!] .env 和 .env.example 都不存在" -ForegroundColor Red
            return $false
        }
    }
    Write-Host "    [OK] .env 存在" -ForegroundColor Green

    # Check node_modules
    $nodeModules = Join-Path $projectRoot "node_modules"
    if (-not (Test-Path $nodeModules)) {
        Write-Host "    [!] 依赖未安装" -ForegroundColor Red
        return $false
    }
    Write-Host "    [OK] 依赖已安装" -ForegroundColor Green

    return $true
}

function Install-Dependencies {
    Write-Host "[+] 安装依赖中..." -ForegroundColor Yellow
    Push-Location $projectRoot
    try {
        npm install
        if ($LASTEXITCODE -ne 0) { throw "npm install failed" }
        Write-Host "    [OK] 依赖安装完成" -ForegroundColor Green
    } finally {
        Pop-Location
    }
}

function Start-Development {
    Write-Header
    Write-Host "启动开发模式..." -ForegroundColor Cyan

    # Check environment
    if (-not (Test-Environment)) {
        Write-Host "请先配置环境后重试" -ForegroundColor Red
        Write-Host ""
        Write-Host "按任意键退出..." -ForegroundColor Gray
        $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        exit 1
    }

    # Auto install if needed
    if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
        Install-Dependencies
    }

    Write-Host ""
    Write-Host "服务地址: http://localhost:3000" -ForegroundColor Green
    Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""

    Push-Location $projectRoot
    try {
        npm run dev
    } finally {
        Pop-Location
    }
}

function Start-Production {
    Write-Header
    Write-Host "启动生产模式..." -ForegroundColor Cyan

    # Check environment
    if (-not (Test-Environment)) {
        Write-Host "请先配置环境后重试" -ForegroundColor Red
        exit 1
    }

    # Auto install if needed
    if (-not (Test-Path (Join-Path $projectRoot "node_modules"))) {
        Install-Dependencies
    }

    Write-Host ""
    Write-Host "[+] 构建项目中..." -ForegroundColor Yellow

    Push-Location $projectRoot
    try {
        npm run build
        if ($LASTEXITCODE -ne 0) {
            Write-Host "[!] 构建失败" -ForegroundColor Red
            exit 1
        }

        Write-Host ""
        Write-Host "[+] 启动生产服务器..." -ForegroundColor Yellow
        Write-Host ""
        Write-Host "服务地址: http://localhost:3000" -ForegroundColor Green
        Write-Host "按 Ctrl+C 停止服务器" -ForegroundColor Gray
        Write-Host "========================================" -ForegroundColor Cyan
        Write-Host ""

        npm run start
    } finally {
        Pop-Location
    }
}

function Show-Menu {
    Write-Header
    Write-Host "请选择启动模式:" -ForegroundColor White
    Write-Host ""
    Write-Host "  [1] 开发模式 (npm run dev)" -ForegroundColor Yellow
    Write-Host "  [2] 生产模式 (先 build 再 start)" -ForegroundColor Yellow
    Write-Host "  [3] 仅安装依赖" -ForegroundColor Yellow
    Write-Host "  [4] 环境检查" -ForegroundColor Yellow
    Write-Host "  [0] 退出" -ForegroundColor Gray
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan

    $choice = Read-Host "请输入选项 (0-4)"

    switch ($choice) {
        "1" { Start-Development }
        "2" { Start-Production }
        "3" {
            Write-Host ""
            Install-Dependencies
            Write-Host ""
            Write-Host "按任意键退出..." -ForegroundColor Gray
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        }
        "4" {
            Write-Host ""
            Test-Environment
            Write-Host ""
            Write-Host "按任意键退出..." -ForegroundColor Gray
            $null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
        }
        "0" { exit 0 }
        default {
            Write-Host "无效选项，请重新运行" -ForegroundColor Red
            Start-Sleep 1
            Show-Menu
        }
    }
}

# Main
if ($args.Count -gt 0) {
    switch ($args[0]) {
        "dev" { Start-Development }
        "prod" { Start-Production }
        "install" { Install-Dependencies }
        "check" { Test-Environment }
        default {
            Write-Host "未知参数: $($args[0])" -ForegroundColor Red
            Write-Host "可用参数: dev, prod, install, check"
        }
    }
} else {
    Show-Menu
}
