Calendar Lab 0.4.3 adds an alternate conditional cancellation probe after three DELETE conflicts. It re-reads and revalidates the owned event, then PATCHes status to cancelled with the latest If-Match. It requires HTTP 200 with the expected cancelled identity and a separate GET confirming cancellation or absence. Uncertain replies retain the journal for recovery. No unconditional request is used.

This probes Google's writable cancelled status using PATCH semantics and the existing calendar.app.created scope. It does not explain or mark the persistent DELETE 412 or earlier stale DELETE 204 as resolved. Live PATCH cancellation remains untested. No Worker deployment or new login is needed.

Update with BRAT, reload, and Run complete test batch. Share the automatically exported report if it stops. Validation: 65 mocked checks and browser build, including PATCH fallback, lost response recovery and incorrect identity rejection.
