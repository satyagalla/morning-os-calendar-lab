# Credential restart test (0.3.0)

Calendar Lab now requires Obsidian 1.11.4+ for SecretStorage. The user approved this lab-only change; Morning OS keeps its existing minimum.

1. Update through BRAT to 0.3.0 and reload the plugin. Configure the existing service, complete Google login, and test refresh.
2. Select **Save login for restart test**. Expect Credential save PASS. This writes service origin, lab key, scope and refresh token into the lab's SecretStorage entry and reads it back. Access token and pending OAuth callback/verifier are not saved.
3. Export results. Fully terminate Obsidian, restart, open the panel and select **Restore saved login** directly. Do not configure the service again: configuring a new session intentionally clears the saved login. Expect Token refresh PASS and Credential restore PASS without a browser.
4. Test refresh again. Export results. Step 2 alone does not prove restart persistence; capture both reports and record the actual termination/relaunch.
5. After calendar tests, select **Revoke Google authorization**. Confirmed success clears the saved value. Restart and restore: expect failure/no saved credentials.
6. Separately test **Forget local login and service key** after saving a fresh login. Restart/restore must fail. Forgetting does not revoke the Google grant; remove it from Google Account connections if needed.

## Storage boundaries

- [Obsidian SecretStorage](https://docs.obsidian.md/plugins/guides/secret-storage) is documented as vault-local app storage accessible to other plugins. Do not infer OS-keychain protection, encryption at rest, backup exclusion or cross-device isolation. Those require separate verification and a production security decision.
- Only `morning-os-calendar-lab-login-v1` is written. The API has no delete method; cleanup overwrites that value with an empty string. Other secrets are not enumerated or edited. If cleanup fails, remove the entry through Obsidian's secret management and revoke the Google grant externally.
- Saving is opt-in. Unload clears memory but preserves saved credentials. Restore is manual and refreshes through the saved service. Token rotation is saved automatically while persistence is enabled. Storage failures report that saved credentials may be stale; retry Save login before restarting.
- Invalid records fail before network access. A provider 401 during refresh clears saved credentials. Temporary transport failures retain them for explicit retry. Late responses cannot recreate credentials after Forget/unload.
- No credentials are stored in ordinary vault files, reports, plugin data.json, repository or BRAT assets. Device/app backups may include app storage.
- Interrupted consent is not restored: pending state/verifier remain memory-only. Start a fresh login if termination preceded exchange.
