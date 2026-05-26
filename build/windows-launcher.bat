@echo off
set "APP_DIR=%~dp0"

if not exist "%APP_DIR%data" (
    mkdir "%APP_DIR%data"
    mkdir "%APP_DIR%data\music"
    mkdir "%APP_DIR%data\playlists"
    mkdir "%APP_DIR%data\recordings"
    mkdir "%APP_DIR%data\cache"
)

echo test > "%APP_DIR%data\test_write_permission.tmp" 2>nul
if exist "%APP_DIR%data\test_write_permission.tmp" (
    del "%APP_DIR%data\test_write_permission.tmp"
    start "" "%APP_DIR%YIYU.exe"
) else (
    echo Permission check failed. Please run the installer as administrator.
    pause >nul
    powershell -Command "Start-Process '%APP_DIR%YIYU.exe' -Verb runAs"
)
