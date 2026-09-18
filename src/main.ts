import { Modal, Notice, Platform, Plugin, TFile, TFolder, apiVersion, requestUrl } from "obsidian";
import { ProbeSession } from "./session";
import { AuthProbe, AUTH_ACTION } from "./auth";

const ACTION = "morning-os-calendar-lab-probe";
const MARKER_KEY = "morning-os-calendar-lab:restart-marker";
const REPORT_ROOT = "Tests/Morning OS Calendar";
const PUBLIC_URL = "https://accounts.google.com/.well-known/openid-configuration";

function randomHex(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), byte => byte.toString(16).padStart(2, "0")).join("");
}

function localTimestamp(): string {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

export default class CalendarLab extends Plugin {
  readonly session = new ProbeSession();
  readonly outcomes: string[] = [];
  syntheticLinks: { state: string; vault: string } | null = null;
  readonly auth = new AuthProbe(async (url, key, body) => {
    const response = await requestUrl({ url, method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` }, body: JSON.stringify(body), throw: false });
    return { status: response.status, data: JSON.parse(response.text) as unknown };
  }, message => this.record(message));

  onload(): void {
    this.registerObsidianProtocolHandler(AUTH_ACTION, params => { void this.auth.complete(params.state, params.vault); });
    this.registerObsidianProtocolHandler(ACTION, params => {
      const result = this.session.receive(params.state, params.vault, Date.now());
      this.record(`Synthetic callback: ${result}`);
    });
    this.addCommand({ id: "open-lab", name: "Open device test panel", callback: () => new LabModal(this).open() });
  }

  onunload(): void {
    this.session.clear();
    this.syntheticLinks = null;
    this.auth.clear();
  }

  record(message: string): void {
    this.outcomes.push(`${localTimestamp()} — ${message}`);
    if (this.outcomes.length > 100) this.outcomes.shift();
    new Notice(`Calendar Lab: ${message}`);
  }

  async capabilities(): Promise<void> {
    const random = randomHex();
    const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode("abc")));
    const hex = Array.from(hash, byte => byte.toString(16).padStart(2, "0")).join("");
    if (hex !== "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad") throw new Error("Hash mismatch");
    this.record(`Web Crypto: PASS (random ${random.length / 2} bytes; SHA-256 known vector)`);
  }

  async http(): Promise<void> {
    const response = await requestUrl({ url: PUBLIC_URL, method: "GET", throw: false });
    const data: unknown = JSON.parse(response.text);
    const valid = response.status === 200 && typeof data === "object" && data !== null && "issuer" in data && data.issuer === "https://accounts.google.com";
    this.record(`Native public HTTP: ${valid ? "PASS" : "FAIL"}; status ${response.status}. Auth and conditional writes untested.`);
  }

  async exportReport(): Promise<void> {
    for (const path of ["Tests", REPORT_ROOT]) {
      const existing = this.app.vault.getAbstractFileByPath(path);
      if (!existing) await this.app.vault.createFolder(path);
      else if (!(existing instanceof TFolder)) throw new Error("Report folder collision");
    }
    const platform = Platform.isIosApp ? "iOS" : Platform.isAndroidApp ? "Android" : "Desktop";
    const reportPath = `${REPORT_ROOT}/Lab Result ${Date.now()}-${randomHex().slice(0, 8)}.md`;
    const content = [
      "# Calendar Lab device results", "",
      `Plugin: ${this.manifest.version}; Obsidian: ${apiVersion}; platform: ${platform}`,
      `Timezone: ${Intl.DateTimeFormat().resolvedOptions().timeZone}`,
      "OS version: fill in manually. Calendar client/version: fill in manually.", "",
      "This report contains only explicit probe outcomes from this plugin session. OAuth occurs only when explicitly started. No calendar API writes are implemented.", "",
      ...this.outcomes.map(line => `- ${line}`), "",
      "Manual observations: record whether the external browser opened, which vault received the callback, and whether app restart/backgrounding behaved as expected.", "",
      "Untested outcomes must not be inferred from other passes. Persistent credential storage, ETags, conflict recovery, cancellation, and notifications remain pending.", "",
    ].join("\n");
    const file = await this.app.vault.create(reportPath, content);
    if (file instanceof TFile) await this.app.workspace.getLeaf(false).openFile(file);
  }
}

class LabModal extends Modal {
  constructor(private readonly lab: CalendarLab) { super(lab.app); }

  onOpen(): void {
    const root = this.contentEl;
    root.createEl("h2", { text: "Calendar Lab" });
    root.createEl("p", { text: "Device and optional Google authentication probes. No task changes or calendar events. Results and login credentials stay in memory; export results before restarting." });
    const status = root.createEl("p", { text: "Choose a probe." });
    const action = (name: string, run: () => void | Promise<void>) => {
      const button = root.createEl("button", { text: name });
      button.addEventListener("click", () => {
        button.disabled = true;
        void (async () => {
          try { await run(); status.setText(`${name}: finished. See the notice or export results.`); }
          catch { this.lab.record(`${name}: FAIL (details intentionally omitted)`); status.setText(`${name}: failed.`); }
          finally { button.disabled = false; }
        })();
      });
    };
    root.createEl("h3", { text: "Google authentication lab" });
    root.createEl("p", { text: "Use your own deployed Calendar Lab service. Enter its HTTPS address and separate lab access key (never your Google client secret). Credentials are sent to that service and kept only for this Obsidian session." });
    const serviceUrl = root.createEl("input", { attr: { type: "url", placeholder: "https://morning-os-calendar-lab-auth.YOUR-SUBDOMAIN.workers.dev", "aria-label": "Auth service URL" } });
    const serviceKey = root.createEl("input", { attr: { type: "password", autocomplete: "off", placeholder: "Lab access key", "aria-label": "Lab access key" } });
    action("Use service for this session", () => { this.lab.auth.configure(serviceUrl.value, serviceKey.value); serviceKey.value = ""; });
    const googleLinks = root.createDiv();
    const showGoogleLink = () => {
      googleLinks.empty();
      const url = this.lab.auth.loginUrl;
      if (url) {
        googleLinks.createEl("a", { text: "Open Google consent in browser", href: url, attr: { target: "_blank", rel: "noopener noreferrer" } });
        googleLinks.createEl("p", { text: "Use Safari/your external browser. After consent, tap Open Obsidian. If needed, return here and complete the pending login manually." });
      }
    };
    action("Prepare Google login", async () => { await this.lab.auth.start(this.app.vault.getName()); showGoogleLink(); });
    action("Complete pending login", async () => { await this.lab.auth.complete(undefined, undefined, true); showGoogleLink(); });
    action("Test token refresh", () => this.lab.auth.refresh());
    root.createEl("p", { text: "Revocation removes this Google app's authorization and can affect other test devices using the same Google account and OAuth client." });
    action("Revoke Google authorization", () => this.lab.auth.revoke());
    action("Forget local login and service key", () => {
      this.lab.auth.clear(); serviceKey.value = ""; showGoogleLink();
      this.lab.record("Local login forgotten. This does not revoke Google authorization; use Google Account connections if needed.");
    });
    showGoogleLink();
    root.createEl("h3", { text: "Device and synthetic probes" });
    action("Test Web Crypto", () => this.lab.capabilities());
    root.createEl("p", { text: "The next probe makes one unauthenticated GET to Google's public identity configuration. It sends no vault content or credentials." });
    action("Test native HTTP", () => this.lab.http());
    root.createEl("a", { text: "Open public Google configuration in browser", href: PUBLIC_URL, attr: { target: "_blank", rel: "noopener noreferrer" } });
    root.createEl("p", { text: "Observe whether the link opens Safari/your external browser or an internal viewer. This is a manual result." });
    action("Write restart marker", () => {
      this.app.saveLocalStorage(MARKER_KEY, "synthetic-marker-v1");
      this.lab.record("Non-secret device-local marker written; restart Obsidian then check it.");
    });
    action("Check restart marker", () => {
      this.lab.record(`Device-local marker: ${this.app.loadLocalStorage(MARKER_KEY) === "synthetic-marker-v1" ? "present" : "absent"}. This is not a credential storage test.`);
    });
    action("Clear restart marker", () => {
      this.app.saveLocalStorage(MARKER_KEY, null);
      this.lab.record("Non-secret device-local marker cleared.");
    });
    const links = root.createDiv();
    const showSyntheticLinks = () => {
      links.empty();
      if (!this.lab.syntheticLinks) return;
      const { state, vault } = this.lab.syntheticLinks;
      links.createEl("p", { text: "Valid for 2 minutes. Copy a URI into the external browser to test handoff, or tap to test in-app routing. Try wrong state first, valid next, then valid again to test replay. Reopening this panel keeps a pending session; starting again replaces it. Never paste real OAuth codes here." });
      const addLink = (name: string, value: string, vaultName = vault) => {
        const uri = `obsidian://${ACTION}?vault=${encodeURIComponent(vaultName)}&state=${encodeURIComponent(value)}`;
        links.createEl("p", { text: name });
        const field = links.createEl("textarea", { attr: { readonly: "", rows: "3", "aria-label": name } });
        field.value = uri;
        field.addEventListener("click", () => field.select());
        links.createEl("a", { text: `Open ${name}`, href: uri });
      };
      addLink("Wrong-state callback", "synthetic-wrong-state");
      addLink("Valid callback (repeat to test replay)", state);
    };
    action("Start synthetic callback session", () => {
      const state = randomHex();
      const vault = this.app.vault.getName();
      this.lab.session.start(state, vault, Date.now());
      this.lab.syntheticLinks = { state, vault };
      showSyntheticLinks();
      this.lab.record("Synthetic callback session started; expires after 2 minutes.");
    });
    showSyntheticLinks();
    root.createEl("p", { text: "For cold-start testing: copy a valid URI, fully close Obsidian, then open the URI. Expected: no-session, because the probe intentionally retains no login session on disk. A timeout must report expired. Export before closing the app to preserve earlier outcomes." });
    action("Export sanitized results", () => this.lab.exportReport());
  }

  onClose(): void { this.contentEl.empty(); }
}
