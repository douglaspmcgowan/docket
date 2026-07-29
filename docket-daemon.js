#!/usr/bin/env node
// Durable supervisor for the Docket local mirror. One long-running process that:
//   1. keeps local-server.js (:8471) alive — respawns it with exponential backoff if it dies
//   2. invokes the approved Bitwarden Secrets Manager broker command every DOCKET_SYNC_MS
// Wire it to a logon Scheduled Task (docket-daemon.vbs launches it hidden). Nothing sensitive leaves
// the box: the server is loopback-only and the brokered publisher applies the shared content guard.
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const DIR = __dirname;
const SYNC_MS = Number(process.env.DOCKET_SYNC_MS) || 15 * 60 * 1000;
const HOME = process.env.USERPROFILE || process.env.HOME || DIR;
const BROKER = path.join(HOME, '.agents', 'tools', 'Invoke-WithBitwardenSecret.ps1');
const WINDOWS_POWERSHELL = process.env.SystemRoot
  ? path.join(process.env.SystemRoot, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe')
  : 'powershell.exe';
let serverChild = null, syncChild = null, backoff = 1000;

function startServer() {
  serverChild = spawn(process.execPath, [path.join(DIR, 'local-server.js')], { cwd: DIR, stdio: 'inherit' });
  serverChild.on('spawn', () => { backoff = 1000; console.log('[daemon] local-server started (pid ' + serverChild.pid + ')'); });
  serverChild.on('exit', (code) => {
    console.error(`[daemon] local-server exited (${code}); restarting in ${backoff}ms`);
    setTimeout(startServer, backoff);
    backoff = Math.min(backoff * 2, 60000);
  });
}

function syncTick() {
  return new Promise(resolve => {
    if (!fs.existsSync(BROKER)) {
      console.error(`[daemon] sync broker is missing: ${BROKER}`);
      resolve();
      return;
    }
    syncChild = spawn(WINDOWS_POWERSHELL, [
      '-NoProfile',
      '-ExecutionPolicy', 'Bypass',
      '-File', BROKER,
      '-CommandId', 'docket-sync',
    ], { cwd: DIR, stdio: 'inherit', windowsHide: true });
    syncChild.on('error', error => {
      console.error('[daemon] brokered sync failed:', error.message);
      syncChild = null;
      resolve();
    });
    syncChild.on('exit', code => {
      if (code !== 0) console.error(`[daemon] brokered sync exited (${code})`);
      syncChild = null;
      resolve();
    });
  });
}

startServer();
// First sync 5s after boot (let the server bind), then every SYNC_MS. Self-scheduling so a slow sync
// never overlaps the next one.
setTimeout(function loop() { syncTick().finally(() => setTimeout(loop, SYNC_MS)); }, 5000);

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => {
  if (serverChild) serverChild.kill();
  if (syncChild) syncChild.kill();
  process.exit(0);
});
