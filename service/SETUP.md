# Google authentication lab setup

This feasibility service never calls the Calendar API. The plugin requests `calendar.app.created`, permitting secondary calendars created by the app and events on them. Local mocked tests do not establish Google's acceptance of the registered web client and PKCE flow.

## 1. Deploy the unconfigured service

From `D:\Projects\Morning-OS\dev\calendar-lab` in PowerShell:

```powershell
npx wrangler login
npm run service:deploy
```

Complete the Cloudflare browser authorization using your **Free** account. The configuration uses SQLite Durable Objects (supported on Free) and a `workers.dev` address. No purchased domain is needed. Record the deployment URL, for example `https://morning-os-calendar-lab-auth.YOUR-SUBDOMAIN.workers.dev`.

The service initially fails closed. `/health` returns `configured: false`; OAuth routes return 503 until all four settings below exist. Configuration disables Worker observability and preview URLs. Do not enable request/trace logging or use `wrangler tail` during real login: Google's callback necessarily contains an authorization code, visible to infrastructure administrators and any separately enabled request logging.

## 2. Create the Google web client

In your existing **Morning OS Calendar Lab** Google project:

1. Open **Google Auth Platform → Clients → Create client**.
2. Choose **Web application**, named **Morning OS Calendar Lab Worker**.
3. Leave **Authorized JavaScript origins** empty; this uses native plugin HTTP and a server callback.
4. Add exactly this **Authorized redirect URI**, substituting your deployed hostname:

   `https://morning-os-calendar-lab-auth.YOUR-SUBDOMAIN.workers.dev/oauth/callback`

5. Save the client ID and client secret privately. Google may show the secret only once. Never put the secret in the plugin, vault, repository, or chat.
6. Keep audience External/Testing and your intended Google account as a test user. Under Data Access, declare `https://www.googleapis.com/auth/calendar.app.created`.

## 3. Configure the Worker

In Cloudflare → Workers & Pages → **morning-os-calendar-lab-auth** → Settings → Variables and Secrets, add:

| Name | Type | Value |
| --- | --- | --- |
| `PUBLIC_ORIGIN` | Secret | Your deployed HTTPS origin, **no trailing slash** |
| `GOOGLE_CLIENT_ID` | Secret | The new Google web client ID |
| `GOOGLE_CLIENT_SECRET` | Secret | The Google client secret |
| `LAB_KEY` | Secret | A separate random 64-character lowercase hex lab access key |

Manage all four outside the repo/Wrangler vars so later deployments cannot overwrite dashboard values. Use Secret type even for the two public settings. Generate the lab key locally and copy it without printing it:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))" | Set-Clipboard
```

Paste it into `LAB_KEY` and save it in your password manager for entering on the phone. This is separate from the Google secret and restricts access to the private test service. This lab is not a public multi-user service; production needs per-install authorization, abuse controls and a reviewed credential lifecycle.

Save/deploy settings. Open `<PUBLIC_ORIGIN>/health`; expect version `0.2.0` and `configured: true`. This checks configuration shape, not whether Google accepts the credentials.

## 4. Update and test the iPhone plugin

1. In BRAT, update `satyagalla/morning-os-calendar-lab` to **0.2.0**. If pinned to 0.1.0, change the pinned version. Reload the plugin.
2. Run **Morning OS Calendar Lab: Open device test panel**.
3. Enter the service URL and **lab access key**, then **Use service for this session**. Never enter the Google client secret here.
4. Tap **Prepare Google login**, then **Open Google consent in browser**. Use Safari/external browser and your registered Google test account.
5. Grant the app-created-calendar permission. On the return page tap **Open Obsidian**. Expect `Google login: PASS` and `refresh token received`. Record which vault opened.
6. If the link cannot open Obsidian, return manually to the same vault, reopen the panel, and tap **Complete pending login**. No authorization code needs copying. Login expires after ten minutes.
7. Tap **Test token refresh**. Expect PASS.
8. Export sanitized results. Close/reopen the panel and test refresh again; background/return to Obsidian and test again. Export before terminating the app.
9. Tap **Revoke Google authorization**. Expect PASS. This revokes this app's Google grant and can affect other devices using the same Google account/client.
10. Separately test denied consent, callback replay, expired login, and app termination during login. Cold start intentionally forgets pending login, tokens, and lab key; configure and start again.

For external revocation: sign in, remove the app under [Google Account connections](https://myaccount.google.com/connections), then test refresh; it must fail. If revocation is unconfirmed, retry or remove the grant there. **Forget local login** and termination only clear memory; neither revokes Google access. Lost exchange responses require a new login, preserving single-use redemption.

## Boundaries and evidence

- No Google credentials are included in repo/BRAT assets. Plugin tokens and lab key are memory-only. No secret-storage API or minimum-version change.
- The service temporarily stores state, vault name, PKCE challenge, expiry and callback code in one SQLite Durable Object per login. An alarm deletes records after ten minutes; expired records are rejected even if alarm execution is delayed. Codes are removed before exchange. Provider tokens pass through the service but are never persisted by its code.
- State/vault binding, a 256-bit verifier, S256 challenge, atomic single-use redemption, fixed provider URLs/scope, bounded bodies, sanitized failures, no-store responses and generation checks protect this flow. App-return URLs contain routing/state only, never provider tokens or codes.
- Cloudflare is a trusted processor of the Google secret and transient token exchange. This is not end-to-end encryption between Google and the phone.
- Google web-client PKCE compatibility/enforcement requires live testing. External/Testing refresh tokens for Calendar normally expire after seven days. Repeated consent can also invalidate older tokens.
- Native `requestUrl` has no cancellation signal in this integration. Forget/unload ignores late results but cannot cancel requests already sent. Worker provider fetches time out after ten seconds.
- Persistent credential storage, relaunch recovery, calendar ownership, ETags, ordering, cancellation recovery and notifications remain unimplemented/unvalidated.

## Verify

```powershell
npm ci
npm test
npm run test:worker
npm run build
npm run service:check
```

The runtime test uses local Workers/SQLite with mocked Google responses and intercepts all outbound traffic. The pinned Wrangler release depends on a prerelease Miniflare; its version is pinned explicitly for reproducibility.

## References

- [Google web-server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server)
- [Google PKCE](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Calendar scopes](https://developers.google.com/workspace/calendar/api/auth)
- [Token expiration](https://developers.google.com/identity/protocols/oauth2#expiration)
- [Cloudflare CLI setup](https://developers.cloudflare.com/workers/get-started/guide/)
- [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/)

## Cleanup

Revoke Google authorization first. Remove the lab plugin when finished. Delete the Worker and its Durable Object namespace in Cloudflare; deleting only the Worker may leave the namespace. Delete/disable the Google test OAuth client if retiring the experiment. Preserve Morning OS and existing device-result notes.
