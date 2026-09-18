export const AUTH_ACTION = "morning-os-calendar-lab-auth";
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.app.created";
type Transport = (url: string, key: string, body: Record<string, string>) => Promise<{ status: number; data: unknown }>;
type Tokens = { access: string; refresh?: string; expires: number };
type Pending = { state: string; verifier: string; vault: string; expires: number; url: string };
export type CredentialStore = { read(): string | null; write(value: string): void };
function configuration(origin: string, key: string): { origin: string; key: string } {
  const url = new URL(origin.trim());
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error("Use an HTTPS service origin");
  if (!/^[a-f0-9]{64}$/.test(key.trim())) throw new Error("Invalid lab key");
  return { origin: url.origin, key: key.trim() };
}
function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid response");
  return value as Record<string, unknown>;
}
export class AuthProbe {
  private origin = "";
  private key = "";
  private generation = 0;
  private busy = false;
  private tokens: Tokens | null = null;
  private pending: Pending | null = null;
  private persistent = false;
  constructor(private readonly transport: Transport, private readonly report: (message: string) => void, private readonly storage?: CredentialStore) {}
  get loginUrl(): string | undefined { return this.pending?.url; }
  get connected(): boolean { return this.tokens !== null; }
  async accessToken(): Promise<string> {
    if (this.busy) throw new Error("Auth operation in progress");
    if (this.tokens && this.tokens.expires <= Date.now() + 60000) await this.refresh();
    if (!this.tokens?.access || this.tokens.expires <= Date.now()) throw new Error("Login or refresh required");
    return this.tokens.access;
  }
  configure(origin: string, key: string): void {
    const config = configuration(origin, key);
    this.forget(); this.origin = config.origin; this.key = config.key;
    this.report("Auth service configured for this session only.");
  }
  clear(): void {
    this.generation++; this.pending = null; this.tokens = null; this.key = ""; this.origin = ""; this.persistent = false;
    // Keep an in-flight operation locked until it settles; late results are ignored.
  }
  forget(): void {
    this.clear();
    // SecretStorage has no delete API; overwrite our own value with an empty string.
    this.eraseLogin();
  }
  private eraseLogin(): void {
    if (!this.storage) return;
    this.storage.write("");
    if (this.storage.read()) throw new Error("Credential removal readback failed");
  }
  saveLogin(): void {
    if (this.busy || !this.storage || !this.tokens?.refresh) throw new Error("No idle offline login to save");
    this.writeLogin(); this.persistent = true;
    this.report("Credential save: PASS; refresh token and service configuration saved in Obsidian SecretStorage. Restart and restore to test persistence.");
  }
  private writeLogin(): void {
    if (!this.storage || !this.tokens?.refresh) throw new Error("No offline login");
    const value = JSON.stringify({ version: 1, scope: CALENDAR_SCOPE, origin: this.origin, key: this.key, refresh: this.tokens.refresh });
    this.storage.write(value);
    if (this.storage.read() !== value) throw new Error("Credential readback failed");
  }
  async restoreLogin(): Promise<void> {
    if (this.busy || this.tokens || this.pending) throw new Error("Restore requires an idle, empty session");
    const raw = this.storage?.read(); if (!raw || raw.length > 12000) throw new Error("No valid saved credentials");
    const data = object(JSON.parse(raw) as unknown);
    if (data.version !== 1 || data.scope !== CALENDAR_SCOPE || typeof data.origin !== "string" || typeof data.key !== "string" ||
        typeof data.refresh !== "string" || !data.refresh || data.refresh.length > 4096) throw new Error("Invalid saved credentials");
    const config = configuration(data.origin, data.key);
    this.clear(); this.origin = config.origin; this.key = config.key; this.persistent = true;
    this.tokens = { access: "", refresh: data.refresh, expires: 0 };
    const generation = this.generation;
    await this.refresh();
    if (generation === this.generation && this.tokens?.access && this.tokens.expires > Date.now()) this.report("Credential restore: PASS; saved refresh token obtained a new access token. No browser login required.");
    else if (generation === this.generation) this.report("Credential restore: FAIL; retry refresh or sign in again. No calendar writes made.");
  }
  private async run(operation: (generation: number) => Promise<void>): Promise<void> {
    if (this.busy) { this.report("Auth operation already running; wait for it to finish."); return; }
    if (!this.origin || !this.key) { this.report("Configure the service URL and lab access key first."); return; }
    this.busy = true; const generation = this.generation;
    try { await operation(generation); }
    catch { if (generation === this.generation) this.report("Auth probe failed; no secret details recorded. Retry or start a fresh login."); }
    finally { this.busy = false; }
  }
  private async call(path: string, body: Record<string, string>) {
    const response = await this.transport(this.origin + path, this.key, body);
    return { status: response.status, data: object(response.data) };
  }
  async start(vault: string): Promise<void> {
    if (this.tokens) { this.report("Revoke or forget the current login before starting another."); return; }
    await this.run(async generation => {
      this.pending = null;
      const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, "0")).join("");
      const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
      const challenge = btoa(String.fromCharCode(...digest)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
      if (generation !== this.generation) return;
      const { status, data } = await this.call("/start", { challenge, vault });
      if (generation !== this.generation) return;
      if (status !== 200 || typeof data.state !== "string" || !/^[a-f0-9]{64}$/.test(data.state) || typeof data.url !== "string") throw new Error("Start failed");
      const url = new URL(data.url);
      if (url.origin !== "https://accounts.google.com" || url.pathname !== "/o/oauth2/v2/auth" ||
          url.searchParams.get("state") !== data.state || url.searchParams.get("code_challenge") !== challenge ||
          url.searchParams.get("code_challenge_method") !== "S256" || url.searchParams.get("scope") !== CALENDAR_SCOPE ||
          url.searchParams.get("redirect_uri") !== this.origin + "/oauth/callback") throw new Error("Invalid consent URL");
      this.pending = { state: data.state, verifier, vault, url: url.href, expires: Date.now() + 600000 };
      this.report("Google login prepared. Open the consent link in your external browser; expires in 10 minutes.");
    });
  }
  async complete(state?: string, vault?: string, manual = false): Promise<void> {
    const pending = this.pending;
    if (!pending) { this.report("Google callback: no pending login (restart/replay requires a new login)."); return; }
    if (Date.now() >= pending.expires) { this.pending = null; this.report("Google login expired; start again."); return; }
    if (!manual && (state !== pending.state || vault !== pending.vault)) { this.report("Google callback rejected: state or vault mismatch."); return; }
    await this.run(async generation => {
      const { status, data } = await this.call("/redeem", { state: pending.state, verifier: pending.verifier });
      if (generation !== this.generation) return;
      if (status === 409 && data.error === "login_pending") { this.report("Google consent has not returned yet."); return; }
      this.pending = null;
      if (status !== 200) { this.report(status === 403 ? "Google consent denied; no login saved." : "Google exchange failed; start a fresh login."); return; }
      this.tokens = this.parseTokens(data);
      this.report(`Google login: PASS; required calendar scope granted; refresh token ${this.tokens.refresh ? "received" : "missing"}. Tokens in memory only.`);
    });
  }
  private parseTokens(data: Record<string, unknown>, previous?: Tokens): Tokens {
    if (typeof data.access_token !== "string" || !data.access_token || typeof data.expires_in !== "number" ||
        !Number.isFinite(data.expires_in) || data.expires_in <= 0 || typeof data.scope !== "string" ||
        !data.scope.split(" ").includes(CALENDAR_SCOPE)) throw new Error("Invalid tokens");
    return { access: data.access_token, refresh: typeof data.refresh_token === "string" ? data.refresh_token : previous?.refresh,
      expires: Date.now() + data.expires_in * 1000 };
  }
  async refresh(): Promise<void> {
    await this.run(async generation => {
      const old = this.tokens;
      if (!old?.refresh) { this.report("Refresh unavailable: log in and grant offline access first."); return; }
      const { status, data } = await this.call("/refresh", { refresh_token: old.refresh });
      if (generation !== this.generation) return;
      if (status !== 200) {
        if (status === 401) { this.tokens = null; this.persistent = false; this.eraseLogin(); }
        this.report("Token refresh: FAIL; authorization may need a new login."); return;
      }
      this.tokens = this.parseTokens(data, old);
      if (this.persistent) {
        try { this.writeLogin(); }
        catch { this.report("Credential update: FAIL; current login is in memory but saved credentials may be stale. Save login again before restarting."); }
      }
      this.report("Token refresh: PASS. No calendar API calls made.");
    });
  }
  async revoke(): Promise<void> {
    await this.run(async generation => {
      const token = this.tokens?.refresh ?? this.tokens?.access;
      if (!token) { this.report("No in-memory token to revoke. Use Google Account connections if you restarted or forgot it."); return; }
      const { status, data } = await this.call("/revoke", { refresh_token: token });
      if (generation !== this.generation) return;
      if (status === 200 && data.revoked === true) {
        this.tokens = null; this.pending = null; this.persistent = false;
        this.eraseLogin();
        this.report("Google revocation: PASS; in-memory tokens and saved credentials cleared.");
      }
      else this.report("Revocation unconfirmed; token retained for retry. You can also remove access in Google Account connections.");
    });
  }
}
