import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({ entryPoints: ["src/auth.ts"], bundle: true, format: "esm", platform: "browser", write: false });
const { AuthProbe, CALENDAR_SCOPE } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const origin = "https://lab.example", key = "a".repeat(64), state = "b".repeat(64);
const token = { access_token: "private-access", refresh_token: "private-refresh", scope: CALENDAR_SCOPE, expires_in: 3600 };
function fixture(override) {
  const log = [], calls = [];
  const probe = new AuthProbe(async (url, secret, body) => {
    calls.push({ url, body }); assert.equal(secret, key);
    if (override) { const result = await override(url, body); if (result) return result; }
    if (url.endsWith("/start")) {
      const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      url.search = new URLSearchParams({ state, code_challenge: body.challenge, code_challenge_method: "S256", scope: CALENDAR_SCOPE, redirect_uri: origin + "/oauth/callback" });
      return { status: 200, data: { state, url: url.href } };
    }
    if (url.endsWith("/revoke")) return { status: 200, data: { revoked: true } };
    return { status: 200, data: token };
  }, message => log.push(message));
  probe.configure(origin, key); return { probe, log, calls };
}
await check("HTTPS and origin-only configuration required", async () => {
  const { probe } = fixture();
  for (const url of ["http://lab.example", origin + "/path", "https://user:pass@lab.example", origin + "?token=a"]) assert.throws(() => probe.configure(url, key));
});
await check("callback mismatch rejected, valid accepted, replay blocked, logs sanitized", async () => {
  const { probe, log, calls } = fixture(); await probe.start("OS");
  await probe.complete(state, "other"); assert.equal(calls.length, 1);
  await probe.complete("wrong", "OS"); assert.equal(calls.length, 1);
  await probe.complete(state, "OS"); assert.equal(probe.connected, true);
  await probe.complete(state, "OS"); assert.equal(calls.length, 2);
  assert.ok(!log.join().includes("private-") && !log.join().includes(key));
});
await check("manual completion, refresh and explicit revocation", async () => {
  const { probe, log } = fixture(); await probe.start("OS"); await probe.complete(undefined, undefined, true);
  await probe.refresh(); assert.ok(log.some(line => line.includes("refresh: PASS")));
  await probe.revoke(); assert.equal(probe.connected, false);
});
await check("late login response cannot restore forgotten credentials", async () => {
  let release; const deferred = new Promise(resolve => { release = resolve; });
  const { probe } = fixture(async url => url.endsWith("/redeem") ? deferred : undefined);
  await probe.start("OS"); const pending = probe.complete(state, "OS");
  probe.clear(); release({ status: 200, data: token }); await pending;
  assert.equal(probe.connected, false); assert.equal(probe.loginUrl, undefined);
});
await check("late refresh cannot restore forgotten credentials", async () => {
  let release; const deferred = new Promise(resolve => { release = resolve; });
  const { probe } = fixture(async url => url.endsWith("/refresh") ? deferred : undefined);
  await probe.start("OS"); await probe.complete(state, "OS");
  const pending = probe.refresh(); probe.clear(); release({ status: 200, data: token }); await pending;
  assert.equal(probe.connected, false);
});
await check("pending consent stays redeemable; denied consent clears session", async () => {
  let status = 409;
  const { probe } = fixture(async url => url.endsWith("/redeem") ? { status, data: { error: status === 409 ? "login_pending" : "consent_denied" } } : undefined);
  await probe.start("OS"); await probe.complete(state, "OS"); assert.ok(probe.loginUrl);
  status = 403; await probe.complete(state, "OS"); assert.equal(probe.loginUrl, undefined); assert.equal(probe.connected, false);
});
await check("concurrent auth operations are serialized", async () => {
  let release; const deferred = new Promise(resolve => { release = resolve; });
  const { probe, calls } = fixture(async url => url.endsWith("/refresh") ? deferred : undefined);
  await probe.start("OS"); await probe.complete(state, "OS");
  const pending = probe.refresh(); await probe.refresh(); await probe.revoke();
  assert.equal(calls.length, 3); release({ status: 200, data: token }); await pending;
});
console.log(`${passed} auth lifecycle checks passed (mocked transport).`);
