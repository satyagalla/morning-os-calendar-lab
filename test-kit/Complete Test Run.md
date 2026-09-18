# Complete test run — 0.4.0

Update through BRAT, open **Morning OS Calendar Lab: Open device test panel**.
Use the new **Complete test run** section at the top. Existing saved login is restored by Run automatically. Otherwise log in first using the existing authentication controls.

1. Tap **Run complete test batch** once. It reuses the dedicated calendar and explicitly cleans up any previous attempted lab event. No task content or other calendars are accessed.
2. Automated checks cover crypto, HTTP, token refresh, PATCH/DELETE synthetic header arrival, lost insert response recovery, duplicate-ID rejection, fresh/stale PATCH, sacrificial stale DELETE, deletion/absence recovery, and rescheduling a separate notification event. Provider failures stop the dependent sequence and retain the journal. A stale DELETE returning 204 is reported as FAIL but cannot delete the final notification event.
3. Observe the updated notification on iPhone and PC in approximately two minutes. Record that checkpoint. Wait until the superseded alert time printed in the report (approximately nine minutes after creation); verify it does not fire, then record its checkpoint. Do not cancel before these observations.
4. Tap **Save cancellation checkpoint (after observing alerts)**. Fully close and reopen Obsidian once.
5. Open the panel and tap **Resume batch after restart and export**. It restores credentials, resumes cancellation and checks provider absence. Earlier results persist and appear in the exported report. Confirm the event disappears in both clients.

The header diagnostic sends only a fixed synthetic If-Match value to the lab Worker. It sends no Google token or lab access key. A DELETE echo PASS plus Google DELETE failure narrows the investigation but does not prove Google received the header. No general calendar proxy is added.

## Remaining integration checkpoints in the same report

These are explicitly pending unless actually observed. Do not mark them PASS based on the sequential conflict tests above.

| Checkpoint | Actual acceptance procedure / prerequisite |
| --- | --- |
| Two-device ordering and offline cancellation resurrection | Requires a shared ordering implementation, which this device-local lab does not contain. Test A writes revision 1, B writes revision 2, A submits revision 1; revision 2 must survive. Cancel on B while A is offline; reconnect A and confirm no resurrection. Currently blocked pending adapter design. |
| Real connection loss / app termination | Disconnect or terminate during an explicit insert/update/delete, then restore and recover. Inspect the original ID and calendar for duplicates. The batch's discarded reply is a simulation, not this test. In-flight reschedule has no durable update journal yet; production acceptance is blocked on that implementation. |
| Rate limits and temporary failures | Controlled 429/5xx with Retry-After require an injectable transport and retry implementation. Do not deliberately exhaust Google quotas. Existing local tests cover rejected/expired authorization and retained uncertain writes, but no live retry policy is implemented. |
| Time transitions | With a future adapter/test clock, test an event crossing midnight, timezone change without shifting the intended instant, spring-forward nonexistent local times, and fall-back ambiguous local times. This lab schedules absolute instants and does not establish task-time interpretation. |

This release packages all checks and blockers into one workflow; it does not claim unimplemented synchronization or retry behavior has passed. No further plugin update is needed just to export results or record these checkpoints. Revocation is kept as a separate explicit action because it affects other devices using the same Google OAuth client.
