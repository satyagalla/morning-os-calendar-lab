# Observed iPhone results

User-reported results on 2026-09-18. Plugin 0.1.0, Obsidian 1.12.7, iOS, America/New_York. OS version not supplied. These are manual reports, not independently observed automation.

- Web Crypto random generation and SHA-256 known vector: PASS.
- Native unauthenticated public Google HTTP: PASS, status 200.
- Wrong-state synthetic callback: rejected.
- Valid callback: accepted; repeated callback: no-session.
- New synthetic session: accepted.
- User confirmed Safari returned to the correct vault.
- After cold restart: no-session, expected for in-memory sessions.

Not established: marker persistence, expiration boundary on-device, actual Google login/refresh/revocation, persistent credential storage, provider writes/ETags, cancellation recovery, or notifications. No Windows or Android results recorded here.
