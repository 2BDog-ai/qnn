@echo off
REM 艺语音乐播放器 Windows 启动脚本
REM 确保应用具有正确的权限访问安装目录

echo 正在启动艺语音乐播放器...

REM 获取当前脚本目录
set "APP_DIR=%~dp0"

REM 检查data目录是否存在，如果不存在则创建
if not exist "%APP_DIR%data" (
    echo 创建数据目录...
    mkdir "%APP_DIR%data"
    mkdir "%APP_DIR%data\music"
    mkdir "%APP_DIR%data\playlists"
    mkdir "%APP_DIR%data\recordings"
    mkdir "%APP_DIR%data\cache"
)

REM 测试对data目录的写权限
echo test > "%APP_DIR%data\test_write_permission.tmp" 2>nul
if exist "%APP_DIR%data\test_write_permission.tmp" (
    del "%APP_DIR%data\test_write_permission.tmp"
    echo 权限检查通过，启动应用程序...
    start "" "%APP_DIR%艺语音乐播放器.exe"
) else (
    echo 检测到权限不足，请以管理员身份运行安装程序或手动设置目录权限。
    echo 按任意键继续...
    pause >nul
    REM 尝试以管理员权限启动
    powershell -Command "Start-Process '%APP_DIR%艺语音乐播放器.exe' -Verb runAs"
)
