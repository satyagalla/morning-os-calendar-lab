// Deliberately bounded lab: one calendar, one event, explicit actions only.
export type Reply = { status: number; data: unknown };
export type CalendarRequest = { method: string; path: string; body?: Record<string, unknown>; etag?: string };
type Retired = { event: string; start: string; end: string; attempted: boolean; observed: boolean; cancel: true };
type Journal = { version: 1; owner: string; calendar?: string; creating: boolean; event: string; start: string; end: string; attempted: boolean; observed: boolean; cancel: boolean; retired?: Retired[] };
type Store = { read(): unknown; write(value: Journal): void };
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new ProbeError("Invalid record");
  return value as Record<string, unknown>;
}
function hex(): string { return Array.from(crypto.getRandomValues(new Uint8Array(16)), b => b.toString(16).padStart(2, "0")).join(""); }
// Calendar API timestamps are absolute instants with a local offset, not task-day strings.
function timestamp(ms: number): string {
  const d = new Date(ms), pad = (n: number) => String(n).padStart(2, "0"), offset = -d.getTimezoneOffset();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}${offset >= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(offset) / 60))}:${pad(Math.abs(offset) % 60)}`;
}
class ProbeError extends Error {}
export class CalendarProbe {
  private phase = "calendar action";
  private lastRequest = "no provider request";
  private busy = false;
  private stopped = false;
  constructor(private readonly transport: (request: CalendarRequest) => Promise<Reply>, private readonly store: Store, private readonly report: (message: string) => void) {}
  stop(): void { this.stopped = true; }
  cancellationSaved(): boolean { return this.load()?.cancel === true; }
  async verifyCancellation(): Promise<boolean> {
    let confirmed = false;
    await this.run(async () => {
      const j = await this.ownedCalendar();
      if (!j.cancel || !j.attempted) throw new ProbeError("No cancellation checkpoint");
      const r = await this.request({ method: "GET", path: `${this.path(j)}/${j.event}` });
      confirmed = r.status === 404 || r.status === 410 || (r.status === 200 && record(r.data).id === j.event && record(r.data).status === "cancelled");
    });
    return confirmed;
  }
  async batch(): Promise<boolean> {
    let completed = false;
    await this.run(async () => {
      this.phase = "verify dedicated calendar";
      let j = await this.ownedCalendar();
      const allocate = () => {
        const retired = j.attempted ? [...(j.retired ?? []), { event: j.event, start: j.start, end: j.end, attempted: j.attempted, observed: j.observed, cancel: true as const }] : j.retired;
        if ((retired?.length ?? 0) > 100) throw new ProbeError("History limit");
        j = { ...j, retired, event: "moslab" + hex(), attempted: false, observed: false, cancel: false,
          start: timestamp(Date.now() + 600000), end: timestamp(Date.now() + 900000) };
        this.save(j);
        if (this.load()?.event !== j.event) throw new ProbeError("Storage readback");
      };
      const get = () => this.request({ method: "GET", path: `${this.path(j)}/${j.event}` });
      const finish = async () => {
        j.cancel = true; this.save(j);
        await this.cancelOwned(j);
      };
      if (j.attempted) { this.phase = "recover previous event cancellation"; await finish(); allocate(); }
      else allocate();
      this.phase = "sacrificial insert and recovery";
      // This event is sacrificial; a broken DELETE precondition cannot remove the notification event.
      j.attempted = true; this.save(j);
      await this.request({ method: "POST", path: this.path(j), body: this.body(j) });
      const recovered = await get();
      if (recovered.status !== 200) throw new ProbeError("Insert recovery failed");
      const a = this.ownedEvent(j, recovered.data); j.observed = true; this.save(j);
      this.report("Batch lost insert reply: PASS; response discarded, original identity recovered. Simulation only.");
      this.phase = "duplicate identity probe";
      const duplicate = await this.request({ method: "POST", path: this.path(j), body: this.body(j) });
      if (duplicate.status !== 409) throw new ProbeError("Duplicate identity not rejected");
      this.report("Batch duplicate identity: PASS; second insert rejected with 409.");
      const path = `${this.path(j)}/${j.event}`;
      const summary = "Morning OS Calendar Lab batch newer revision";
      this.phase = "conditional PATCH probes";
      const updated = await this.request({ method: "PATCH", path, etag: String(a.etag), body: { summary } });
      if (updated.status !== 200 || this.ownedEvent(j, updated.data).etag === a.etag) throw new ProbeError("Update failed");
      const stale = await this.request({ method: "PATCH", path, etag: String(a.etag), body: { summary: "STALE" } });
      if (stale.status !== 412) throw new ProbeError("Stale PATCH accepted");
      const newest = await get();
      if (newest.status !== 200 || this.ownedEvent(j, newest.data).summary !== summary) throw new ProbeError("Newest revision lost");
      this.report("Batch sequential stale PATCH: PASS; 412 and newest revision preserved. Not a two-device ordering test.");
      j.cancel = true; this.save(j);
      this.phase = "sacrificial stale DELETE probe";
      const staleDelete = await this.request({ method: "DELETE", path, etag: String(a.etag) });
      this.report(`Batch sacrificial stale DELETE: ${staleDelete.status === 412 ? "PASS" : "FAIL"}; expected 412, got ${staleDelete.status}. Header echo is a separate transport diagnostic.`);
      if (staleDelete.status !== 412 && staleDelete.status !== 204) throw new ProbeError("Unexpected DELETE outcome");
      if (staleDelete.status === 412) {
        const preserved = await get();
        if (preserved.status !== 200 || this.ownedEvent(j, preserved.data).summary !== summary) throw new ProbeError("Delete preservation failed");
      }
      this.phase = "confirm sacrificial cancellation";
      await finish();
      this.report("Batch cancellation and absence recovery: PASS; tombstone retained. Restart recovery checkpoint still required.");
      this.phase = "notification insert";
      allocate(); j.attempted = true; this.save(j);
      const inserted = await this.request({ method: "POST", path: this.path(j), body: this.body(j) });
      if (inserted.status !== 200 && inserted.status !== 201) throw new ProbeError("Notification insert failed");
      const notification = this.ownedEvent(j, inserted.data);
      // Move the original alert away, leaving only the updated alert to observe.
      const oldAlert = timestamp(Date.parse(j.start) - 60000);
      const start = timestamp(Date.now() + 180000), end = timestamp(Date.now() + 480000);
      this.phase = "notification reschedule";
      const moved = await this.request({ method: "PATCH", path: `${this.path(j)}/${j.event}`, etag: String(notification.etag),
        body: { summary: "Morning OS Calendar Lab UPDATED notification", start: { dateTime: start }, end: { dateTime: end } } });
      if (moved.status !== 200) throw new ProbeError("Reschedule failed");
      const e = this.ownedEvent(j, moved.data);
      if (record(e.start).dateTime !== start && Date.parse(String(record(e.start).dateTime)) !== Date.parse(start)) throw new ProbeError("Incorrect schedule");
      j.start = start; j.end = end; j.observed = true; this.save(j);
      this.report(`Batch reschedule: PASS; updated alert ${timestamp(Date.parse(start) - 60000)}; superseded alert ${oldAlert} must not fire. Observe on iPhone and PC.`);
      this.report(this.details()); completed = true;
    });
    return completed;
  }
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
      if (retired.length > 100) throw new ProbeError("History limit reached");
      const next: Journal = { ...j, retired, event: "moslab" + hex(), start: timestamp(Date.now() + 600000), end: timestamp(Date.now() + 900000), attempted: false, observed: false, cancel: false };
      // Archive and allocate the next identity in one journal write. No provider writes here.
      this.save(next);
      if (JSON.stringify(this.load()) !== JSON.stringify(next)) throw new ProbeError("Journal readback failed");
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
        if (e.id !== j.event) throw new ProbeError("Unexpected event identity");
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
        (j.calendar !== undefined && (typeof j.calendar !== "string" || !j.calendar.endsWith("@group.calendar.google.com")))) throw new ProbeError("Invalid journal");
    if (j.retired !== undefined) {
      if (!Array.isArray(j.retired) || j.retired.length > 100) throw new ProbeError("Invalid retired records");
      const seen = new Set<string>([String(j.event)]);
      for (const raw of j.retired) {
        const r = record(raw);
        if (typeof r.event !== "string" || !/^moslab[a-f0-9]{32}$/.test(r.event) || seen.has(r.event) ||
            r.cancel !== true || typeof r.attempted !== "boolean" || typeof r.observed !== "boolean" ||
            typeof r.start !== "string" || !Number.isFinite(Date.parse(r.start)) ||
            typeof r.end !== "string" || !Number.isFinite(Date.parse(r.end))) throw new ProbeError("Invalid retired record");
        seen.add(r.event);
      }
    }
    return j as Journal;
  }
  private save(j: Journal): void { this.store.write(j); }
  private async request(request: CalendarRequest): Promise<Reply> {
    if (this.stopped) throw new ProbeError("Stopped");
    const endpoint = request.path.includes("/events/") ? "event" : request.path.endsWith("/events") ? "events" : request.path === "/calendars" ? "calendars" : "calendar";
    this.lastRequest = `${request.method} ${endpoint}: no HTTP response received`;
    const response = await this.transport(request);
    this.lastRequest = `${request.method} ${endpoint}: HTTP ${Number.isInteger(response.status) ? response.status : "unknown"}`;
    if (this.stopped) throw new ProbeError("Stopped");
    return response;
  }
  private async run(work: () => Promise<void>): Promise<void> {
    if (this.busy || this.stopped) { this.report("Calendar probe unavailable: another action is running or the plugin stopped."); return; }
    this.busy = true;
    this.phase = "calendar action"; this.lastRequest = "no provider request";
    try { await work(); }
    catch (error: unknown) {
      if (!this.stopped) this.report(`Calendar probe: FAIL or outcome unknown; phase: ${this.phase}; ${this.lastRequest}; check: ${error instanceof ProbeError ? error.message : "transport or storage failure (details omitted)"}. Journal retained; no automatic retry.`);
    }
    finally { this.busy = false; }
  }
  private path(j: Journal): string {
    if (!j.calendar) throw new ProbeError("No calendar");
    return `/calendars/${encodeURIComponent(j.calendar)}/events`;
  }
  private marker(j: Journal): string { return `Morning OS Calendar Lab owner=${j.owner}`; }
  private async ownedCalendar(): Promise<Journal> {
    const j = this.load();
    if (!j?.calendar) throw new ProbeError("Create calendar first");
    const response = await this.request({ method: "GET", path: `/calendars/${encodeURIComponent(j.calendar)}` });
    if (response.status !== 200 || record(response.data).id !== j.calendar || record(response.data).description !== this.marker(j)) throw new ProbeError("Calendar ownership mismatch");
    return j;
  }
  private ownedEvent(j: Journal, data: unknown): Record<string, unknown> {
    const e = record(data);
    if (e.id !== j.event || e.status === "cancelled" || typeof e.etag !== "string" || !e.etag ||
        record(record(e.extendedProperties).private).mosLabOwner !== j.owner ||
        (Array.isArray(e.attendees) && e.attendees.length > 0) || e.recurrence) throw new ProbeError("Event ownership or shape mismatch");
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
      if (typeof data.id !== "string" || !data.id.endsWith("@group.calendar.google.com") || data.description !== this.marker(j)) throw new ProbeError("Invalid calendar response");
      j.calendar = data.id; j.creating = false; this.save(j);
      this.report(`Dedicated calendar creation: PASS. Calendar name: Morning OS Calendar Lab ${j.owner.slice(0, 8)}.`);
    });
  }
  async recoverCalendar(id: string): Promise<void> {
    await this.run(async () => {
      const j = this.load();
      if (!j || j.calendar || !j.creating || !id.trim().endsWith("@group.calendar.google.com")) throw new ProbeError("No uncertain creation");
      const response = await this.request({ method: "GET", path: `/calendars/${encodeURIComponent(id.trim())}` });
      if (response.status !== 200 || record(response.data).id !== id.trim() || record(response.data).description !== this.marker(j)) throw new ProbeError("Unowned calendar");
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
      if (response.status !== 200 && response.status !== 201) throw new ProbeError("Insert unconfirmed");
      this.ownedEvent(j, response.data);
      j.observed = true; this.save(j);
      this.report(`Event creation: PASS. Starts ${j.start}; popup requested one minute before. Notification delivery requires manual observation.`);
    });
  }
  async recoverEvent(): Promise<void> {
    await this.run(async () => {
      const j = await this.ownedCalendar();
      if (j.cancel) { await this.cancelOwned(j); return; }
      if (!j.attempted) throw new ProbeError("Create event first");
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
      if (response.status !== 200 && response.status !== 201) throw new ProbeError("Recovery unconfirmed");
      this.ownedEvent(j, response.data); j.observed = true; this.save(j);
      this.report("Event recovery: PASS; owned event found at the original stored ID. Inspect the calendar manually for duplicate alerts.");
    });
  }
  async staleWrites(): Promise<void> {
    await this.run(async () => {
      const j = await this.ownedCalendar(); if (j.cancel) { this.report("ETag test blocked: saved event is fenced against recreation. Inspect saved event first; no ETag requests sent."); return; }
      const path = `${this.path(j)}/${j.event}`;
      const initial = await this.request({ method: "GET", path }); if (initial.status !== 200) throw new ProbeError("Missing event");
      const old = this.ownedEvent(j, initial.data), summary = `Morning OS Calendar Lab revision ${hex().slice(0, 8)}`;
      const update = await this.request({ method: "PATCH", path, etag: String(old.etag), body: { summary } });
      if (update.status !== 200) throw new ProbeError("Conditional update failed");
      const current = this.ownedEvent(j, update.data); if (current.etag === old.etag) throw new ProbeError("ETag unchanged");
      const stale = await this.request({ method: "PATCH", path, etag: String(old.etag), body: { summary: "STALE WRITE SHOULD NOT APPLY" } });
      if (stale.status !== 412) { this.report(`Stale PATCH: FAIL; expected 412, got ${stale.status}. Stop testing and inspect the disposable event.`); return; }
      const final = await this.request({ method: "GET", path });
      if (final.status !== 200 || this.ownedEvent(j, final.data).summary !== summary) throw new ProbeError("Latest update lost");
      this.report("ETag probes: PASS for PATCH only; fresh PATCH succeeded, stale PATCH rejected with 412, latest event preserved. DELETE probe disabled after live iOS returned 204 for a stale ETag. Conditional DELETE remains unsafe/unverified.");
    });
  }
  async cancelEvent(interrupt = false): Promise<void> {
    await this.run(async () => {
      const j = this.load(); if (!j?.calendar) throw new ProbeError("No calendar");
      j.cancel = true; this.save(j); // Durable local intent precedes any provider request.
      if (interrupt) { this.report("Cancellation intent saved; no provider request sent. Restart, restore login, then Recover event to resume cancellation."); return; }
      await this.cancelOwned(await this.ownedCalendar());
    });
  }
  private async cancelOwned(j: Journal): Promise<void> {
    if (!j.cancel) throw new ProbeError("Cancellation intent missing");
    const path = `${this.path(j)}/${j.event}`;
    const absent = (r: Reply) => r.status === 404 || r.status === 410 ||
      (r.status === 200 && record(r.data).id === j.event && record(r.data).status === "cancelled");
    for (let attempt = 1; attempt <= 3; attempt++) {
      const response = await this.request({ method: "GET", path });
      if (absent(response)) {
        this.report("Cancellation recovery: PASS; event already absent/cancelled. Local cancellation intent retained."); return;
      }
      if (response.status !== 200) throw new ProbeError("Cancellation read failed");
      // Explicit disposal of this lab identity remains intended after a revision change.
      // Revalidate ownership and shape on every retry; never remove If-Match.
      const event = this.ownedEvent(j, response.data);
      const deleted = await this.request({ method: "DELETE", path, etag: String(event.etag) });
      if (deleted.status === 412) {
        this.report(`Cancellation revision conflict: HTTP 412; attempt ${attempt}/3. ${attempt < 3 ? "Re-read and revalidate before retry." : "Stopping; intent retained."}`);
        if (attempt === 3) throw new ProbeError("Cancellation conflict retry limit");
        continue;
      }
      if (deleted.status !== 204 && deleted.status !== 404 && deleted.status !== 410) throw new ProbeError("Cancellation delete failed");
      const check = await this.request({ method: "GET", path });
      if (!absent(check)) throw new ProbeError("Deletion not confirmed");
      this.report("Cancellation: PASS; deletion and provider absence verified. DELETE precondition safety and cross-device ordering remain unproven."); return;
    }
  }
}
