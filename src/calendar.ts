// Deliberately bounded lab: one calendar, one event, explicit actions only.
export type Reply = { status: number; data: unknown };
export type CalendarRequest = { method: string; path: string; body?: Record<string, unknown>; etag?: string };
type Retired = { event: string; start: string; end: string; attempted: boolean; observed: boolean; cancel: true };
type Journal = { version: 1; owner: string; calendar?: string; creating: boolean; event: string; start: string; end: string; attempted: boolean; observed: boolean; cancel: boolean; retired?: Retired[] };
type Store = { read(): unknown; write(value: Journal): void };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid record");
  return value as Record<string, unknown>;
}
function hex(): string { return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""); }
// Calendar API timestamps are absolute instants with a local offset, not task-day strings.
function timestamp(ms: number): string {
  const d = new Date(ms), pad = (n: number) => String(n).padStart(2, "0"), offset = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
export class CalendarProbe {
  private busy = false;
  private stopped = false;
  constructor(private readonly transport: (request: CalendarRequest) => Promise<Reply>, private readonly store: Store, private readonly report: (message: string) => void) {}
  stop(): void { this.stopped = true; }
  async freshEvent(): Promise<void> {
    await this.run(async () => {
      const j = await this.ownedCalendar();
      if (!j.cancel || !j.attempted) { this.report("Fresh test blocked: finish cancellation of the current attempted event first. No changes made."); return; }
      const response = await this.request({ method: "GET", path: `${this.path(j)}/${j.event}` });
      const cancelled = response.status === 200 && record(response.data).id === j.event && record(response.data).status === "cancelled";
      if (!cancelled && response.status !== 404 && response.status !== 410) {
        this.report(`Fresh test blocked: old event not confirmed absent/cancelled (HTTP ${response.status}). Recover pending cancellation first. No changes made.`); return;
      }
      const retired = [...(j.retired ?? []), { event: j.event, start: j.start, end: j.end, attempted: j.attempted, observed: j.observed, cancel: true as const }];
      if (retired.length > 100) throw new Error("History limit reached");
      const next: Journal = { ...j, retired, event: "moslab" + hex(), start: timestamp(Date.now() + 600000), end: timestamp(Date.now() + 900000), attempted: false, observed: false, cancel: false };
      // Archive and allocate the next identity in one journal write. No provider writes here.
      this.save(next);
      if (JSON.stringify(this.load()) !== JSON.stringify(next)) throw new Error("Journal readback failed");
      this.report(`Fresh event test prepared: PASS; ${retired.length} cancelled event record(s) retained. Same dedicated calendar; new identity. Now create the notification event or simulate a lost reply.`);
    });
  }
  details(): string {
    const j = this.load();
    if (!j) return "No saved calendar test.";
    return `Calendar: Morning OS Calendar Lab ${j.owner.slice(0, 8)}. Saved start: ${j.start}; end: ${j.end}; requested alert: ${timestamp(Date.parse(j.start) - 60000)}. Event attempted: ${j.attempted}; observed active: ${j.observed}; recreation blocked: ${j.cancel}. These are saved values, not a live provider check.`;
  }
  async inspectEvent(): Promise<void> {
    await this.run(async () => {
      this.report(this.details());
      const j = await this.ownedCalendar();
      if (!j.attempted) { this.report("Inspection: no event creation attempted."); return; }
      const response = await this.request({ method: "GET", path: `${this.path(j)}/${j.event}` });
      if (response.status === 200) {
        const e = record(response.data);
        if (e.id !== j.event) throw new Error("Unexpected event identity");
        if (e.status === "cancelled") { this.report("Read-only inspection: HTTP 200; saved event has cancelled status. No writes made."); return; }
        this.ownedEvent(j, e);
        this.report("Read-only inspection: HTTP 200; saved owned event is active. No writes made."); return;
      }
      this.report(`Read-only inspection: HTTP ${response.status}; ${response.status === 410 ? "event endpoint returned Gone" : response.status === 404 ? "event not found or inaccessible" : "provider request unsuccessful"}. No writes made. This status alone does not identify who cancelled an event.`);
    });
  }
  private load(): Journal | null {
    const raw = this.store.read();
    if (raw === null || raw === undefined) return null;
    const j = record(raw);
    if (j.version !== 1 || typeof j.owner !== "string" || !/^[a-f0-9]{32}$/.test(j.owner) ||
        typeof j.event !== "string" || !/^moslab[a-f0-9]{32}$/.test(j.event) ||
        typeof j.creating !== "boolean" || typeof j.attempted !== "boolean" || typeof j.observed !== "boolean" || typeof j.cancel !== "boolean" ||
        typeof j.start !== "string" || !Number.isFinite(Date.parse(j.start)) ||
        typeof j.end !== "string" || !Number.isFinite(Date.parse(j.end)) ||
        (j.calendar !== undefined && (typeof j.calendar !== "string" || !j.calendar.endsWith("@group.calendar.google.com")))) throw new Error("Invalid journal");
    if (j.retired !== undefined) {
      if (!Array.isArray(j.retired) || j.retired.length > 100) throw new Error("Invalid retired records");
      const seen = new Set<string>([String(j.event)]);
      for (const raw of j.retired) {
        const r = record(raw);
        if (typeof r.event !== "string" || !/^moslab[a-f0-9]{32}$/.test(r.event) || seen.has(r.event) ||
            r.cancel !== true || typeof r.attempted !== "boolean" || typeof r.observed !== "boolean" ||
            typeof r.start !== "string" || !Number.isFinite(Date.parse(r.start)) ||
            typeof r.end !== "string" || !Number.isFinite(Date.parse(r.end))) throw new Error("Invalid retired record");
        seen.add(r.event);
      }
    }
    return j as Journal;
  }
  private save(j: Journal): void { this.store.write(j); }
  private async request(request: CalendarRequest): Promise<Reply> {
    if (this.stopped) throw new Error("Stopped");
    const response = await this.transport(request);
    if (this.stopped) throw new Error("Stopped");
    return response;
  }
  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy || this.stopped) { this.report("Calendar probe unavailable: another action is running or the plugin stopped."); return; }
    this.busy = true;
    try { await work(); }
    catch { if (!this.stopped) this.report("Calendar probe: FAIL or outcome unknown. Journal retained; retry recovery. No provider details logged."); }
    finally { this.busy = false; }
  }
  private path(j: Journal): string {
    if (!j.calendar) throw new Error("No calendar");
    return `/calendars/${encodeURIComponent(j.calendar)}/events`;
  }
  private marker(j: Journal): string { return `Morning OS Calendar Lab owner=${j.owner}`; }
  private async ownedCalendar(): Promise<Journal> {
    const j = this.load();
    if (!j?.calendar) throw new Error("Create calendar first");
    const response = await this.request({ method: "GET", path: `/calendars/${encodeURIComponent(j.calendar)}` });
    if (response.status !== 200 || record(response.data).id !== j.calendar || record(response.data).description !== this.marker(j)) throw new Error("Calendar ownership mismatch");
    return j;
  }
  private ownedEvent(j: Journal, data: unknown): Record<string, unknown> {
    const e = record(data);
    if (e.id !== j.event || e.status === "cancelled" || typeof e.etag !== "string" || !e.etag ||
        record(record(e.extendedProperties).private).mosLabOwner !== j.owner ||
        (Array.isArray(e.attendees) && e.attendees.length > 0) || e.recurrence) throw new Error("Event ownership or shape mismatch");
    return e;
  }
  private body(j: Journal): Record<string, unknown> {
    return { id: j.event, summary: "Morning OS Calendar Lab notification test", description: "Disposable lab event. No Morning OS task content.",
      start: { dateTime: j.start }, end: { dateTime: j.end }, transparency: "transparent",
      extendedProperties: { private: { mosLabOwner: j.owner } }, reminders: { useDefault: false, overrides: [{ method: "popup", minutes: 1 }] } };
  }
  async createCalendar(): Promise<void> {
    await this.run(async () => {
      if (this.load()) { this.report("Calendar journal already exists. Reuse it; an uncertain calendar creation must be inspected manually, never automatically repeated."); return; }
      const j: Journal = { version: 1, owner: hex(), creating: true, event: "moslab" + hex(), start: timestamp(Date.now() + 600000), end: timestamp(Date.now() + 900000), attempted: false, observed: false, cancel: false };
      this.save(j); // Persist intent before the non-idempotent calendar POST.
      const response = await this.request({ method: "POST", path: "/calendars", body: { summary: `Morning OS Calendar Lab ${j.owner.slice(0, 8)}`, description: this.marker(j) } });
      if (response.status !== 200) { this.report(`Calendar creation unconfirmed (HTTP ${response.status}). Do not repeat blindly; inspect Google Calendar.`); return; }
      const data = record(response.data);
      if (typeof data.id !== "string" || !data.id.endsWith("@group.calendar.google.com") || data.description !== this.marker(j)) throw new Error("Invalid calendar response");
      j.calendar = data.id; j.creating = false; this.save(j);
      this.report(`Dedicated calendar creation: PASS. Calendar name: Morning OS Calendar Lab ${j.owner.slice(0, 8)}.`);
    });
  }
  async recoverCalendar(id: string): Promise<void> {
    await this.run(async () => {
      const j = this.load();
      if (!j || j.calendar || !j.creating || !id.trim().endsWith("@group.calendar.google.com")) throw new Error("No uncertain creation");
      const response = await this.request({ method: "GET", path: `/calendars/${encodeURIComponent(id.trim())}` });
      if (response.status !== 200 || record(response.data).id !== id.trim() || record(response.data).description !== this.marker(j)) throw new Error("Unowned calendar");
      j.calendar = id.trim(); j.creating = false; this.save(j); this.report("Uncertain calendar creation recovered by exact ownership marker: PASS.");
    });
  }
  async createEvent(discardResponse = false): Promise<void> {
    await this.run(async () => {
      const j = await this.ownedCalendar();
      if (j.cancel) { this.report("Event creation blocked by persisted cancellation intent. No resurrection attempted."); return; }
      if (j.attempted) { this.report("Event creation was already attempted. Use Recover event; the stored ID will be reused."); return; }
      j.start = timestamp(Date.now() + 600000); j.end = timestamp(Date.now() + 900000); j.attempted = true; this.save(j);
      const response = await this.request({ method: "POST", path: this.path(j), body: this.body(j) });
      if (discardResponse) { this.report("Event creation response intentionally discarded. Use Recover event to inspect the saved ID; this simulates a lost reply, not a real network outage."); return; }
      if (response.status !== 200 && response.status !== 201) throw new Error("Insert unconfirmed");
      this.ownedEvent(j, response.data);
      j.observed = true; this.save(j);
      this.report(`Event creation: PASS. Starts ${j.start}; popup requested one minute before. Notification delivery requires manual observation.`);
    });
  }
  async recoverEvent(): Promise<void> {
    await this.run(async () => {
      const j = await this.ownedCalendar();
      if (j.cancel) { await this.cancelOwned(j); return; }
      if (!j.attempted) throw new Error("Create event first");
      let response = await this.request({ method: "GET", path: `${this.path(j)}/${j.event}` });
      if (response.status === 404) {
        if (j.observed) {
          j.cancel = true; this.save(j); this.report("Previously observed event is absent; recreation blocked. Inspect provider state manually."); return;
        }
        // Retry exactly the same identity and payload. Never allocate another ID on conflict.
        response = await this.request({ method: "POST", path: this.path(j), body: this.body(j) });
        if (response.status === 409) response = await this.request({ method: "GET", path: `${this.path(j)}/${j.event}` });
      }
      if (response.status === 410 || (response.status === 200 && record(response.data).status === "cancelled")) {
        j.cancel = true; this.save(j);
        this.report(response.status === 410 ? "Event recovery: HTTP 410 Gone; recreation blocked as a precaution. Cause unverified." : "Event recovery: HTTP 200 with cancelled status; recreation blocked."); return;
      }
      if (response.status !== 200 && response.status !== 201) throw new Error("Recovery unconfirmed");
      this.ownedEvent(j, response.data); j.observed = true; this.save(j);
      this.report("Event recovery: PASS; owned event found at the original stored ID. Inspect the calendar manually for duplicate alerts.");
    });
  }
  async staleWrites(): Promise<void> {
    await this.run(async () => {
      const j = await this.ownedCalendar(); if (j.cancel) { this.report("ETag test blocked: saved event is fenced against recreation. Inspect saved event first; no ETag requests sent."); return; }
      const path = `${this.path(j)}/${j.event}`;
      const initial = await this.request({ method: "GET", path }); if (initial.status !== 200) throw new Error("Missing event");
      const old = this.ownedEvent(j, initial.data), summary = `Morning OS Calendar Lab revision ${hex().slice(0, 8)}`;
      const update = await this.request({ method: "PATCH", path, etag: String(old.etag), body: { summary } });
      if (update.status !== 200) throw new Error("Conditional update failed");
      const current = this.ownedEvent(j, update.data); if (current.etag === old.etag) throw new Error("ETag unchanged");
      const stale = await this.request({ method: "PATCH", path, etag: String(old.etag), body: { summary: "STALE WRITE SHOULD NOT APPLY" } });
      if (stale.status !== 412) { this.report(`Stale PATCH: FAIL; expected 412, got ${stale.status}. Stop testing and inspect the disposable event.`); return; }
      const staleDelete = await this.request({ method: "DELETE", path, etag: String(old.etag) });
      if (staleDelete.status !== 412) { this.report(`Stale DELETE: FAIL; expected 412, got ${staleDelete.status}. Stop testing and inspect the disposable event.`); return; }
      const final = await this.request({ method: "GET", path });
      if (final.status !== 200 || this.ownedEvent(j, final.data).summary !== summary) throw new Error("Latest update lost");
      this.report("ETag probes: PASS; fresh PATCH succeeded, stale PATCH and DELETE rejected with 412, latest event preserved. Simulated clients on one device only.");
    });
  }
  async cancelEvent(interrupt = false): Promise<void> {
    await this.run(async () => {
      const j = this.load(); if (!j?.calendar) throw new Error("No calendar");
      j.cancel = true; this.save(j); // Durable local intent precedes any provider request.
      if (interrupt) { this.report("Cancellation intent saved; no provider request sent. Restart, restore login, then Recover event to resume cancellation."); return; }
      await this.cancelOwned(await this.ownedCalendar());
    });
  }
  private async cancelOwned(j: Journal): Promise<void> {
    const path = `${this.path(j)}/${j.event}`, response = await this.request({ method: "GET", path });
    if (response.status === 404 || response.status === 410 || (response.status === 200 && record(response.data).status === "cancelled")) {
      this.report("Cancellation recovery: PASS; event already absent/cancelled. Local cancellation intent retained."); return;
    }
    if (response.status !== 200) throw new Error("Cancellation read failed");
    const event = this.ownedEvent(j, response.data);
    const deleted = await this.request({ method: "DELETE", path, etag: String(event.etag) });
    if (deleted.status !== 204) { this.report(`Cancellation unconfirmed (HTTP ${deleted.status}); intent retained. Retry Recover event.`); return; }
    const check = await this.request({ method: "GET", path });
    if (check.status !== 404 && check.status !== 410 && !(check.status === 200 && record(check.data).status === "cancelled")) throw new Error("Deletion not confirmed");
    this.report("Cancellation: PASS; conditional deletion verified. Local intent prevents this lab from recreating the event; cross-device ordering remains unproven.");
  }
}
