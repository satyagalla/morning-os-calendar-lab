Calendar Lab 0.3.2 adds Start fresh event test.

After the current event has a saved cancellation fence and the provider reports it absent/cancelled, this explicit action retains its identity, timing, and cancellation record and allocates a new event identity in the same calendar. It makes no provider writes. Active events, failed provider checks, and repeated preparation are blocked. Old journals and saved login remain compatible. No Cloudflare update needed.

Test order: Restore saved login; Start fresh event test; Create event and simulate lost reply; Recover event or pending cancellation; Test stale update and delete (ETags); Show saved event timing; export results. Observe the calendar alert with Obsidian closed before cancelling.

Validation: 49 mocked checks and TypeScript/browser build. Provider ETags and notification delivery still require live device testing. Cross-device ordering remains unimplemented.
