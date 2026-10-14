@echo off
chcp 65001>nul
cd /d "%~dp0"
echo 正在为你创建公网房间（首次会下载一个约 30MB 的穿透工具）……
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\tunnel.ps1"
