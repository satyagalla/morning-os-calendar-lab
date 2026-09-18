# Morning OS Calendar Lab

An independent Obsidian plugin for testing the desktop/iPhone/Android capabilities needed by a future Morning OS calendar integration. Plugin ID: `morning-os-calendar-lab`. Minimum Obsidian version: 1.8.7.

Version 0.1.0 is a **device primitive probe**, not a calendar publisher. It does not read Morning OS state, access calendar events, accept credentials, or start Google OAuth. It can run alongside Morning OS.

## Install with BRAT

1. In the target mobile vault, open Settings → Community plugins → Browse, install **BRAT**, and enable it.
2. For a private repository, configure a GitHub token in BRAT with read-only access to this repository's contents. Enter it only in BRAT, never in test notes or chat. Follow [BRAT's private-repository guide](https://tfthacker.com/brat-private-repo).
3. Run **BRAT: Add a beta plugin for testing** from the command palette.
4. Enter `satyagalla/morning-os-calendar-lab`. Install version `0.1.0` (or use BRAT's frozen-version command to pin that tag).
5. Enable **Morning OS Calendar Lab** in Community plugins.
6. Run **Morning OS Calendar Lab: Open device test panel**.

BRAT installs directly into the hidden plugin folder. A community-directory submission is not required. Source alone is not sufficient: BRAT consumes the compiled `main.js` and `manifest.json` release assets.

## Run the first device tests

1. Select **Test Web Crypto**. Expect random generation and a known SHA-256 vector to pass.
2. Select **Test native HTTP**. This explicitly sends one unauthenticated GET to Google's public identity configuration. Expect status 200 and the expected issuer. No vault data or credentials are sent; normal network metadata reaches Google.
3. Open the public configuration link. Record whether it opens the external browser or an internal viewer; the plugin cannot assert that automatically.
4. Write the non-secret restart marker, export current results, fully restart Obsidian, reopen the panel, and check the marker. Check the other device before writing its marker to investigate device isolation. This is not secure credential storage validation.
5. Start a synthetic callback session. Try the wrong-state URI first, then the valid URI, then repeat the valid URI. Expected outcomes: `wrong-state`, `accepted`, `no-session`.
6. Start again and wait at least two minutes before opening the valid URI. Expect `expired`.
7. Start again, copy the valid URI, fully terminate Obsidian, and open the URI through the browser. Expect `no-session` after cold start. Backgrounding without termination can still accept within two minutes.
8. Try the URIs in the external browser as well as in-app. Test with two vaults available. Record the vault that opens. The URI carries the local vault name; names need not match between devices. State is random and held only in the initiating plugin instance. A same-name multi-vault setup still needs manual routing checks.
9. Select **Export sanitized results**. Each export creates a new note under `Tests/Morning OS Calendar/`; existing notes are never overwritten. Fill in OS version and manual observations. Sync the results through your existing Markdown sync setup.
10. Clear the restart marker after testing.

Results are in memory until exported. Closing the panel preserves them; unloading/restarting the plugin clears them. Callback links contain synthetic random state, not credentials; they are intentionally omitted from reports. Do not substitute real authorization codes or tokens.

Test sheets are in [test-kit](test-kit/). Copy them into the vault test folder only if needed; do not overwrite existing results. Background/cold-start testing requires manually opening the panel again after returning to Obsidian.

## What remains unproven

- Registered HTTPS OAuth redirect, consent scopes, token exchange and refresh.
- Secret storage choice and minimum-version decision.
- Actual provider conditional headers, ETags, rate limits, and concurrent creation.
- Durable ordering, cancellation fences, stale-device recovery, and overdue changes.
- Apple Calendar and Windows notification delivery with Obsidian closed.

The browser link opens a public configuration document. Synthetic callbacks test `obsidian://` handoff, **not** an HTTPS callback bridge or Google's acceptance of an OAuth redirect. No hosted token service is included. Those require a selected client registration and architecture before implementation.

See [research.md](research.md) for the existing source review and acceptance gates. No third-party source snapshots, tokens, or Morning OS vault content are included in this repository.

## Build and validate

Use Node.js 22 or newer:

```sh
npm ci
npm test
npm run build
```

Builds target browser/ES2020 and allow only `obsidian` as an external runtime import. Node is used only by development tools. The tests exercise callback-session rejection and replay semantics locally; passing tests do not prove native mobile behavior.

## Release for BRAT

Keep `package.json` and `manifest.json` versions aligned. Build and test, commit the source, and then publish a GitHub release with a matching version tag and these assets:

```sh
gh release create 0.1.0 main.js manifest.json --repo satyagalla/morning-os-calendar-lab --title 0.1.0 --prerelease --notes-file RELEASE_NOTES.md
```

The version above is the initial release; use a new matching version for subsequent releases. Keep updates manual or pin the test version while recording results. There is no stylesheet in this release.

To remove: remove the repository from BRAT's update list, uninstall Calendar Lab in Community plugins, and remove test notes if no longer needed. Clear the marker before uninstalling. Morning OS is a separate plugin and remains installed.
