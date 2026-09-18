# Morning OS Calendar Lab

Latest beta: **0.3.2** adds **Start fresh event test**. After cancellation is fenced locally and the old event is absent/cancelled at the provider, it archives that event's identity, timing and cancellation record and prepares a new identity in the same calendar. This action makes no provider writes; choose an event creation button afterwards. Existing login and journals remain compatible.

Latest beta: **0.3.1**. Adds **Show saved event timing** and **Inspect saved event (read only)** for existing journals. A 0.3.0 cancellation message could mean either HTTP 410 Gone or an explicitly cancelled event; use inspection to distinguish them. Existing saved login remains compatible; no Worker update is needed.

An independent Obsidian plugin for testing the desktop/iPhone/Android capabilities needed by a future Morning OS calendar integration. Plugin ID: `morning-os-calendar-lab`. Minimum Obsidian version: 1.11.4 (SecretStorage). This lab-only change was approved by the user; Morning OS is unchanged.

Version 0.3.0 adds opt-in saved login and explicit dedicated-calendar probes: insertion, simulated lost-reply recovery, stale PATCH/DELETE rejection, notification setup and durable local cancellation intent. It does not read Morning OS tasks. Follow [service setup](service/SETUP.md), [restart tests](test-kit/Credential%20Persistence.md), then [calendar tests](test-kit/Calendar%20Writes.md).

No Worker update or broader scope is needed. The service still reports 0.2.0. Login saving and restoring are explicit. SecretStorage is vault-local app storage accessible to other plugins, not an isolated OS keychain. Access tokens and pending consent stay in memory. No credentials are written to plugin data.json or test notes.

## Install with BRAT

1. In the target mobile vault, open Settings → Community plugins → Browse, install **BRAT**, and enable it.
2. For a private repository, configure a GitHub token in BRAT with read-only access to this repository's contents. Enter it only in BRAT, never in test notes or chat. Follow [BRAT's private-repository guide](https://tfthacker.com/brat-private-repo).
3. Run **BRAT: Add a beta plugin for testing** from the command palette.
4. Enter `satyagalla/morning-os-calendar-lab`. Install version `0.3.0` (or use BRAT's frozen-version command to pin that tag).
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

- Persistent login after restart (live iPhone login, refresh and revocation passed in 0.2.0; see [observed results](test-kit/Observed%20iPhone%20results.md)).
- SecretStorage device isolation, backup behavior and production storage choice.
- Actual provider conditional headers, ETags, rate limits, and concurrent creation.
- Durable ordering, cancellation fences, stale-device recovery, and overdue changes.
- Apple Calendar and Windows notification delivery with Obsidian closed.

The browser link opens a public configuration document. Synthetic callbacks test `obsidian://` handoff, **not** an HTTPS callback bridge or Google's acceptance of an OAuth redirect. The included service must be deployed and configured before real login. Local tests mock Google; live OAuth results are recorded separately from untested calendar behavior.

See [research.md](research.md) for the existing source review and acceptance gates. No third-party source snapshots, tokens, or Morning OS vault content are included in this repository.

## Build and validate

Use Node.js 22 or newer:

```sh
npm ci
npm test
npm run test:worker
npm run build
npm run service:check
```

Builds target browser/ES2020 and allow only `obsidian` as an external runtime import. Node is used only by development tools. Tests cover callback rejection/replay, auth lifecycle and the local Workers/SQLite runtime with mocked Google; they do not prove live OAuth or mobile behavior.

## Release for BRAT

Keep `package.json` and `manifest.json` versions aligned. Build and test, commit the source, and then publish a GitHub release with a matching version tag and these assets:

```sh
gh release create 0.3.0 main.js manifest.json versions.json --repo satyagalla/morning-os-calendar-lab --title 0.3.0 --prerelease --notes-file RELEASE_NOTES.md
```

The version above is the current release; use a new matching version for subsequent releases. Keep updates manual or pin the test version while recording results. There is no stylesheet in this release.

To remove: cancel the event, revoke the Google grant, select **Forget local login and service key**, and clear the marker before uninstalling Calendar Lab and removing it from BRAT. Manually delete only its dedicated calendar when finished. Morning OS is a separate plugin and remains installed.
