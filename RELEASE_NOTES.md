Calendar Lab 0.4.2 adds bounded recovery for HTTP 412 while cancelling the previous test event, the failure observed on iOS in 0.4.1. Batch cleanup and restart recovery now use the same cancellation path: persist intent, read the event, validate ownership and shape, delete with that revision's If-Match, and verify absence. A 412 triggers a new read and ownership check, up to three DELETE attempts. Persistent conflicts stop the batch and retain the identity and cancellation intent. No unconditional delete is used.

Calendar GET requests now request cache revalidation. This does not establish whether caching caused the observed failure. Earlier stale DELETE results and multi-device ordering limitations remain unresolved. Worker 0.4.0 remains compatible; no service update is needed.

Update through BRAT, reload the plugin, then Run complete test batch. The batch will retry cancellation of the retained old identity before creating the notification event. If it stops, share the automatically exported report.

Validation: 62 mocked checks and browser build, including changed revision, persistent conflict, ownership change and batch continuation cases. Live device recovery remains to be confirmed.
