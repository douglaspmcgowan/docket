@echo off
rem One-click sync between the local ~/.claude/reviewer/ board and the Vercel app.
rem   Double-click            -> one push+pull cycle, then closes.
rem   sync-review.cmd --watch -> stays open, syncs every 15s (leave running to triage from phone).
rem Reads the passcode from .passcode.txt (never printed).
setlocal
cd /d "%~dp0"
set "REVIEW_URL=https://vault-review-mobile.vercel.app"
if not exist "%~dp0.passcode.txt" (
  echo Missing .passcode.txt next to this script.
  pause
  exit /b 1
)
for /f "usebackq delims=" %%s in ("%~dp0.passcode.txt") do set "REVIEW_SECRET=%%s"
node "%~dp0sync.js" %*
if not "%~1"=="--watch" (
  echo.
  echo Done. Press any key to close.
  pause >nul
)
endlocal
