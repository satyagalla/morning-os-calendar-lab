# Morning OS calendar test workspace

Status: selected iPhone primitive checks passed (see [[Observed iPhone results]]); live OAuth and calendar checks remain pending.

This folder contains test notes only. When copied into the existing OS vault it is not a disposable vault or a security boundary. Calendar Lab runs separately from Morning OS; it does not publish reminders or modify tasks. Keep existing result notes when updating this kit.

## Start here

1. Open [[Device Results]] and record the Windows and iPhone Obsidian versions.
2. Run the steps in [[Sync Probe]] to verify this folder reaches the phone through the existing Remotely Save configuration.
3. Run the native note-navigation checks in [[Device Checks]]. These work without a calendar plugin.
4. Follow the repository's `service/SETUP.md` to deploy/configure the authentication service and test version 0.2.0. No calendar needs to be created for authentication tests.
5. Defer [[Calendar Scenarios]] until authentication is validated. The proposed app-created-calendar scope requires an app-created test calendar in a later publishing probe; a manually created calendar is not equivalent.

Keep authorization URLs, codes, tokens, client secrets, and personal calendar data out of these notes. Each device will need its own authorization; do not sync credentials.

## Test stages

- Stage 1: folder sync and native Obsidian note navigation — ready for manual testing.
- Stage 2: selected iPhone primitive checks passed; other platforms, timeout and marker persistence remain pending.
- Stage 3: registered Google OAuth client, callback/token service, and credential lifecycle — pending configuration and device testing.
- Stage 4: conditional calendar writes, cancellation recovery, and notifications — pending stages 2 and 3.

Passing stage 1 does not establish OAuth support on this device. Keep production publishing paused until the remaining gates pass.

Repository research: `research.md` in the Calendar Lab repository (a snapshot of the earlier Morning OS investigation).
