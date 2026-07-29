@echo off
setlocal
>&2 echo Legacy sync.js execution is disabled because docket-sync authorizes sync-cloud.js only.
>&2 echo Run: powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%USERPROFILE%\.agents\tools\Invoke-WithBitwardenSecret.ps1" -CommandId "docket-sync"
exit /b 2
