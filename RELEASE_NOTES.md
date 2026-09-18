Calendar Lab 0.3.1 adds saved-event timing and read-only diagnostics.

- Saved calendar name, start/end and requested alert time remain available after restart.
- Read-only inspection distinguishes active/cancelled events, HTTP 410 Gone, and other HTTP failures without modifying the journal or provider.
- Recovery now reports HTTP 410 as Gone with an unverified cause rather than claiming cancellation. ETag tests explain when the saved cancellation fence blocks them.
- Existing credentials and journals remain compatible. No Cloudflare update required.

Validation: 46 mocked checks and browser build. Live cancellation cause and calendar ETags remain unverified. Update BRAT, restore saved login, select Show saved event timing and Inspect saved event (read only), then export results.
