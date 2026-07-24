@echo off
rem Non-interactive one-shot sync (no pause) — for scripted runs and scheduled tasks.
rem Pass --watch to loop. Reads the passcode from .passcode.txt (never printed).
setlocal
cd /d "%~dp0"
set "REVIEW_URL=https://vault-review-mobile.vercel.app"
for /f "usebackq delims=" %%s in ("%~dp0.passcode.txt") do set "REVIEW_SECRET=%%s"
node "%~dp0sync.js" %*
endlocal
