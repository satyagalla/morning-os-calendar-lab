# Observed iPhone results

User-reported results on 2026-09-18. Plugin 0.1.0, Obsidian 1.12.7, iOS, America/New_York. OS version not supplied. These are manual reports, not independently observed automation.

- Web Crypto random generation and SHA-256 known vector: PASS.
- Native unauthenticated public Google HTTP: PASS, status 200.
- Wrong-state synthetic callback: rejected.
- Valid callback: accepted; repeated callback: no-session.
- New synthetic session: accepted.
- User confirmed Safari returned to the correct vault.
- After cold restart: no-session, expected for in-memory sessions.

## Google OAuth: version 0.2.0

User-reported session on the same Obsidian version/platform/timezone, 2026-09-18:

- 08:38:40: service configured for the session.
- 08:38:54: Google login prepared.
- 08:40:29: login PASS; required calendar scope granted; refresh token received.
- 08:40:45, 08:43:18, 08:43:30: token refresh PASS.
- 08:43:36: Google revocation PASS; local tokens cleared.
- 08:43:46: new login prepared.
- 08:44:00: login after revocation PASS; refresh token received.

The extra refreshes followed requested panel reopening/background checks, but the report does not explicitly attribute each timestamp to a manual action. Do not infer cold-start persistence or background execution. No calendar calls occurred in this version.

Not established: marker persistence, expiration boundary on-device, persistent credential storage, provider writes/ETags, cancellation recovery, or notifications. No Windows or Android results recorded here. Live OAuth succeeded with PKCE parameters; independent negative testing of Google's verifier enforcement remains separate.
