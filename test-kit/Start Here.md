# Morning OS calendar test workspace

Status: prepared; device and live-calendar checks have not run.

This folder contains synthetic test notes only. It is inside the existing OS vault, not a disposable vault or a security boundary. Nothing here publishes reminders or modifies Morning OS tasks. No test plugin has been installed.

## Start here

1. Open [[Device Results]] and record the Windows and iPhone Obsidian versions.
2. Run the steps in [[Sync Probe]] to verify this folder reaches the phone through the existing Remotely Save configuration.
3. Run the native note-navigation checks in [[Device Checks]]. These work without a calendar plugin.
4. Create an empty Google calendar named `Morning OS Calendar Test`, or identify an existing dedicated test calendar. Record only its display name in the results. Do not use your primary calendar.
5. Once the device results are available, prepare an isolated authentication probe before attempting [[Calendar Scenarios]]. The current Morning OS calendar spike cannot start Google login.

Keep authorization URLs, codes, tokens, client secrets, and personal calendar data out of these notes. Each device will need its own authorization; do not sync credentials.

## Test stages

- Stage 1: folder sync and native Obsidian note navigation — ready for manual testing.
- Stage 2: install Calendar Lab using the repository README, then run its device panel for Web Crypto, external browser, synthetic callbacks, and native HTTP. Device validation is pending.
- Stage 3: registered Google OAuth client, callback/token service, and credential lifecycle — pending configuration and device testing.
- Stage 4: conditional calendar writes, cancellation recovery, and notifications — pending stages 2 and 3.

Passing stage 1 does not establish OAuth support on this device. Keep production publishing paused until the remaining gates pass.

Repository research: `research.md` in the Calendar Lab repository (a snapshot of the earlier Morning OS investigation).
