export const SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
const CALLBACK = "/oauth/callback";
const HEX = /^[a-f0-9]{64}$/;
const CHALLENGE = /^[A-Za-z0-9_-]{43}$/;
const headers = {
  "Cache-Control": "no-store",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
  "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
};
const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...headers, "Content-Type": "application/json" } });
const fail = (status, error) => json({ error }, status);
const random = () => Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
export async function challenge(verifier) {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function body(request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) throw new Error("body");
  // Bound the stream itself; Content-Length alone is not trustworthy.
  const reader = request.body?.getReader();
  if (!reader) throw new Error("body");
  const chunks = []; let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > 8192) { await reader.cancel(); throw new Error("body"); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size); let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new Error("body");
  return data;
}
function configured(env) {
  try {
    const url = new URL(env.PUBLIC_ORIGIN);
    return url.protocol === "https:" && url.origin === env.PUBLIC_ORIGIN &&
      typeof env.GOOGLE_CLIENT_ID === "string" && env.GOOGLE_CLIENT_ID.endsWith(".apps.googleusercontent.com") &&
      typeof env.GOOGLE_CLIENT_SECRET === "string" && env.GOOGLE_CLIENT_SECRET.length > 0 &&
      typeof env.LAB_KEY === "string" && HEX.test(env.LAB_KEY);
  } catch { return false; }
}
async function authorized(request, env) {
  // Compare fixed-size digests without a secret-dependent early exit.
  const supplied = request.headers.get("authorization") ?? "";
  if (supplied.length > 128) return false;
  const a = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(supplied)));
  const b = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`Bearer ${env.LAB_KEY}`)));
  let diff = 0; for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
async function google(env, fields, transport = fetch) {
  const response = await transport("https://oauth2.googleapis.com/token", {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET, ...fields }),
    redirect: "manual", signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) return fail(response.status === 400 ? 401 : 502, "google_token_failed");
  const data = await response.json();
  if (typeof data.access_token !== "string" || data.token_type?.toLowerCase() !== "bearer" ||
      !Number.isFinite(data.expires_in) || data.expires_in <= 0 ||
      (fields.grant_type === "authorization_code" && !data.scope?.split(" ").includes(SCOPE))) {
    return fail(502, "invalid_token_response");
  }
  return json({ access_token: data.access_token, expires_in: data.expires_in, scope: data.scope ?? SCOPE,
    ...(typeof data.refresh_token === "string" ? { refresh_token: data.refresh_token } : {}) });
}

export default {
  async fetch(request, env) {
    try {
      const url = new URL(request.url);
      if (url.pathname === "/health" && request.method === "GET") return json({ service: "morning-os-calendar-lab", version: "0.2.0", configured: configured(env) });
      if (!configured(env)) return fail(503, "configure_service");
      if (url.origin !== env.PUBLIC_ORIGIN) return fail(400, "wrong_origin");
      if (url.pathname === CALLBACK && request.method === "GET") {
        const state = url.searchParams.get("state");
        if (!state || !HEX.test(state) || url.searchParams.getAll("state").length !== 1) return fail(400, "invalid_callback");
        return env.SESSIONS.get(env.SESSIONS.idFromName(state)).fetch(request);
      }
      if (request.method !== "POST") return fail(404, "not_found");
      if (!await authorized(request, env)) return fail(401, "unauthorized");
      const data = await body(request);
      if (url.pathname === "/start") {
        if (typeof data.challenge !== "string" || !CHALLENGE.test(data.challenge) || typeof data.vault !== "string" ||
          !data.vault.trim() || data.vault.length > 200 || /[\x00-\x1f]/.test(data.vault)) return fail(400, "invalid_start");
        const state = random();
        return env.SESSIONS.get(env.SESSIONS.idFromName(state)).fetch(new Request(`${env.PUBLIC_ORIGIN}/initialize`, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, state }),
        }));
      }
      if (url.pathname === "/redeem") {
        if (!HEX.test(data.state ?? "") || typeof data.verifier !== "string" || !HEX.test(data.verifier)) return fail(400, "invalid_redemption");
        return env.SESSIONS.get(env.SESSIONS.idFromName(data.state)).fetch(new Request(request.url, {
          method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
        }));
      }
      if (url.pathname === "/refresh" || url.pathname === "/revoke") {
        if (typeof data.refresh_token !== "string" || !data.refresh_token || data.refresh_token.length > 4096) return fail(400, "invalid_token");
        if (url.pathname === "/refresh") return await google(env, { grant_type: "refresh_token", refresh_token: data.refresh_token });
        const response = await fetch("https://oauth2.googleapis.com/revoke", {
          method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({ token: data.refresh_token }), redirect: "manual", signal: AbortSignal.timeout(10000),
        });
        return response.ok ? json({ revoked: true }) : fail(502, "revocation_unconfirmed");
      }
      return fail(404, "not_found");
    } catch { return fail(400, "request_failed"); }
  },
};

// SQLite-backed storage gives each login one atomic, expiring redemption record.
// Provider tokens are never stored here. No request/body/token logging.
export class LoginSession {
  constructor(ctx, env) { this.ctx = ctx; this.env = env; }
  async alarm() { await this.ctx.storage.deleteAll(); }
  async fetch(request) {
    try {
      const path = new URL(request.url).pathname;
      if (path === "/initialize") {
        const data = await body(request);
        const created = await this.ctx.storage.transaction(async tx => {
          if (await tx.get("session")) return false;
          await tx.put("session", { state: data.state, vault: data.vault, challenge: data.challenge, expires: Date.now() + 600000, phase: "pending" });
          return true;
        });
        if (!created) return fail(409, "existing_session");
        await this.ctx.storage.setAlarm(Date.now() + 600000);
        const consent = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        consent.search = new URLSearchParams({ client_id: this.env.GOOGLE_CLIENT_ID, redirect_uri: this.env.PUBLIC_ORIGIN + CALLBACK,
          response_type: "code", scope: SCOPE, access_type: "offline", prompt: "consent", state: data.state,
          code_challenge: data.challenge, code_challenge_method: "S256" }).toString();
        return json({ state: data.state, url: consent.href });
      }
      if (path === CALLBACK) {
        const params = new URL(request.url).searchParams;
        const session = await this.ctx.storage.transaction(async tx => {
          const s = await tx.get("session");
          if (!s || s.expires <= Date.now() || s.phase !== "pending" || params.get("state") !== s.state) return null;
          const code = params.get("code");
          const denied = params.has("error");
          if (!denied && (!code || code.length > 4096 || params.getAll("code").length !== 1)) return null;
          await tx.put("session", { ...s, phase: denied ? "denied" : "ready", ...(denied ? {} : { code }) });
          return s;
        });
        if (!session) return fail(400, "invalid_or_expired_callback");
        const uri = `obsidian://morning-os-calendar-lab-auth?vault=${encodeURIComponent(session.vault)}&state=${session.state}`;
        const safeUri = uri.replace(/&/g, "&amp;").replace(/'/g, "&#39;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
        return new Response(`<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Calendar Lab</title></head><body><h1>Return to Calendar Lab</h1><p><a href="${safeUri}">Open Obsidian</a></p><p>If the link does not work, return to the same vault and tap Complete pending login. This login expires after 10 minutes.</p></body></html>`, {
          headers: { ...headers, "Content-Type": "text/html; charset=utf-8" },
        });
      }
      if (path === "/redeem") {
        const data = await body(request);
        const proof = await challenge(data.verifier);
        const result = await this.ctx.storage.transaction(async tx => {
          const s = await tx.get("session");
          if (!s || s.expires <= Date.now() || s.state !== data.state || s.challenge !== proof || s.phase === "consumed") return { error: "invalid_session", status: 401 };
          if (s.phase === "pending") return { error: "login_pending", status: 409 };
          // Consume before the network call. A lost response requires a fresh login.
          await tx.put("session", { phase: "consumed", expires: s.expires });
          return s.phase === "denied" ? { error: "consent_denied", status: 403 } : { code: s.code };
        });
        if (result.error) return fail(result.status, result.error);
        return await google(this.env, { grant_type: "authorization_code", code: result.code, code_verifier: data.verifier, redirect_uri: this.env.PUBLIC_ORIGIN + CALLBACK });
      }
      return fail(404, "not_found");
    } catch { return fail(502, "session_failed"); }
  }
}
