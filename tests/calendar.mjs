import assert from "node:assert/strict";
import { build } from "esbuild";
const result = await build({ entryPoints: ["src/calendar.ts"], bundle: true, format: "esm", platform: "browser", write: false });
const { CalendarProbe } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
let passed = 0;
async function check(name, run) { await run(); passed++; console.log(`PASS ${name}`); }
function fixture() {
  let journal = null, calendar = null, event = null, revision = 0;
  const calls = [], log = [];
  let intercept = async () => undefined;
  const store = { read: () => structuredClone(journal), write: value => { journal = structuredClone(value); } };
  const transport = async request => {
    calls.push(structuredClone(request));
    const override = await intercept(request); if (override) return override;
    const { path, method, etag, body } = request;
    if (path === "/calendars") {
      assert.ok(journal.creating); calendar = { ...body, id: "test@group.calendar.google.com" };
      return { status: 200, data: calendar };
    }
    if (!path.includes("/events")) return { status: 200, data: calendar };
    if (method === "GET") return event ? { status: 200, data: structuredClone(event) } : { status: 404, data: {} };
    if (method === "POST") {
      assert.ok(journal.attempted); assert.equal(body.id, journal.event);
      if (event) return { status: 409, data: {} };
      event = { ...structuredClone(body), etag: `"${++revision}"`, status: "confirmed" };
      return { status: 200, data: structuredClone(event) };
    }
    assert.ok(etag); if (etag !== event?.etag) return { status: 412, data: {} };
    if (method === "PATCH") { event = { ...event, ...body, etag: `"${++revision}"` }; return { status: 200, data: structuredClone(event) }; }
    if (method === "DELETE") { assert.ok(journal.cancel); event = null; return { status: 204, data: null }; }
    throw new Error("Unexpected request");
  };
  const make = () => new CalendarProbe(transport, store, value => log.push(value));
  return { make, calls, log, store, intercept: fn => { intercept = fn; }, event: () => event, setEvent: value => { event = value; } };
}
await check("only dedicated owned calendar; repeat creation blocked", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createCalendar();
  assert.equal(f.calls.length, 1); assert.ok(f.log[0].includes("PASS"));
  await p.createEvent(); assert.equal(f.event().reminders.overrides[0].minutes, 1);
  assert.equal(f.event().transparency, "transparent"); assert.equal(f.event().attendees, undefined);
});
await check("lost calendar reply is never blindly retried; exact marker recovery", async () => {
  const f = fixture(); f.intercept(async r => r.path === "/calendars" ? Promise.reject(new Error("Lost")) : undefined);
  await f.make().createCalendar(); await f.make().createCalendar();
  assert.equal(f.calls.length, 1);
  f.intercept(async () => ({ status: 200, data: { id: "test@group.calendar.google.com", description: "unowned" } }));
  await f.make().recoverCalendar("test@group.calendar.google.com"); assert.equal(f.store.read().calendar, undefined);
  f.intercept(async () => ({ status: 200, data: { id: "test@group.calendar.google.com", description: `Morning OS Calendar Lab owner=${f.store.read().owner}` } }));
  await f.make().recoverCalendar("test@group.calendar.google.com"); assert.ok(f.store.read().calendar);
});
await check("discarded insert reply recovered after restart with no duplicate POST", async () => {
  const f = fixture(); await f.make().createCalendar(); await f.make().createEvent(true); await f.make().recoverEvent();
  assert.equal(f.calls.filter(r => r.path.endsWith("/events") && r.method === "POST").length, 1);
  assert.ok(f.log.some(s => s.includes("Event recovery: PASS")));
});
await check("failed insert retried at same ID; conflict resolves through owned GET", async () => {
  const f = fixture(); await f.make().createCalendar();
  f.intercept(async r => r.method === "POST" ? Promise.reject(new Error("offline")) : undefined);
  await f.make().createEvent(); const id = f.store.read().event;
  f.intercept(async () => undefined); await f.make().recoverEvent(); assert.equal(f.event().id, id);
  f.store.write({ ...f.store.read(), observed: false }); // Model an insert accepted before its reply was observed.
  let once = true;
  f.intercept(async r => { if (r.path.includes("/events/") && r.method === "GET" && once) { once = false; return { status: 404, data: {} }; } });
  await f.make().recoverEvent(); assert.equal(f.event().id, id); assert.ok(f.log.at(-1).includes("PASS"));
});
await check("fresh and stale PATCH preserve newest event without any DELETE", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent(); await p.staleWrites();
  assert.ok(f.log.at(-1).includes("ETag probes: PASS")); assert.ok(f.event().summary.includes("revision"));
  assert.equal(f.calls.filter(r => r.method === "DELETE").length, 0);
});
await check("interrupted cancellation survives restart and prevents recreation", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent(); await p.cancelEvent(true);
  assert.ok(f.event()); const restored = f.make(); await restored.recoverEvent(); assert.equal(f.event(), null);
  const before = f.calls.filter(r => r.method === "POST").length; await restored.createEvent(); await restored.recoverEvent();
  assert.equal(f.calls.filter(r => r.method === "POST").length, before); assert.equal(f.store.read().cancel, true);
});
await check("unknown deletion outcome recovers absence with persisted intent", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent();
  f.intercept(async r => { if (r.method === "DELETE") { f.setEvent(null); throw new Error("lost reply"); } });
  await p.cancelEvent(); assert.ok(f.store.read().cancel);
  f.intercept(async () => undefined); await f.make().recoverEvent(); assert.ok(f.log.at(-1).includes("already absent"));
});
await check("provider deletion after successful observation never recreates event", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent(); f.setEvent(null);
  const before = f.calls.filter(r => r.method === "POST").length; await p.recoverEvent();
  assert.equal(f.calls.filter(r => r.method === "POST").length, before); assert.ok(f.store.read().cancel);
});
await check("delete conflict preserves cancellation intent for a fresh retry", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent();
  f.intercept(async r => r.method === "DELETE" ? { status: 412, data: {} } : undefined);
  await p.cancelEvent(); assert.ok(f.event()); assert.ok(f.store.read().cancel);
  f.intercept(async () => undefined); await f.make().recoverEvent(); assert.equal(f.event(), null);
});
await check("ownership mismatch and added attendees block writes", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent();
  const original = structuredClone(f.event()); f.setEvent({ ...original, extendedProperties: { private: { mosLabOwner: "other" } } });
  await p.cancelEvent(); assert.ok(f.event()); assert.equal(f.calls.filter(r => r.method === "DELETE").length, 0);
  f.setEvent({ ...original, attendees: [{ email: "guest@example.invalid" }] }); await p.recoverEvent();
  assert.equal(f.calls.filter(r => r.method === "DELETE").length, 0);
});
await check("malformed journal blocks all calls; storage failure blocks writes", async () => {
  let calls = 0;
  const p = new CalendarProbe(async () => { calls++; }, { read: () => ({ version: 99 }), write() {} }, () => {});
  await p.createCalendar(); await p.createEvent(); assert.equal(calls, 0);
  const q = new CalendarProbe(async () => { calls++; }, { read: () => null, write() { throw new Error("full"); } }, () => {});
  await q.createCalendar(); assert.equal(calls, 0);
});
await check("unload prevents follow-up requests from pending response", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent();
  let release; f.intercept(async r => r.method === "GET" ? new Promise(resolve => { release = resolve; }) : undefined);
  const pending = p.staleWrites(); await Promise.resolve(); p.stop(); release({ status: 200, data: {} }); await pending;
  assert.equal(f.calls.filter(r => r.method === "PATCH").length, 0);
});
await check("saved timing is available offline; read-only inspection never changes journal", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent();
  const saved = f.store.read(), before = f.calls.length;
  assert.ok(p.details().includes(saved.start)); assert.ok(p.details().includes("requested alert"));
  assert.equal(f.calls.length, before); await p.inspectEvent();
  assert.deepEqual(f.store.read(), saved); assert.ok(f.calls.slice(before).every(r => r.method === "GET"));
  assert.ok(f.log.at(-1).includes("active"));
});
await check("inspection distinguishes cancelled status, Gone and other failures without writes", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent();
  for (const reply of [{ status: 410, data: {} }, { status: 403, data: { secret: "never-log" } },
    { status: 200, data: { id: f.store.read().event, status: "cancelled" } }]) {
    f.intercept(async r => r.path.includes("/events/") ? reply : undefined);
    const saved = f.store.read(), before = f.calls.length; await p.inspectEvent();
    assert.deepEqual(f.store.read(), saved); assert.ok(f.calls.slice(before).every(r => r.method === "GET"));
    assert.ok(f.log.at(-1).includes(`HTTP ${reply.status}`)); assert.ok(!f.log.join().includes("never-log"));
  }
});
await check("fresh test archives cancelled identity atomically and reuses calendar after restart", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent(); await p.cancelEvent();
  const old = f.store.read(), before = f.calls.length; await p.freshEvent();
  const next = f.store.read(); assert.notEqual(next.event, old.event); assert.equal(next.calendar, old.calendar);
  assert.equal(next.retired[0].event, old.event); assert.equal(next.retired[0].cancel, true);
  assert.equal(next.attempted, false); assert.equal(next.cancel, false); assert.ok(f.calls.slice(before).every(r => r.method === "GET"));
  await f.make().createEvent(true); await f.make().recoverEvent(); assert.equal(f.event().id, next.event);
  assert.equal(f.store.read().retired[0].event, old.event);
});
await check("fresh test blocks active event, auth failures and repeated preparation", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent(); await p.cancelEvent(true);
  const saved = f.store.read(); await p.freshEvent(); assert.deepEqual(f.store.read(), saved);
  f.intercept(async r => r.path.includes("/events/") ? { status: 403, data: {} } : undefined);
  await p.freshEvent(); assert.deepEqual(f.store.read(), saved);
  f.intercept(async () => undefined); await p.recoverEvent(); await p.freshEvent();
  const fresh = f.store.read(); await p.freshEvent(); assert.deepEqual(f.store.read(), fresh);
});
await check("fresh test retains journal when archive storage fails", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent(); await p.cancelEvent();
  const saved = f.store.read(); f.store.write = () => { throw new Error("full"); };
  await p.freshEvent(); assert.deepEqual(f.store.read(), saved); assert.ok(!f.log.at(-1).includes("prepared: PASS"));
});
await check("batch tests conflicts on sacrificial identity and preserves updated notification", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar();
  assert.equal(await p.batch(), true);
  assert.equal(f.store.read().retired.length, 1);
  assert.equal(f.store.read().cancel, false);
  assert.equal(f.event().summary, "Morning OS Calendar Lab UPDATED notification");
  assert.ok(f.log.some(s => s.includes("stale DELETE: PASS")));
  assert.ok(f.log.some(s => s.includes("duplicate identity: PASS")));
  assert.equal(f.calls.filter(r => r.method === "POST" && r.path.endsWith("/events")).length, 3);
});
await check("batch records ignored stale DELETE without destroying notification identity", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar();
  let ignored = false;
  f.intercept(async r => {
    if (r.method === "DELETE" && r.etag !== f.event()?.etag && !ignored) {
      ignored = true; f.setEvent(null); return { status: 204, data: null };
    }
  });
  assert.equal(await p.batch(), true);
  assert.ok(f.log.some(s => s.includes("stale DELETE: FAIL")));
  assert.ok(f.event()); assert.notEqual(f.event().id, f.store.read().retired[0].event);
  await p.cancelEvent(true); await f.make().recoverEvent(); assert.equal(f.event(), null);
});
await check("batch unknown insert stops and leaves original ID recoverable", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar();
  f.intercept(async r => { if (r.method === "POST" && r.path.endsWith("/events")) throw new Error("offline"); });
  assert.equal(await p.batch(), false); const id = f.store.read().event;
  assert.ok(f.store.read().attempted); assert.equal(f.calls.filter(r => r.method === "PATCH").length, 0);
  f.intercept(async () => undefined); await p.recoverEvent(); assert.equal(f.event().id, id);
});
await check("batch reschedule failure retains attempted notification for recovery", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar();
  f.intercept(async r => r.method === "PATCH" && r.body?.start ? { status: 503, data: {} } : undefined);
  assert.equal(await p.batch(), false); assert.ok(f.event()); assert.ok(f.store.read().attempted);
  assert.ok(!f.log.some(s => s.includes("Batch reschedule: PASS")));
});
await check("restart completion requires saved cancellation and verified provider absence", async () => {
  const f = fixture(), p = f.make(); await p.createCalendar(); await p.createEvent();
  assert.equal(await p.verifyCancellation(), false);
  await p.cancelEvent(true); assert.equal(p.cancellationSaved(), true);
  assert.equal(await f.make().verifyCancellation(), false);
  await f.make().recoverEvent(); assert.equal(await f.make().verifyCancellation(), true);
  f.intercept(async r => r.path.includes("/events/") ? { status: 403, data: {} } : undefined);
  assert.equal(await f.make().verifyCancellation(), false);
});
console.log(`${passed} calendar checks passed (mocked Google; live provider behavior remains untested).`);
