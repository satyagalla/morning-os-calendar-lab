import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({ entryPoints: ["src/session.ts"], bundle: true, format: "esm", platform: "browser", write: false });
const { ProbeSession } = await import(`data:text/javascript;base64,${Buffer.from(result.outputFiles[0].text).toString("base64")}`);
let passed = 0;
function check(name, run) { run(); passed++; console.log(`PASS ${name}`); }
check("unsolicited callback", () => assert.equal(new ProbeSession().receive("s", "OS", 0), "no-session"));
check("valid callback accepted once", () => {
  const s = new ProbeSession(); s.start("s", "OS", 0);
  assert.equal(s.receive("s", "OS", 1), "accepted");
  assert.equal(s.receive("s", "OS", 2), "no-session");
});
check("wrong or missing state cannot consume valid session", () => {
  const s = new ProbeSession(); s.start("s", "OS", 0);
  assert.equal(s.receive(undefined, "OS", 1), "wrong-state");
  assert.equal(s.receive("other", "OS", 1), "wrong-state");
  assert.equal(s.receive("s", "OS", 1), "accepted");
});
check("wrong or missing vault rejected", () => {
  const s = new ProbeSession(); s.start("s", "OS", 0);
  assert.equal(s.receive("s", "Other", 1), "wrong-vault");
  assert.equal(s.receive("s", undefined, 1), "wrong-vault");
});
check("expiry boundary invalidates session", () => {
  const s = new ProbeSession(); s.start("s", "OS", 0);
  assert.equal(s.receive("s", "OS", 120000), "expired");
  assert.equal(s.receive("s", "OS", 120001), "no-session");
});
check("replacement rejects previous state", () => {
  const s = new ProbeSession(); s.start("old", "OS", 0); s.start("new", "OS", 1);
  assert.equal(s.receive("old", "OS", 2), "wrong-state");
  assert.equal(s.receive("new", "OS", 2), "accepted");
});
check("unload invalidates pending callback", () => {
  const s = new ProbeSession(); s.start("s", "OS", 0); s.clear();
  assert.equal(s.receive("s", "OS", 1), "no-session");
});
console.log(`${passed} session checks passed. Actual device behavior remains untested.`);
