!macro customInstall
  CreateDirectory "$PROFILE\Desktop"
  CreateShortCut "$PROFILE\Desktop\YIYU.lnk" "$appExe" "" "$appExe" 0 "" "" "YIYU"
  ClearErrors
  WinShell::SetLnkAUMI "$PROFILE\Desktop\YIYU.lnk" "${APP_ID}"

  CreateDirectory "$APPDATA\Microsoft\Windows\Start Menu\Programs"
  CreateShortCut "$APPDATA\Microsoft\Windows\Start Menu\Programs\YIYU.lnk" "$appExe" "" "$appExe" 0 "" "" "YIYU"
  ClearErrors
  WinShell::SetLnkAUMI "$APPDATA\Microsoft\Windows\Start Menu\Programs\YIYU.lnk" "${APP_ID}"

  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\YIYU.exe" "" "$appExe"
  WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\YIYU.exe" "Path" "$INSTDIR"

  FileOpen $0 "$TEMP\create-yiyu-shortcuts.ps1" w
  FileWrite $0 "Start-Sleep -Seconds 4$\r$\n"
  FileWrite $0 "$$target = '$appExe'$\r$\n"
  FileWrite $0 "$$workDir = '$INSTDIR'$\r$\n"
  FileWrite $0 "$$wsh = New-Object -ComObject WScript.Shell$\r$\n"
  FileWrite $0 "$$links = @($\r$\n"
  FileWrite $0 "  [System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'YIYU.lnk'),$\r$\n"
  FileWrite $0 "  [System.IO.Path]::Combine([Environment]::GetFolderPath('Programs'), 'YIYU.lnk')$\r$\n"
  FileWrite $0 ")$\r$\n"
  FileWrite $0 "foreach ($$link in $$links) {$\r$\n"
  FileWrite $0 "  $$dir = [System.IO.Path]::GetDirectoryName($$link)$\r$\n"
  FileWrite $0 "  if (-not [System.IO.Directory]::Exists($$dir)) { [System.IO.Directory]::CreateDirectory($$dir) | Out-Null }$\r$\n"
  FileWrite $0 "  $$shortcut = $$wsh.CreateShortcut($$link)$\r$\n"
  FileWrite $0 "  $$shortcut.TargetPath = $$target$\r$\n"
  FileWrite $0 "  $$shortcut.WorkingDirectory = $$workDir$\r$\n"
  FileWrite $0 "  $$shortcut.IconLocation = $$target + ',0'$\r$\n"
  FileWrite $0 "  $$shortcut.Description = 'YIYU'$\r$\n"
  FileWrite $0 "  $$shortcut.Save()$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileWrite $0 "Remove-Item -LiteralPath $$PSCommandPath -Force -ErrorAction SilentlyContinue$\r$\n"
  FileClose $0
  Exec '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "$TEMP\create-yiyu-shortcuts.ps1"'
  ClearErrors

  SetShellVarContext all
  CreateShortCut "$DESKTOP\YIYU.lnk" "$appExe" "" "$appExe" 0 "" "" "YIYU"
  ClearErrors
  WinShell::SetLnkAUMI "$DESKTOP\YIYU.lnk" "${APP_ID}"
  CreateShortCut "$SMPROGRAMS\YIYU.lnk" "$appExe" "" "$appExe" 0 "" "" "YIYU"
  ClearErrors
  WinShell::SetLnkAUMI "$SMPROGRAMS\YIYU.lnk" "${APP_ID}"
  SetShellVarContext current

  Delete "$DESKTOP\Wedding Music Player.lnk"
  Delete "$DESKTOP\WeddingMusicPlayer.lnk"
  Delete "$DESKTOP\????.lnk"
  Delete "$SMPROGRAMS\Wedding Music Player.lnk"
  Delete "$SMPROGRAMS\WeddingMusicPlayer.lnk"
  Delete "$SMPROGRAMS\????.lnk"
!macroend

!macro customUnInstall
  Delete "$PROFILE\Desktop\YIYU.lnk"
  Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\YIYU.lnk"
  DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\App Paths\YIYU.exe"

  FileOpen $0 "$PLUGINSDIR\remove-yiyu-shortcuts.ps1" w
  FileWrite $0 "$$links = @($\r$\n"
  FileWrite $0 "  [System.IO.Path]::Combine([Environment]::GetFolderPath('Desktop'), 'YIYU.lnk'),$\r$\n"
  FileWrite $0 "  [System.IO.Path]::Combine([Environment]::GetFolderPath('Programs'), 'YIYU.lnk')$\r$\n"
  FileWrite $0 ")$\r$\n"
  FileWrite $0 "foreach ($$link in $$links) { if ([System.IO.File]::Exists($$link)) { Remove-Item -LiteralPath $$link -Force -ErrorAction SilentlyContinue } }$\r$\n"
  FileClose $0
  ExecWait '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -ExecutionPolicy Bypass -File "$PLUGINSDIR\remove-yiyu-shortcuts.ps1"'
  ClearErrors

  SetShellVarContext all
  Delete "$DESKTOP\YIYU.lnk"
  Delete "$SMPROGRAMS\YIYU.lnk"
  SetShellVarContext current

  Delete "$DESKTOP\Wedding Music Player.lnk"
  Delete "$DESKTOP\WeddingMusicPlayer.lnk"
  Delete "$DESKTOP\????.lnk"
  Delete "$SMPROGRAMS\Wedding Music Player.lnk"
  Delete "$SMPROGRAMS\WeddingMusicPlayer.lnk"
  Delete "$SMPROGRAMS\????.lnk"
!macroend
