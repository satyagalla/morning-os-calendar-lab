# Calendar OAuth and plugin feasibility research

Snapshot from the Morning OS repository, before Calendar Lab was built. References to source paths, test counts, and gitignored artifacts below describe that repository. Calendar Lab now provides the primitive probe described in its README; actual OAuth/provider testing remains pending. Third-party source snapshots and the Morning OS adapter spike are not bundled here.

Research date: 2026-09-18. Scope: public documentation, pinned plugin source review, and local tests. No production code, account connection, deployment, credential access, or remote calendar mutation in this research pass.

## Decision and confidence

Obsidian supplies the primitives for an OAuth-capable calendar plugin on desktop and mobile. Existing implementations demonstrate an HTTPS callback page returning to an Obsidian protocol handler, followed by token exchange and Calendar API calls. Obsidian does not supply a complete Google OAuth client or register an OAuth application on our behalf.

**Source feasibility: supported. Local spike checks: passed. Actual Morning OS mobile login and calendar delivery: pending.** We should proceed only with isolated authentication/device experiments until the remaining gates below pass. This report does not approve production wiring or claim all tests are complete.

The best-supported candidate is an external-browser authorization flow using our own registered HTTPS callback and a narrowly scoped token service. Calendar requests can remain direct from the plugin. A service for authentication is not a hosted reminder scheduler, but it is still infrastructure we must own or explicitly trust. Free hosting availability and provider verification are not established by this report.

## Obsidian capability matrix

| Need | Evidence | Implication |
| --- | --- | --- |
| Receive browser return | Public `Plugin.registerObsidianProtocolHandler`, tagged since 0.11.0 in installed declarations | Receive `obsidian://morning-os-calendar-auth?...`. This does not make that URI an accepted Google redirect. |
| Send authenticated API requests | Public `requestUrl` accepts method, headers, body, and `throw: false`; returns status, headers, text | Can submit bearer tokens and `If-Match`, and inspect 401/409/412/429. Native behavior on our iPhone remains untested. |
| Avoid browser CORS restrictions | `requestUrl` explicitly documents this capability | No calendar-data proxy is required solely to bypass CORS. |
| Launch authorization | Existing plugins use browser links/window opening on mobile; desktop examples use Electron external-browser handling | Must test Safari popup restrictions and Obsidian Web Viewer interception. Existing Electron/Node code cannot be copied into our Node-free runtime. |
| PKCE and random state | Browser Web Crypto, used by existing plugins | Use `crypto.getRandomValues` and SHA-256. Availability after app resume must be tested on device. |
| Device-local state at current minimum | `App.loadLocalStorage` / `saveLocalStorage`, since 1.8.7 | Available under our manifest, but not an encrypted credential vault or a per-plugin access boundary. Namespace our keys. |
| Dedicated secret API | `App.secretStorage` / `SecretStorage`, since 1.11.4 | Current Morning OS minimum is 1.8.7. Adoption requires an explicit minimum-version decision; no version bump was made. |
| Native background service / iOS EventKit | No suitable public API identified in reviewed plugin declarations | Do not promise publishing while Obsidian is suspended, or direct native Apple Calendar access. |
| Durable distributed task ordering | Not supplied by OAuth or Obsidian's HTTP API | Must be proven in Morning OS state/reconciliation separately. |

Sources: [official API declarations](https://github.com/obsidianmd/obsidian-api/blob/master/obsidian.d.ts), [requestUrl reference](https://docs.obsidian.md/Reference/TypeScript%20API/requestUrl), [mobile development](https://docs.obsidian.md/Plugins/Getting%20started/Mobile%20development), [secret storage guide](https://docs.obsidian.md/plugins/guides/secret-storage).

SecretStorage removes secrets from plugin `data.json`, but official documentation describes vault-keyed local storage and sharing among plugins. We have not established an OS-keychain encryption guarantee. Do not repeat third-party claims that it necessarily uses Keychain. Test persistence and device isolation, and authorize each device separately rather than transporting tokens through Remotely Save.

## Existing implementations examined

Source snapshots were downloaded without executing their code or installing dependencies. Branch heads were resolved once and the files fetched at these commits:

| Project | Examined commit | What it establishes |
| --- | --- | --- |
| Full Calendar Remastered | `4942a4e20240490a3f6da8e414fe483afe5e002a` | Mobile HTTPS callback, Obsidian protocol return, PKCE, proxy token exchange/refresh, direct Calendar requests |
| YukiGasai Google Calendar | `015fc5c0826b8c7514aadd47d74799e07a1c5636` | Another mobile HTTPS-to-Obsidian callback and Google event CRUD API |
| TaskNotes | `9f59d23195369c1cfe9b7e009b0c7c1d1c3295e8` | Desktop PKCE/loopback, secret-store abstraction, refresh coordination, incremental event fetching |

### Full Calendar Remastered

Its [auth implementation](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/4942a4e20240490a3f6da8e414fe483afe5e002a/src/providers/google/auth/auth.ts) selects a GitHub Pages HTTPS callback on mobile and a loopback callback on desktop. The default flow exchanges a code through `gcal-proxy-server.vercel.app`; custom credentials use Google's token endpoint. Its [refresh manager](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/4942a4e20240490a3f6da8e414fe483afe5e002a/src/providers/google/auth/GoogleAuthManager.ts) similarly distinguishes proxy and direct refresh.

The [callback page](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/4942a4e20240490a3f6da8e414fe483afe5e002a/docs/assets/meta/google-auth-callback.html) forwards code and state to `obsidian://full-calendar-google-auth`; [main.ts](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/4942a4e20240490a3f6da8e414fe483afe5e002a/src/main.ts) registers that action. This directly answers whether a plugin can receive a mobile OAuth return.

Cautions from the inspected code: auth state/verifier are held in memory, so process termination during login needs handling; its random-string generator uses `Math.random`, which we should replace with cryptographic randomness in any independent implementation. The public callback has no explicit vault selector. We need wrong-vault tests and a session bound to the initiating vault/device. These observations are not a complete security audit.

Its [credential store](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/4942a4e20240490a3f6da8e414fe483afe5e002a/src/features/credentials/CredentialStore.ts) supports SecretStorage and legacy plaintext fallback. Its [troubleshooting guide](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/4942a4e20240490a3f6da8e414fe483afe5e002a/docs/user/guides/troubleshooting.md) still describes mobile failures and desktop-token transfer as a workaround. Source existence is not proof that every iPhone flow succeeds. We should not adopt plaintext vault-token transfer as our normal setup.

The [Google provider](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/4942a4e20240490a3f6da8e414fe483afe5e002a/src/providers/google/GoogleProvider.ts) converts its event model to Google JSON and performs POST/PUT/DELETE; the [request wrapper](https://github.com/obsidian-full-calendar-remastered/plugin-full-calendar/blob/4942a4e20240490a3f6da8e414fe483afe5e002a/src/providers/google/auth/request.ts) does not expose caller-supplied conditional headers. Its existing UI synchronization does not establish our required stale-device protocol.

Learn from this architecture, not by borrowing its client ID, proxy service, tokens, or private classes. Those are not an integration contract for Morning OS. FCR's reviewed license is GPLv3; no source was copied into production.

### YukiGasai Google Calendar

[GoogleAuth.ts](https://github.com/YukiGasai/obsidian-google-calendar/blob/015fc5c0826b8c7514aadd47d74799e07a1c5636/src/googleApi/GoogleAuth.ts) uses an HTTPS Vercel callback on mobile, generates PKCE, checks state, and exchanges the code. [The plugin handler](https://github.com/YukiGasai/obsidian-google-calendar/blob/015fc5c0826b8c7514aadd47d74799e07a1c5636/src/GoogleCalendarPlugin.ts) receives the `googleLogin` action. Desktop uses a local listener. This is independent precedent for the mobile callback arrangement.

Its [public API](https://github.com/YukiGasai/obsidian-google-calendar/blob/015fc5c0826b8c7514aadd47d74799e07a1c5636/src/api/GoogleCalendarPluginApi.ts) returns Google event objects and offers create/read/update/delete. The reviewed update/delete entry points have no expected-ETag/header argument. Create forwards event payloads, so this API is richer than a boolean-only wrapper, but it does not currently establish the full conditional-write contract we need. Replacing FCR with this plugin alone does not resolve the problem.

Custom-client paths keep the client secret in plugin configuration. Do not generalize that precedent into shipping a shared confidential web-client secret in Morning OS. This plugin's reviewed license is also GPLv3.

### TaskNotes

[OAuthService.ts](https://github.com/callumalpass/tasknotes/blob/9f59d23195369c1cfe9b7e009b0c7c1d1c3295e8/src/services/OAuthService.ts) explicitly rejects authentication outside the desktop app. It lazy-loads Node HTTP for loopback and opens the external browser on desktop. Therefore it is **not evidence of current mobile login**, despite `isDesktopOnly: false` in its manifest. This corrects the preliminary research update.

Useful patterns include registering the pending callback before opening the browser, rejecting overlapping login attempts, timeout/unload cleanup, a refresh mutex, and connection-generation checks against late results. [OAuthSecretStore.ts](https://github.com/callumalpass/tasknotes/blob/9f59d23195369c1cfe9b7e009b0c7c1d1c3295e8/src/services/OAuthSecretStore.ts) distinguishes missing/cleared/invalid records and verifies writes. [GoogleCalendarService.ts](https://github.com/callumalpass/tasknotes/blob/9f59d23195369c1cfe9b7e009b0c7c1d1c3295e8/src/services/GoogleCalendarService.ts) uses pagination, sync tokens, expired-token recovery, and bounded backoff. Its MIT license permits reuse subject to its terms, but its plugin-specific dependencies are substantial; no source was copied.

## How calendar plugins function

Calendar rendering, authentication, and synchronization are separate systems. A plugin authenticates, reads a provider's event list into a local cache, translates event models, renders a calendar, and sends user edits back through provider-specific calls. Refresh intervals or incremental sync update the cache while the plugin runs. Local note calendars and read-only ICS feeds may need no OAuth at all, but they do not automatically publish our task registry as writable Google reminders.

After an event reaches Google, the user's calendar clients synchronize it and handle notifications. FCR's calendar UI is not a background iPhone notification scheduler. Apple Calendar can consume Google events, so Apple Calendar display does not require a separate iCloud adapter. [Google's Apple Calendar instructions](https://support.google.com/calendar/answer/99358?co=GENIE.Platform%3DiOS&hl=en).

## Authentication choices and exclusions

1. **Candidate: HTTPS callback plus confidential token service.** Use an external browser, registered redirect, random state/session binding, a documented PKCE arrangement where supported, and a short-lived single-use return ticket. Keep shared web-client secrets server-side. Treat code exchange and refresh as separate endpoint requirements. The existing `oauth-token.ts` spike refreshes directly at Google; it will need a different injected token provider if we select a confidential web client serviced by a relay. An HTTPS landing page alone does not solve client-secret handling.
2. **Desktop loopback:** established in all three projects, but unavailable as a general mobile solution and conflicts with our current Node-free plugin-runtime rule. It is an alternative experiment, not the chosen production design.
3. **Direct Google redirect to `obsidian://`:** Obsidian can handle the URI, but that does not establish Google acceptance for a client registration. Use a registered HTTPS callback unless a supported alternative is proven.
4. **Device-code login:** ruled out for Google Calendar. Google's allowed device-flow scopes omit Calendar, and the flow is intended for limited-input devices. [Google documentation](https://developers.google.com/identity/protocols/oauth2/limited-input-device).
5. **Authentication-platform SDK:** may simplify hosting and sessions, but must actually provide Google Calendar authorization, offline refresh, and an Obsidian-compatible callback. Basic Google sign-in is not sufficient. No hosting platform or paid dependency selected.

Reference: [Google native-app OAuth](https://developers.google.com/identity/protocols/oauth2/native-app), [web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server), [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth). Evaluate the narrowest usable scope for a dedicated calendar rather than copying another plugin's broad scopes. For an external OAuth application in Testing, refresh tokens normally expire after seven days when Calendar access is requested; that is unsuitable as an unnoticed long-term setup. Public distribution and personal testing have different consent/verification requirements. [Token expiration](https://developers.google.com/identity/protocols/oauth2#expiration).

## Tests actually run

| Check | Result | What it proves |
| --- | --- | --- |
| `npm test` | 86 passed | Existing automated suite, including 13 calendar reconciliation and 6 token-refresh tests |
| `npx tsc --noEmit --skipLibCheck` | Passed | Current project TypeScript checks; no deployment or regenerated plugin bundle |
| `node dev/calendar-research/run-local-checks.mjs` | Passed | Three calendar modules bundle for browser/ES2020 with only Obsidian external; no required Node/Electron runtime imports |
| Same research script: real `obsidian-http.ts`, mocked native boundary | 8 scenarios passed | PATCH headers/body preserved; 200/204/401/412/429/503 and malformed JSON handled; offline rejection preserved |
| Installed API declarations vs manifest | Reviewed | Callback/HTTP primitives present; SecretStorage minimum-version mismatch identified |
| Real OAuth, real provider writes, real phone alerts | **Not run** | Requires selected test account/calendar and Windows/iPhone test environment |

The sandbox initially blocked esbuild subprocesses with EPERM; the permitted elevated rerun passed. Browser compilation and Node-based mock tests do not prove Web Crypto, requestUrl, protocol routing, storage, or notifications on iOS. No third-party plugin test suite was executed.

The current HTTP abstraction also discards response headers. If production retry behavior needs `Retry-After`, extend that contract and test it; do not infer complete rate-limit handling from the passing status tests. `requestUrl` exposes no AbortSignal in the reviewed declaration, so timing out locally must not imply the remote request was cancelled.

## Remaining experiments and acceptance record

Use a disposable vault, a dedicated Google test calendar, synthetic event titles, and independent authorization on each device. Record OS, Obsidian, plugin/commit, calendar-client versions, scope/client type, timestamp, expected result, actual result, and sanitized evidence. Do not record auth URLs, codes, tokens, or secrets.

| Experiment | Pass condition | State |
| --- | --- | --- |
| Obsidian primitive probe on Windows/iPhone | Browser opens externally; matching synthetic state returns to correct vault; wrong/missing/replayed state rejected; Web Crypto works | Pending |
| App lifecycle during login | Background/foreground, cold start, timeout, and two-vault routing either recover safely or request a fresh login without accepting an unrelated callback | Pending |
| Real Google login | Registered HTTPS callback accepted; consent includes actual calendar access; no web-client secret distributed in plugin | Pending |
| Token lifecycle and storage | Restart persistence; expiry refresh; revocation pauses; disconnect during refresh cannot restore credentials; secrets absent from synced vault files | Pending |
| Native HTTP conditional behavior | Create/read/update yields actual ID and ETag; intervening update causes real 412 with `If-Match`; permission errors remain distinguishable | Pending |
| Ambiguous creation and retries | Lost response and simultaneous insert result in one owned active event or an explicit recoverable conflict; no blind duplicate creation | Pending |
| Causal history | A-to-B-to-C offline chain, concurrent sibling edits, missing history and sync replacement have explicit safe outcomes | Pending |
| Cancellation recovery | Clear before first publish, stale device after clear, lost metadata and remote deletion do not resurrect alerts | Pending |
| Late changes | Replacing a reminder after its time does not leave an unnoticed old active schedule; queue policy explicitly resolves this | Pending |
| Client notification behavior | Apple Calendar/iPhone and Thunderbird/Windows alert after Obsidian closes; dismissal/snooze never completes the task or re-arms an event | Pending |
| Time and sync delay | DST/travel semantics verified; publication/cancellation latency recorded; delayed cancellation is visible to user | Pending |

Some cases require an isolated auth/provider harness that does not exist yet; the current token spike accepts injected credentials but cannot start login. Testing FCR first can validate this device's browser/redirect path, but cannot prove Morning OS's eventual OAuth client. The user was asked for device versions and disposable test setup; no answer was available when this report was written.

**Exit gate:** select and prove authentication/storage, exercise real provider conditional operations and the adversarial two-device cases, then validate notification delivery. Only then expand the production reminder editor/publisher. The passing local checks are sufficient to continue feasibility work, not to mark this gate passed.

Local research sources and the additional test runner are retained under `dev/calendar-research/`. Both `dev/` and `docs/` are gitignored by this repository; these artifacts are saved in the workspace but will not enter a commit automatically.
