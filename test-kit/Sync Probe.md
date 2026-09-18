# Calendar test sync probe

Synthetic content; this note does not schedule an alert.

Probe ID: morning-os-calendar-probe-001

Desktop marker: ready-for-phone

Phone marker: pending

## Procedure

1. Run the existing Remotely Save sync on Windows.
2. Open the OS vault on the iPhone and run Remotely Save there.
3. Confirm this note appears under `Tests/Morning OS Calendar` with the desktop marker above.
4. On the phone, change only `Phone marker` to `seen-on-iphone` and sync.
5. Sync Windows and confirm the phone marker returns.
6. Record results and approximate delays in [[Device Results]]. Avoid editing this note simultaneously on both devices.

If the folder is absent, inspect Remotely Save include/exclude rules before changing them. The folder is eligible for normal Markdown sync, but its actual inclusion has not been verified. Do not enable syncing `.obsidian` or credentials for this test.
