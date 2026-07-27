# Current task

Goal: publish the verified Docket repository, relocate it to the lowercase local project root, and install a local-only startup task.

Completed:

- Recovered the source repository and bootstrapped the cross-agent project contract.
- Implemented local SQLite authority with reversible JSON exports.
- Added and tested the 157-card outbox importer.
- Verified all 69 tests and Gitleaks.
- Created the private `douglaspmcgowan/docket` repository.

Remaining:

1. Publish the verified source repository.
2. Relocate the working clone to `C:\Users\dougl\projects\docket`.
3. Register a reversible local-only logon task using the final path.
4. Re-run tests, Gitleaks, and project-state verification from the final clone.

Exact next verifier: `npm.cmd test`, followed by Gitleaks and a loopback HTTP check from the final clone.
