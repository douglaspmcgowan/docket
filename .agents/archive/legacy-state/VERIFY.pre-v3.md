# Archived verification file

Verification now lives in `TASK.md`.

- Setup: `npm.cmd ci`
- Unit/integration tests: `npm.cmd test`
- Local storage evidence: store tests cover SQLite, JSON exports, previous exports, legacy import, schema failures, and concurrent mutation behavior.
- Blob conditional-write evidence: `node --test test/blob-provider.test.js test/document-store-concurrency.test.js test/api-atomic-writes.test.js`
- Complete export and disposable restore: `node --test test/export-restore.test.js test/data-cli.test.js`
- Project adapter: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.agents\data\Manage-DocketBlob.test.ps1`
- Live isolated Blob concurrency: `vercel.cmd env run -- node scripts\verify-blob-concurrency.js`
- SQLite compatibility adapter: `powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\.agents\data\Sync-ProjectData.test.ps1`
- Syntax: `node --check enqueue.js; node --check local-server.js; node --check sync-cloud.js; node --check scripts\docket-data.js; node --check scripts\verify-blob-concurrency.js`
- Secret scan: `C:\Users\dougl\Tools\gitleaks\gitleaks.exe git --redact --no-banner`
- Project state: `C:\Users\dougl\.agents\tools\Test-AgentProjectState.cmd -Repository .`
- Local end-to-end: use a disposable `LOCAL_STORE_DIR`, start `node local-server.js`, and exercise authenticated push, list/read, submit/archive, and pull flows.
