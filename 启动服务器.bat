@echo off
chcp 65001>nul
cd /d "%~dp0"
echo 正在启动房间服务器（端口 8787），请保持本窗口开着……
echo 玩家在网页「联机对战」里连接 ws://localhost:8787
node server\server.js
pause
