Calendar Lab 0.3.0: credential restart and dedicated-calendar probes. Requires Obsidian 1.11.4+ for SecretStorage; Morning OS is unchanged.

- Opt-in Save login and manual Restore after restart. Rotation is saved; Forget and confirmed revocation clear saved credentials. SecretStorage is vault-local app storage accessible to other plugins, not an isolated OS keychain.
- One owned test calendar/event; simulated lost-reply recovery at a stable event ID; stale PATCH/DELETE tests; persistent local cancellation intent and restart recovery.
- Uncertain calendar creation blocks blind retries and supports ownership-checked manual recovery.
- Existing Worker 0.2.0 and OAuth scope are reused. Enable Google Calendar API in the project before calendar tests. No Morning OS task content is accessed.
- Follow test-kit/Credential Persistence.md, then test-kit/Calendar Writes.md. Export results before terminating Obsidian.

Validation: 44 focused checks and TypeScript/browser build passed. Tests mock Google and credential storage. Live iPhone OAuth passed in 0.2.0; persistence, calendar behavior and notification delivery await device results. Distributed ordering and production publishing remain unimplemented.

Update through BRAT, then run Morning OS Calendar Lab: Open device test panel. Revocation can affect other test devices using the same Google account and OAuth client.
