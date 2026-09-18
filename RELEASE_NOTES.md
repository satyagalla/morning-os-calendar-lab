Calendar Lab 0.3.3 removes stale DELETE from the combined ETag probe after live iOS testing returned 204 rather than the expected 412. PATCH-only testing verifies stale update rejection while preserving the notification event. Conditional DELETE remains unsafe/unverified; this release does not fix or claim to fix the transport/provider discrepancy. Explicit cancellation still deletes the disposable test event.

Resume: restore login; inspect/recover the previous event to record its cancellation; Start fresh event test; Create event and simulate lost reply; Recover event; Test stale update (PATCH ETags only); Show saved event timing; export. Observe notifications before explicit cancellation.

Validation: 49 mocked checks and browser build. Existing Worker, credentials and journals remain compatible. No service update needed. Production publishing remains blocked.
