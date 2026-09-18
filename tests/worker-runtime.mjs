import assert from "node:assert/strict";
import { Miniflare, convertV4MiniflareOptions } from "miniflare";
import { build } from "esbuild";
import { challenge, SCOPE } from "../service/worker.mjs";
const origin = "https://lab.example", key = "a".repeat(64), verifier = "b".repeat(64);
let exchanges = 0, refreshes = 0, revocations = 0;
const bundle = await build({ entryPoints: ["service/entry.mjs"], bundle: true, format: "esm", platform: "browser", write: false });
const mf = new Miniflare(convertV4MiniflareOptions({
  modules: true, script: bundle.outputFiles[0].text, compatibilityDate: "2026-09-18",
  durableObjects: { SESSIONS: { className: "LoginSession", useSQLite: true } },
  bindings: { PUBLIC_ORIGIN: origin, LAB_KEY: key, GOOGLE_CLIENT_ID: "test.apps.googleusercontent.com", GOOGLE_CLIENT_SECRET: "fixture-secret" },
  outboundService: async request => {
    const fields = new URLSearchParams(await request.text());
    if (request.url === "https://oauth2.googleapis.com/revoke") {
      assert.equal(fields.get("token"), "fixture-refresh"); revocations++; return new Response("");
    }
    assert.equal(request.url, "https://oauth2.googleapis.com/token");
    assert.equal(fields.get("client_secret"), "fixture-secret");
    if (fields.get("grant_type") === "authorization_code") {
      assert.equal(fields.get("code_verifier"), verifier); exchanges++;
    } else { assert.equal(fields.get("refresh_token"), "fixture-refresh"); refreshes++; }
    return Response.json({ access_token: "fixture-access", refresh_token: "fixture-refresh", expires_in: 3600, token_type: "Bearer", scope: SCOPE });
  },
}));
const post = (path, body) => mf.dispatchFetch(origin + path, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body) });
try {
  const health = await mf.dispatchFetch(origin + "/health"); assert.equal((await health.json()).configured, true);
  for (const method of ["PATCH", "DELETE"]) {
    const r = await mf.dispatchFetch(origin + "/probe/if-match", { method, headers: { "If-Match": '"moslab-header-probe"' } });
    assert.deepEqual(await r.json(), { method, matched: true });
  }
  const start = await post("/start", { challenge: await challenge(verifier), vault: "OS" }); assert.equal(start.status, 200);
  const { state } = await start.json();
  const callback = await mf.dispatchFetch(`${origin}/oauth/callback?state=${state}&code=fixture-code`); assert.equal(callback.status, 200);
  const results = await Promise.all([post("/redeem", { state, verifier }), post("/redeem", { state, verifier })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 401]); assert.equal(exchanges, 1);
  assert.equal((await post("/refresh", { refresh_token: "fixture-refresh" })).status, 200); assert.equal(refreshes, 1);
  assert.equal((await post("/revoke", { refresh_token: "fixture-refresh" })).status, 200); assert.equal(revocations, 1);
  console.log("PASS real Workers runtime + SQLite Durable Object: start, callback, concurrent single redemption, refresh, revoke (Google mocked; no external requests).");
} finally { await mf.dispose(); }
