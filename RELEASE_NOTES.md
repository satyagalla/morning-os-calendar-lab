Google authentication feasibility lab with a separately deployable Cloudflare Worker.

- Optional Google consent, HTTPS callback, PKCE-bound single-use redemption, refresh and revocation.
- Google client secret stays in Worker secrets. Tokens and lab key stay in plugin memory; restart requires a fresh login.
- App-created-calendar scope only. No calendar API calls or Morning OS task access.
- Atomic SQLite login sessions expire after ten minutes.
- Synthetic callback links remain available when reopening the panel.
- Setup: service/SETUP.md. Deploy/configure the service before real login.

Validation: 24 focused checks; local Workers/SQLite with mocked Google; TypeScript/browser build; Worker deployment dry run. Live Google login, persistent credential storage and calendar publishing remain unvalidated.

Update through BRAT, then run Morning OS Calendar Lab: Open device test panel. Revocation can affect other test devices using the same Google account and OAuth client.
