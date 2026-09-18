Calendar Lab 0.4.1 fixes diagnostic reporting for batches that stop before creating the notification event. Reports now identify the batch phase, request method, endpoint category, HTTP status (if received), and a bounded local validation failure. Raw provider responses, exception messages, URLs and credentials are omitted. Failed batches automatically export the report.

Unattempted journals now receive a fresh identity and current schedule at batch start. Existing attempted identities still go through cancellation and absence verification before replacement. Non-JSON calendar responses retain their HTTP status for diagnosis. OAuth service deployment is unchanged; Worker 0.4.0 remains compatible.

Update through BRAT, then Run complete test batch. If it stops, share the automatically exported report. The underlying live 0.4.0 failure remains undiagnosed until the new phase/status report is available; this release does not claim a calendar-provider fix.

Validation: 58 mocked checks and browser build.
