@echo off
chcp 65001>nul
cd /d "%~dp0"
echo 正在更新文本……
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0build_content.ps1"
pause
