import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({ entryPoints: ["src/auth.ts"], bundle: true, format: "esm", platform: "browser", write: false });
const { AuthProbe, CALENDAR_SCOPE } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const origin = "https://lab.example", key = "a".repeat(64), state = "b".repeat(64);
const token = { access_token: "private-access", refresh_token: "private-refresh", scope: CALENDAR_SCOPE, expires_in: 3600 };
function fixture(override, storage) {
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
  }, message => log.push(message), storage);
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
await check("calendar access requires login; token is unavailable after revocation", async () => {
  const { probe } = fixture(); await assert.rejects(() => probe.accessToken());
  await probe.start("OS"); await probe.complete(state, "OS"); assert.equal(await probe.accessToken(), token.access_token);
  await probe.revoke(); await assert.rejects(() => probe.accessToken());
});
await check("calendar token request refreshes expiry and fails closed on rejected refresh", async () => {
  let fail = false;
  const { probe } = fixture(async url => {
    if (url.endsWith("/redeem")) return { status: 200, data: { ...token, expires_in: 1 } };
    if (url.endsWith("/refresh")) return fail ? { status: 401, data: {} } : { status: 200, data: token };
  });
  await probe.start("OS"); await probe.complete(state, "OS"); assert.equal(await probe.accessToken(), token.access_token);
  probe.clear(); probe.configure(origin, key); await probe.start("OS"); await probe.complete(state, "OS");
  fail = true; await assert.rejects(() => probe.accessToken()); assert.equal(probe.connected, false);
});
function memoryStore() { let value = null; return { read: () => value, write: next => { value = next; } }; }
await check("opt-in save survives unload; explicit restore refreshes without browser", async () => {
  const store = memoryStore(), { probe, calls, log } = fixture(undefined, store);
  await probe.start("OS"); await probe.complete(state, "OS"); assert.equal(store.read(), "");
  probe.saveLogin(); const saved = store.read(); assert.ok(saved.includes("private-refresh")); assert.ok(!saved.includes("private-access"));
  probe.clear(); assert.equal(store.read(), saved); const count = calls.length;
  await probe.restoreLogin(); assert.equal(calls.length, count + 1); assert.ok(calls.at(-1).url.endsWith("/refresh"));
  assert.ok(log.at(-1).includes("Credential restore: PASS")); assert.equal(await probe.accessToken(), token.access_token);
  assert.ok(!log.join().includes("private-") && !log.join().includes(key));
});
await check("rotated refresh token persisted; revoke and forget clear saved values", async () => {
  const store = memoryStore(), { probe } = fixture(async url => url.endsWith("/refresh") ? { status: 200, data: { ...token, refresh_token: "rotated" } } : undefined, store);
  await probe.start("OS"); await probe.complete(state, "OS"); probe.saveLogin(); await probe.refresh();
  assert.equal(JSON.parse(store.read()).refresh, "rotated"); await probe.revoke(); assert.equal(store.read(), "");
  await probe.start("OS"); await probe.complete(state, "OS"); probe.saveLogin(); probe.forget(); assert.equal(store.read(), "");
  await assert.rejects(() => probe.restoreLogin());
});
await check("invalid saved credentials never cause a network request", async () => {
  const store = memoryStore(), { probe, calls } = fixture(undefined, store);
  for (const value of ["bad-json", JSON.stringify({ version: 9 }), JSON.stringify({ version: 1, scope: CALENDAR_SCOPE, origin: "http://bad.example", key, refresh: "r" })]) {
    store.write(value); await assert.rejects(() => probe.restoreLogin());
  }
  assert.equal(calls.length, 0);
});
await check("rejected restored refresh clears saved authorization", async () => {
  const store = memoryStore(); let reject = false;
  const { probe, log } = fixture(async url => reject && url.endsWith("/refresh") ? { status: 401, data: {} } : undefined, store);
  await probe.start("OS"); await probe.complete(state, "OS"); probe.saveLogin(); probe.clear(); reject = true;
  await probe.restoreLogin(); assert.equal(store.read(), ""); assert.equal(probe.connected, false);
  assert.ok(log.at(-1).includes("Credential restore: FAIL"));
});
await check("late restored response cannot repersist forgotten credentials", async () => {
  const store = memoryStore(); let release;
  const { probe } = fixture(async url => url.endsWith("/refresh") ? new Promise(resolve => { release = resolve; }) : undefined, store);
  await probe.start("OS"); await probe.complete(state, "OS"); probe.saveLogin(); probe.clear();
  const pending = probe.restoreLogin(); probe.forget(); release({ status: 200, data: token }); await pending;
  assert.equal(store.read(), ""); assert.equal(probe.connected, false);
});
await check("storage failures reported without claiming persistence", async () => {
  const store = memoryStore(), { probe, log } = fixture(undefined, store);
  await probe.start("OS"); await probe.complete(state, "OS");
  const write = store.write; store.write = () => { throw new Error("unavailable"); };
  assert.throws(() => probe.saveLogin()); assert.ok(!log.some(s => s.includes("Credential save: PASS")));
  store.write = write; probe.saveLogin(); store.write = () => { throw new Error("unavailable"); };
  await probe.refresh(); assert.ok(log.some(s => s.includes("Credential update: FAIL")));
  assert.throws(() => probe.forget()); assert.equal(probe.connected, false);
});
console.log(`${passed} auth lifecycle checks passed (mocked transport).`);
