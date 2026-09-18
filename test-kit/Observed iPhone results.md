# Observed iPhone results

## Live stale DELETE failure: 0.3.2

User report September 18, 2026: restore PASS at 09:22:44; fresh event preparation PASS at 09:22:53 with one old cancellation record retained; simulated lost insert reply at 09:23:03; recovery PASS at 09:23:12. At 09:23:21 stale DELETE returned HTTP 204 rather than 412. The probe reached DELETE only after fresh PATCH succeeded, its ETag changed, and stale PATCH returned 412. Thus PATCH preconditions worked in this run, but the DELETE request path did not reject the stale version. Header transmission versus provider behavior is not yet isolated. The DELETE likely explains the earlier cancelled test event, but that earlier cause remains unconfirmed. Notification delivery is not established. 0.3.3 removes destructive DELETE from the ETag/notification probe; production conditional deletion remains blocked.

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

## Credential persistence: version 0.3.0

User reported saving credentials at 09:05:55 and a successful restart/restore. Exported reports show refresh and credential restore PASS at 09:09:19 and 09:11:02 without browser login. This establishes the reported iPhone restart workflow, not cross-device isolation or encryption at rest.

At 09:11:05 the calendar journal already existed; at 09:11:10 event creation had already been attempted. Recovery at 09:11:12 reported provider cancellation, followed by a generic failure at 09:11:19. Version 0.3.0 used that cancellation message for both HTTP 410 Gone and an explicit cancelled event response, so the precise provider result and cause remain unknown. The previous supplied report contains only credential restoration, with no calendar creation timestamp. ETags and notifications have not passed. Version 0.3.1 adds timing and read-only provider diagnostics.

Version 0.3.1 report at 09:17:48 confirms HTTP 200 with cancelled status for the saved event. Its local journal recorded prior active observation and a recreation fence. Calendar name: Morning OS Calendar Lab a338975f; saved start/end 09:20:06–09:25:06 on September 18, 2026, offset -04:00; requested alert 09:19:06. Cancellation cause remains unknown. Credential restore/refresh again passed at 09:17:05. This establishes neither ETag rejection nor notification delivery.
