# tunnel.ps1 —— 一键「在自己电脑上开公网房间」。
# 做三件事：① 启动房间服务器（同时托管游戏网页）② 用 cloudflared 做内网穿透 ③ 显示公网网址并打开浏览器。
# 首次运行会自动下载 cloudflared（约 30MB，来自 Cloudflare 官方）。
$ErrorActionPreference = 'Continue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$root = Split-Path -Parent $PSScriptRoot
$port = if ($env:PORT) { [int]$env:PORT } else { 8787 }

# 1) 检查 Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host "未检测到 Node.js。请先安装： https://nodejs.org  （装 LTS 版即可）" -ForegroundColor Red
  Write-Host "按回车退出。"; [void][System.Console]::ReadLine(); exit 1
}

# 2) 准备 cloudflared
$cf = (Get-Command cloudflared -ErrorAction SilentlyContinue).Source
if (-not $cf) {
  $local = Join-Path $PSScriptRoot 'cloudflared.exe'
  if (-not (Test-Path -LiteralPath $local)) {
    Write-Host "首次运行：正在下载内网穿透工具 cloudflared（约 30MB）……" -ForegroundColor Cyan
    try {
      Invoke-WebRequest -UseBasicParsing -Uri 'https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe' -OutFile $local
    } catch {
      Write-Host ("下载失败：" + $_.Exception.Message) -ForegroundColor Red
      Write-Host "可手动下载放到 tools\cloudflared.exe 后再运行。" -ForegroundColor Yellow
      Write-Host "按回车退出。"; [void][System.Console]::ReadLine(); exit 1
    }
  }
  $cf = $local
}

# 3) 启动房间服务器（同源托管游戏网页 + 联机）
Write-Host "正在启动房间服务器（端口 $port）……"
$srv = Start-Process -FilePath 'node' -ArgumentList "server\server.js" -WorkingDirectory $root -PassThru
Start-Sleep -Seconds 1

# 4) 启动内网穿透并抓取公网地址
$log = Join-Path $env:TEMP ("cf_tunnel_" + [guid]::NewGuid().ToString('N') + ".log")
$cfp = Start-Process -FilePath $cf -ArgumentList 'tunnel','--url',("http://localhost:" + $port) -RedirectStandardError $log -PassThru -WindowStyle Hidden

$url = $null
for ($i = 0; $i -lt 60; $i++) {
  Start-Sleep -Milliseconds 700
  if (Test-Path -LiteralPath $log) {
    $txt = Get-Content -LiteralPath $log -Raw -ErrorAction SilentlyContinue
    $m = [regex]::Match([string]$txt, 'https://[a-z0-9-]+\.trycloudflare\.com')
    if ($m.Success) { $url = $m.Value; break }
  }
}

Write-Host ""
if ($url) {
  Write-Host "=====================================================" -ForegroundColor Green
  Write-Host ("  公网地址（把这个发给朋友就行）：" ) -ForegroundColor Green
  Write-Host ("      " + $url) -ForegroundColor Green
  Write-Host "=====================================================" -ForegroundColor Green
  Write-Host "  朋友打开这个网址 → 填名字 → 一人创建房间，其余输房间码加入。"
  Write-Host "  保持本窗口开着；按回车结束（会关闭房间）。"
  try { Set-Clipboard -Value $url } catch {}
  Start-Process $url
} else {
  Write-Host "未能获取公网地址（可能网络受限）。可改用 Render 部署，见 README。" -ForegroundColor Yellow
}

[void][System.Console]::ReadLine()

# 5) 结束：关闭穿透与服务器
try { Stop-Process -Id $cfp.Id -Force -ErrorAction SilentlyContinue } catch {}
try { Stop-Process -Id $srv.Id -Force -ErrorAction SilentlyContinue } catch {}
