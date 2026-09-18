import assert from "node:assert/strict";
import worker, { LoginSession, challenge, SCOPE } from "../service/worker.mjs";
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
const origin = "https://lab.example";
const key = "a".repeat(64);
const env = { PUBLIC_ORIGIN: origin, GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "secret-fixture", LAB_KEY: key };
let googleCalls = 0;
const realFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  assert.equal(url, "https://oauth2.googleapis.com/token");
  assert.equal(init.body.get("client_secret"), env.GOOGLE_CLIENT_SECRET);
  assert.equal(init.body.get("redirect_uri"), origin + "/oauth/callback");
  assert.equal(init.body.get("code_verifier"), "b".repeat(64));
  googleCalls++;
  return Response.json({ access_token: "access-fixture", refresh_token: "refresh-fixture", expires_in: 3600, token_type: "Bearer", scope: SCOPE });
};
class Storage {
  values = new Map(); tail = Promise.resolve();
  async get(key) { return structuredClone(this.values.get(key)); }
  async put(key, value) { this.values.set(key, structuredClone(value)); }
  async deleteAll() { this.values.clear(); }
  async setAlarm(at) { this.alarm = at; }
  async transaction(run) {
    const result = this.tail.then(() => run(this)); this.tail = result.catch(() => {}); return result;
  }
}
const sessions = new Map();
env.SESSIONS = { idFromName: value => value, get: id => {
  if (!sessions.has(id)) {
    const storage = new Storage();
    sessions.set(id, { storage, instance: new LoginSession({ storage }, env) });
  }
  return sessions.get(id).instance;
} };
const post = (path, data, auth = key) => worker.fetch(new Request(origin + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${auth}` }, body: JSON.stringify(data) }), env);
const verifier = "b".repeat(64);
async function start(vault = "OS & test") {
  const response = await post("/start", { challenge: await challenge(verifier), vault });
  assert.equal(response.status, 200); return response.json();
}
const callback = (state, extra = "code=code-fixture") => worker.fetch(new Request(`${origin}/oauth/callback?state=${state}&${extra}`), env);
try {
  await check("synthetic header arrival diagnostic never forwards or reflects credentials", async () => {
    for (const method of ["PATCH", "DELETE"]) {
      const r = await worker.fetch(new Request(origin + "/probe/if-match", { method, headers: { "If-Match": '"moslab-header-probe"' } }), env);
      assert.equal(r.status, 200); assert.deepEqual(await r.json(), { method, matched: true });
      const absent = await worker.fetch(new Request(origin + "/probe/if-match", { method }), env);
      assert.equal((await absent.json()).matched, false);
    }
    assert.equal(googleCalls, 0);
  });
  await check("configuration and lab key fail closed", async () => {
    assert.equal((await worker.fetch(new Request(origin + "/start", { method: "POST" }), {})).status, 503);
    assert.equal((await post("/start", {}, "wrong")).status, 401);
    assert.equal((await post("/start", { challenge: "bad", vault: "OS" })).status, 400);
    assert.equal((await post("/start", { challenge: await challenge(verifier), vault: "x".repeat(201) })).status, 400);
  });
  await check("PKCE known vector", async () => {
    assert.equal(await challenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
  await check("consent fixed scope, redirect, offline access and challenge", async () => {
    const s = await start(); const url = new URL(s.url);
    assert.equal(url.origin, "https://accounts.google.com");
    for (const [name, value] of Object.entries({ scope: SCOPE, redirect_uri: origin + "/oauth/callback", code_challenge: await challenge(verifier), code_challenge_method: "S256", access_type: "offline" })) assert.equal(url.searchParams.get(name), value);
    assert.ok(sessions.get(s.state).storage.alarm > Date.now());
  });
  await check("unknown callback and duplicate state rejected", async () => {
    assert.equal((await callback("0".repeat(64))).status, 400);
    const s = await start(); assert.equal((await callback(s.state, `code=a&state=${s.state}`)).status, 400);
  });
  await check("pending redemption and wrong proof do not consume session", async () => {
    const s = await start();
    assert.equal((await post("/redeem", { state: s.state, verifier })).status, 409);
    const response = await callback(s.state);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");
    const html = await response.text();
    assert.ok(html.includes("obsidian://morning-os-calendar-lab-auth"));
    assert.ok(!html.includes("code-fixture") && !html.includes("secret-fixture"));
    assert.equal((await post("/redeem", { state: s.state, verifier: "c".repeat(64) })).status, 401);
    assert.equal((await post("/redeem", { state: s.state, verifier })).status, 200);
  });
  await check("concurrent redemption exchanges once; callback cannot overwrite", async () => {
    const s = await start(); await callback(s.state);
    assert.equal((await callback(s.state, "code=overwrite")).status, 400);
    const before = googleCalls;
    const results = await Promise.all([post("/redeem", { state: s.state, verifier }), post("/redeem", { state: s.state, verifier })]);
    assert.deepEqual(results.map(r => r.status).sort(), [200, 401]);
    assert.equal(googleCalls - before, 1);
    assert.ok(!JSON.stringify([...sessions.get(s.state).storage.values]).includes("code-fixture"));
  });
  await check("expiry and alarm cleanup", async () => {
    const s = await start(); const entry = sessions.get(s.state);
    const data = await entry.storage.get("session"); data.expires = Date.now() - 1; await entry.storage.put("session", data);
    assert.equal((await callback(s.state)).status, 400);
    assert.equal((await post("/redeem", { state: s.state, verifier })).status, 401);
    await entry.instance.alarm(); assert.equal(entry.storage.values.size, 0);
  });
  await check("denied consent consumed without token request", async () => {
    const s = await start(); const before = googleCalls;
    await callback(s.state, "error=access_denied");
    assert.equal((await post("/redeem", { state: s.state, verifier })).status, 403);
    assert.equal((await post("/redeem", { state: s.state, verifier })).status, 401);
    assert.equal(googleCalls, before);
  });
  await check("failed exchange remains consumed and errors sanitized", async () => {
    const s = await start(); await callback(s.state);
    globalThis.fetch = async () => { throw new Error("secret-fixture provider failure"); };
    const response = await post("/redeem", { state: s.state, verifier });
    assert.equal(response.status, 502); assert.ok(!(await response.text()).includes("secret-fixture"));
    assert.equal((await post("/redeem", { state: s.state, verifier })).status, 401);
  });
  await check("body limit enforced", async () => { assert.equal((await post("/start", { padding: "x".repeat(9000) })).status, 400); });
} finally { globalThis.fetch = realFetch; }
console.log(`${passed} service checks passed (mocked Google and storage).`);
