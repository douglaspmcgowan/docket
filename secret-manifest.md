# Secret manifest

Project: vault-review-mobile

This generated view contains variable names and operating metadata only. Secret values, vault session keys, recovery keys, and access tokens are forbidden.

| Variable | Purpose | Provider | Trust boundary | Owner | Rotation | Consumers | Status |
|---|---|---|---|---|---|---|---|
| `APP_SECRET` | Cloud UI and API bearer credential | Bitwarden Password Manager and Vercel | cloud runtime | Douglas | on compromise, access change, or planned credential rotation | api/_auth.js | credential-required |
| `ARTIFACT_DIR` | Allowed local artifact root | local environment | loopback runtime | Douglas | review when the local data layout changes | local-server.js | configuration |
| `BLOB_READ_WRITE_TOKEN` | Private Vercel Blob read/write credential | Vercel | cloud runtime | Douglas | on compromise, access change, or provider rotation | api/_store.js | deployment-credential |
| `DOCKET_NODE` | Optional Node executable override for the hidden launcher | local environment | loopback runtime | Douglas | review after Node installation changes | docket-daemon.vbs | optional-configuration |
| `DOCKET_SYNC_MS` | Local daemon cloud-sync interval | local environment | loopback runtime | Douglas | review when sync policy changes | docket-daemon.js | optional-configuration |
| `LOCAL_STORE_DIR` | Local SQLite and JSON export directory | local filesystem | local data runtime | Douglas | review when storage location changes | local-server.js, api/_store.js, import-outbox.js, sync-cloud.js | configuration |
| `LOCAL_URL` | Loopback Docket base URL | local environment | loopback runtime | Douglas | review when local port or host changes | local clients | optional-configuration |
| `PORT` | Loopback HTTP port | local environment | loopback runtime | Douglas | review on port collision or network-policy change | local-server.js | optional-configuration |
| `REVIEW_SECRET` | Docket sync and review bearer credential | Bitwarden Password Manager | approved Docket child process | Douglas | on compromise, access change, or planned credential rotation | sync-cloud.js, sync.js, enqueue.js | credential-required |
| `REVIEW_URL` | Cloud Docket API base URL | Vercel | public endpoint configuration | Douglas | review when deployment URL changes | sync-cloud.js, sync.js, enqueue.js | configuration |
| `START_PATH` | Optional initial route for the local UI | local environment | loopback UI | Douglas | review when UI routing changes | local-server.js | optional-configuration |

Canonical source: `secret-manifest.json`
Refresh: `C:\Users\dougl\.agents\tools\Update-SecretManifest.cmd -Repository <repo>`
