$ErrorActionPreference = 'Stop'

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $ProjectRoot

Write-Host 'Stopping old Wedding Music Player processes for this project...'
$projectPathPattern = '*wedding_music_player_app-main*'
Get-CimInstance Win32_Process |
  Where-Object {
    ($_.Name -eq 'WeddingMusicPlayer.exe') -or
    ($_.Name -eq 'electron.exe' -and $_.CommandLine -like $projectPathPattern)
  } |
  ForEach-Object {
    try {
      Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
      Write-Host "Stopped process $($_.Name) ($($_.ProcessId))"
    } catch {
      Write-Warning "Could not stop process $($_.ProcessId): $($_.Exception.Message)"
    }
  }

$env:NODE_ENV = 'development'

Write-Host ''
Write-Host 'Starting source-code dev app...'
Write-Host 'This runs Vite + Electron from src, not the packaged release.'
Write-Host 'Close the app window or press Ctrl+C here to stop.'
Write-Host ''

npx vite --host 127.0.0.1
