@echo off
chcp 65001>nul
cd /d "%~dp0"
if not exist "素材放入区" mkdir "素材放入区"
echo 正在应用「素材放入区」里的图片/音频……
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0apply_dropin.ps1"
pause
