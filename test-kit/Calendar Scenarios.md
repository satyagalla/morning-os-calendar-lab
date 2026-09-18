# Calendar scenarios — pending executable harness

Use only the dedicated `Morning OS Calendar Test` calendar. These are specifications, not runnable note commands. Do not create real Morning OS tasks to simulate them yet.

Choose future times during the actual test session, with an explicit timezone. Use synthetic titles prefixed `MOS TEST` and record expected versus actual behavior.

| Scenario | Expected outcome |
| --- | --- |
| Create one reminder | One owned event; requested timezone and alert preserved |
| Update with matching ETag | Same event changes; no duplicate |
| Update with stale ETag | Provider returns 412; no blind overwrite |
| Lose create response, then retry | Existing owned event recovered or explicit conflict |
| Both devices create same reminder | One active event or explicit recoverable conflict |
| Offline A to B to C edits | Defined causal reconciliation; no silent loss |
| Clear before first publication | Old device cannot create the cleared alert |
| Clear after publication, then reconnect stale device | Alert remains cleared |
| Delete remote event or lose local metadata | No blind resurrection |
| Replacement becomes overdue before sync | Old active schedule is explicitly resolved |
| Revoke access or disconnect during refresh | Publishing pauses; late response cannot reconnect |
| Close Obsidian after confirmed publication | Calendar clients still deliver the scheduled alert |
| Dismiss or snooze calendar notification | Morning OS task status remains unchanged |
| DST boundary and timezone change | Agreed time semantics hold on both devices |

The current cancellation spike retains a transparent, non-alerting fence event. Check that alert behavior and visible calendar clutter are acceptable; do not assume cancellation deletes the event.

Measure publication and cancellation latency. An offline phone may retain a previously synced alert until its calendar updates.

After testing, remove only identified synthetic events from the dedicated calendar. Do not bulk-delete other calendar content or task-registry data.
