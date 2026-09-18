# Device checks

## Native navigation — ready now

Run on Windows and iPhone separately:

1. Open this note after syncing the folder.
2. Follow [open the sync probe in the OS vault](obsidian://open?vault=OS&file=Tests%2FMorning%20OS%20Calendar%2FSync%20Probe.md).
3. Confirm Obsidian opens the expected note in the intended vault.
4. If the phone vault has a different name, make a phone-specific copy of the link using that name and record the difference. The `vault` parameter is a local vault name.
5. To check browser-to-app handoff, paste that same synthetic URI into Safari or the desktop browser address bar and explicitly open it. Record prompts, rejection, or routing to the wrong vault.

This tests Obsidian's built-in `open` action only. It does not test a plugin callback handler, an HTTPS redirect, Google consent, or OAuth state validation.

## Plugin primitive probe — install Calendar Lab, then follow its README

- Cryptographically random state and SHA-256 available on both devices.
- Browser launch comes from a user action and opens externally.
- Matching synthetic callback accepted exactly once by the initiating session.
- Missing, incorrect, expired, and replayed state rejected.
- Callback routed to the intended vault with two vaults available.
- App backgrounding, termination, restart, and unloading fail safely or request a fresh login.
- Native `requestUrl` preserves conditional headers and returns error statuses.

Record sanitized outcomes only in [[Device Results]].
