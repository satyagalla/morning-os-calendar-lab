Current release: **0.4.0**. Use the single guided workflow in [Complete Test Run](Complete%20Test%20Run.md). Run once, observe alerts, restart once, resume and export persistent results. Historical per-button instructions below are superseded by this workflow.

# Dedicated calendar probes

**0.3.3 correction:** the ETag button now tests PATCH only and sends no DELETE. Live 0.3.2 stale DELETE returned 204, destroying the test event rather than rejecting the stale ETag. PATCH passed in that run; conditional DELETE remains blocked for production until transport/provider behavior is isolated. For the cancelled 0.3.2 event: restore login, Recover event to record its fence, Start fresh event test, then create/recover a new notification event. Do not run the older destructive ETag button. Earlier DELETE expectations below describe the original test, not a validated result.

For an existing cancelled test in 0.3.2+: restore login, select **Start fresh event test**, then resume step 4 below. This checks the old event's absence/cancelled state and retains its cancellation record before allocating a new identity. An active event or unsuccessful provider read blocks preparation; complete cancellation recovery first. No new calendar is created. Do not cancel the fresh event before testing ETags and observing its alert.

Use only the Calendar Lab plugin and a Google test account. Enable the Google Calendar API in the same Google Cloud project before testing. The existing Worker and `calendar.app.created` scope are reused; no broader scope or Worker deployment is needed. Each button performs explicit foreground work; there are no background schedules.

## Test order

1. Update/reload Calendar Lab through BRAT. Configure the existing service and sign in. Test token refresh.
2. Select **Create dedicated test calendar** once. It creates `Morning OS Calendar Lab <random suffix>`. The plugin saves its calendar ID and random ownership marker in vault-local Obsidian app storage. It does not accept a primary or ordinary calendar.
3. In your calendar client, enable this new Google calendar and enable notifications. Apple Calendar must have the Google account configured and this calendar visible. Record the client and OS version. Google Calendar API writes do not establish native Apple/iCloud provider support.
4. Choose **Create event and simulate lost reply**. This sends the real insert and deliberately ignores the response. Then choose **Recover event or pending cancellation**. Expect the original owned event to be found. Inspect the calendar for exactly one event. This simulates losing an insert reply, not an actual network failure. Alternatively use **Create notification event**, but only one event is permitted for this lab journal.
5. Select **Test stale update and delete (ETags)**. The probe reads version A, updates to B using A's ETag, tries an update and delete using stale A, then verifies B survives. Expect both stale requests to return 412. This exercises two logical clients sequentially on one device, not two physical devices or distributed ordering.
6. The event starts ten minutes after step 4 and requests a popup one minute before. Inspect its actual start/alert in the calendar client, export results, close Obsidian and wait for the alert. Record whether it appeared, the client, displayed time, OS version, notification permission and Focus state. API acceptance is not notification delivery. Opening the calendar before waiting may be needed for account synchronization; record this too.
7. After observing the alert, select **Save cancellation intent without sending**. Export results, fully terminate Obsidian, restart and restore/reestablish login. Select **Recover event or pending cancellation**. Expect conditional deletion or already-absent confirmation. This tests a restart between persisted intent and sending the cancellation, not loss during the actual DELETE.
8. Select **Recover event or pending cancellation** again. Expect already absent/cancelled. Select **Create notification event**: it must report creation blocked by cancellation intent. Inspect the calendar to confirm the event is absent. A second device with a stale journal has not been tested or made safe by these passes.
9. Export the final report. Manually record any OS alert remaining after cancellation; notifications already delivered may remain in notification history. To test suppression before an alert, a separate clean test vault/journal and another dedicated calendar are needed. Do not erase the current journal while a request is in flight.

## Recovery and boundaries

- Calendar insert has no caller-controlled ID. An uncertain creation is never automatically retried. If its reply is lost, find the matching lab calendar in Google Calendar settings and copy its Calendar ID into **Recover uncertain calendar creation**. Recovery checks the exact saved description marker. Do not paste IDs or account details into shared reports. If no calendar exists, keep the blocked journal for inspection rather than resetting it blindly.
- Event identity and original timestamps are saved before inserting. Recovery of an unobserved insert retries only that ID and payload after a 404; 409 triggers another GET. This remains a feasibility probe: Google's distributed collision caveats and cancellation by a different client during an unobserved insert are unresolved. Do not use it for production tasks.
- Once an event has been observed, a later 404 blocks recreation. A cancelled tombstone or explicit cancellation intent also blocks recreation. No new identity is allocated on retry.
- Cancellation records intent before network access and rereads the latest owned event before a conditional DELETE. A 412 leaves intent intact for another explicit recovery attempt. No blind automatic retry loops or rate-limit retries run. 401 requires login/refresh; 403 may mean API disabled, account permissions or scope; provider bodies are omitted from reports.
- Random ownership markers limit accidental writes; they are not an authorization boundary against another plugin or someone editing the local journal. Adding guests or recurrence makes the event ineligible for destructive probes. Do not edit the lab calendar description.
- The journal is non-secret metadata in Obsidian's vault-local app storage, outside ordinary vault files. Device backups/app migration and cross-device isolation still require observation. It is not a shared cancellation ledger and does not solve offline multi-device ordering.
- Reports stay in memory until exported. No task content, OAuth tokens, lab keys, calendar IDs or provider error bodies are exported by the plugin.
- Cleanup: cancel the event and verify absence, revoke the Google app grant when finished, then manually delete only the dedicated lab calendar in Google Calendar. The lab does not delete entire calendars. Preserve the journal/results for analysis; use a disposable vault for another independent run.

## References

- [Google conditional resource modifications](https://developers.google.com/workspace/calendar/api/guides/version-resources)
- [Event insertion and caller-controlled IDs](https://developers.google.com/workspace/calendar/api/v3/reference/events/insert)
- [Calendar insertion](https://developers.google.com/workspace/calendar/api/v3/reference/calendars/insert)
- [Conditional event deletion](https://developers.google.com/workspace/calendar/api/v3/reference/events/delete)
