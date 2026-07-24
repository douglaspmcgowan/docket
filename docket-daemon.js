#!/usr/bin/env node
// Durable supervisor for the Docket local mirror. One long-running process that:
//   1. keeps local-server.js (:8471) alive — respawns it with exponential backoff if it dies
//   2. runs sync-cloud's syncOnce() every DOCKET_SYNC_MS (default 15 min) to keep the cloud's
//      non-sensitive subset current with the local store, and pull decisions back
// Wire it to a logon Scheduled Task (docket-daemon.vbs launches it hidden). Nothing sensitive leaves
// the box: the server is 127.0.0.1-only and syncOnce pushes ONLY explicitly-public cards.
const { spawn } = require('child_process');
const path = require('path');
const { syncOnce } = require('./sync-cloud');

const DIR = __dirname;
const SYNC_MS = Number(process.env.DOCKET_SYNC_MS) || 15 * 60 * 1000;
let child = null, backoff = 1000;

function startServer() {
  child = spawn(process.execPath, [path.join(DIR, 'local-server.js')], { cwd: DIR, stdio: 'inherit' });
  child.on('spawn', () => { backoff = 1000; console.log('[daemon] local-server started (pid ' + child.pid + ')'); });
  child.on('exit', (code) => {
    console.error(`[daemon] local-server exited (${code}); restarting in ${backoff}ms`);
    setTimeout(startServer, backoff);
    backoff = Math.min(backoff * 2, 60000);
  });
}

async function syncTick() {
  try { const r = await syncOnce(); console.log(`[daemon] sync: pushed ${r.pushed} public, pulled ${r.pulled} decisions`); }
  catch (e) { console.error('[daemon] sync failed:', e.message); }
}

startServer();
// First sync 5s after boot (let the server bind), then every SYNC_MS. Self-scheduling so a slow sync
// never overlaps the next one.
setTimeout(function loop() { syncTick().finally(() => setTimeout(loop, SYNC_MS)); }, 5000);

for (const sig of ['SIGINT', 'SIGTERM']) process.on(sig, () => { if (child) child.kill(); process.exit(0); });
