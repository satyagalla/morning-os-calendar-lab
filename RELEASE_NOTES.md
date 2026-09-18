Calendar Lab 0.4.0 adds one guided test batch, persistent results across restart, a sacrificial stale DELETE diagnostic, duplicate-ID and lost-reply recovery probes, rescheduling verification, and one restart cancellation checkpoint. A separate final event produces the updated notification in about two minutes. Includes all remaining acceptance checkpoints and identifies unimplemented multi-device ordering, update recovery and retry policy explicitly; these are not automated passes.

The Worker is updated to 0.4.0 with a fixed synthetic PATCH/DELETE If-Match arrival diagnostic. It receives no Google token or lab key and provides no calendar proxy. Existing OAuth credentials and journals remain compatible. Refresh/login/revocation behavior is unchanged. Production calendar integration remains blocked on ordering and DELETE safety.

Update BRAT; open the panel; Run complete test batch; observe the updated and superseded alert times; save cancellation checkpoint; restart once; Resume batch after restart and export. See test-kit/Complete Test Run.md.

Validation: 55 mocked checks, browser build, Workers runtime, and Worker deployment dry-run.
