import { Modal, Notice, Platform, Plugin, TFile, TFolder, apiVersion, requestUrl } from "obsidian";
import { ProbeSession } from "./session";

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

  onload(): void {
    this.registerObsidianProtocolHandler(ACTION, params => {
      const result = this.session.receive(params.state, params.vault, Date.now());
      this.record(`Synthetic callback: ${result}`);
    });
    this.addCommand({ id: "open-lab", name: "Open device test panel", callback: () => new LabModal(this).open() });
  }

  onunload(): void {
    this.session.clear();
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
      "This report contains only explicit probe outcomes from this plugin session. No OAuth or calendar writes were performed.", "",
      ...this.outcomes.map(line => `- ${line}`), "",
      "Manual observations: record whether the external browser opened, which vault received the callback, and whether app restart/backgrounding behaved as expected.", "",
      "Pending: actual Google login, credential storage, ETags, conflict recovery, cancellation, and notifications.", "",
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
    root.createEl("p", { text: "Synthetic device probes only. No Google login, task changes, or calendar events. Results remain in memory until you export them." });
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
    action("Start synthetic callback session", () => {
      const state = randomHex();
      const vault = this.app.vault.getName();
      this.lab.session.start(state, vault, Date.now());
      links.empty();
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
      this.lab.record("Synthetic callback session started; expires after 2 minutes.");
    });
    root.createEl("p", { text: "For cold-start testing: copy a valid URI, fully close Obsidian, then open the URI. Expected: no-session, because the probe intentionally retains no login session on disk. A timeout must report expired. Export before closing the app to preserve earlier outcomes." });
    action("Export sanitized results", () => this.lab.exportReport());
  }

  onClose(): void { this.contentEl.empty(); }
}
