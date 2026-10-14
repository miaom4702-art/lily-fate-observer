@echo off
chcp 65001>nul
cd /d "%~dp0"
set /p img=把图片拖进本窗口(或粘贴完整路径)，回车: 
set /p chr=角色 id (mio/akari/shizuku/saori/ichigo/yuu): 
set img=%img:"=%
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0set_avatar.ps1" -Char %chr% -Image "%img%"
pause
