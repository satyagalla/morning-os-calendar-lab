Initial device feasibility probe for Windows, iPhone, and Android.

- Independent plugin ID; does not read or modify Morning OS tasks.
- Web Crypto known-vector check and unauthenticated native HTTP probe.
- Synthetic callbacks with state/vault binding, two-minute expiry, and single-use acceptance.
- Non-secret device-local restart marker.
- Explicit sanitized report export to Tests/Morning OS Calendar.
- Source research, test sheets, pinned dependencies, and reproducible build commands.

Validation: TypeScript and browser build passed; seven callback-session checks passed. Actual device checks remain pending.

This release does not implement Google login, a hosted callback/token service, calendar publishing, or notifications. Install via BRAT and run “Morning OS Calendar Lab: Open device test panel”.
