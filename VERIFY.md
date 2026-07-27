# Verification

- Setup: `npm.cmd ci`
- Unit/integration tests: `npm.cmd test`
- Local storage evidence: the store tests must prove `docket.sqlite3`, current JSON export, previous JSON export, and legacy JSON import behavior.
- Syntax: `node --check enqueue.js; node --check local-server.js; node --check sync-cloud.js`
- Secret scan: `C:\Users\dougl\Tools\gitleaks\gitleaks.exe git --redact --no-banner`
- Project state: `C:\Users\dougl\.agents\tools\Test-AgentProjectState.cmd -Repository .`
- Local end-to-end: use a disposable `LOCAL_STORE_DIR`, start `node local-server.js`, and verify authenticated push, list/read, submit/archive, and pull flows.
- Cloud end-to-end: requires Douglas-authorized Vercel credentials and a safe public test card; verify the returned card ID and result round trip.
