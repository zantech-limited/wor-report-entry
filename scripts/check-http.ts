import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { blankLine } from "../src/lib/model";
import { parseWorkbook } from "../src/lib/excel";

const base = "http://127.0.0.1:43124";
let cookie = "";
async function request(route: string, body?: unknown, method = "POST") {
  const response = await fetch(base + route, body === undefined ? { headers: { cookie } } : {
    method, headers: { cookie, origin: base, "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const data = await response.json();
  assert(response.ok, `${route}: ${response.status}: ${JSON.stringify(data)}`);
  return data;
}
async function main() {
  assert(process.env.ADMIN_TEST_TOKEN, "Use the isolated review container token.");
  await request("/api/admin/session");
  const denied = await fetch(base + "/api/admin");
  assert.equal(denied.status, 401);
  for (const kind of ["parts", "technicians", "prefixes"]) {
    assert.equal((await fetch(base + `/api/admin/${kind}`)).status, 200, `${kind} must be readable without signing in`);
    assert.equal((await fetch(base + `/api/admin/${kind}`, { method: "POST", headers: {origin: base, "Content-Type": "application/json"}, body: "{}" })).status, 401, `${kind} edits must require Admin`);
  }
  const session = await fetch(base + "/api/admin/session", { method: "POST", headers: { origin: base, "Content-Type": "application/json" }, body: JSON.stringify({ token: process.env.ADMIN_TEST_TOKEN }) });
  assert.equal(session.status, 200);
  cookie = session.headers.get("set-cookie")!.split(";")[0];
  assert(session.headers.get("set-cookie")!.includes("HttpOnly"));
  for (const engine of ["sqlite", "mysql", "postgres"]) {
    await request('/api/admin/storage', {action: 'test', config: {
      engine, host: engine === 'mysql' ? 'mysql' : 'postgres', port: engine === 'mysql' ? 3306 : 5432,
      database: 'service_report', username: 'service_desk', password: 'local-test-password', tls: false,
    }});
  }
  assert.equal((await fetch(base + '/api/admin/parts', {method:'POST', headers:{cookie,origin:'http://foreign.example','Content-Type':'application/json'},body:'{}'})).status, 403);
  for (const month of ["April", "May", "Jun", "July", "Aug"]) {
    const filename = `Monthly Service Report Timothy Adams ${month} 26.xlsm`;
    const existing = (await request("/api/reports")).reports.find((r: {sourceFilename: string}) => r.sourceFilename === filename);
    if (existing) continue;
    const form = new FormData();
    form.set("file", new File([readFileSync(path.join("Z:/", filename))], filename));
    const response = await fetch(base + "/api/import", { method: "POST", body: form });
    const result = await response.json();
    assert(response.ok, JSON.stringify(result));
    assert(result.lineCount > 100);
    console.log(`Docker imported ${month}: ${result.lineCount} jobs`);
  }
  await request("/api/admin/parts", { partNo: "REVIEW-PART", description: "Review replacement", defaultQty: "2", active: true });
  assert((await request("/api/parts")).parts.some((p: {partNo: string}) => p.partNo === "REVIEW-PART"));
  await request("/api/admin/technicians", { name: "Review assistant", active: true });
  const {id} = await request("/api/reports", {});
  const report = (await request(`/api/reports/${id}`)).report;
  const wor = `REVIEW-WOR-${id}`;
  const serial = `REVIEW-SERIAL-${id}`;
  report.lines = [
    { ...blankLine("1"), no: "55", wor, serialNo: serial, customer: "Review fixture", technician: "Review primary", secondaryTech: "Review assistant", date: "2026-10-05", arrivalTime: "09:00", departureTime: "11:30", partNo: "A\nREVIEW-PART", description: "First\nReview replacement", qty: "1\n2" },
    { ...blankLine("2"), no: "55", wor: "OTHER-WOR", serialNo: "OTHER-SERIAL", customer: "Unrelated No. 55", date: "2026-10-05" },
  ];
  await request(`/api/reports/${id}`, report, "PUT");
  await request("/api/admin/technicians", { name: "Review assistant", active: false });
  assert(!(await request("/api/suggestions")).techs.includes("Review assistant"));
  assert.equal((await request(`/api/reports/${id}`)).report.lines[0].secondaryTech, "Review assistant");
  await request("/api/admin/technicians", { name: "Review assistant", active: true });
  await request("/api/admin/prefixes", { reportId: id, prefix: "TST", model: "Review model", action: "save" });
  assert((await request(`/api/admin/prefixes?report=${id}`)).prefixes.some((p: {prefix: string}) => p.prefix === "TST"));
  await request("/api/admin/prefixes", { reportId: id, prefix: "TST", action: "remove" });
  const none = await request(`/api/duplicates?report=${id}&wor=NONEXISTENT&serial=NONEXISTENT`);
  assert.equal(none.matches.length, 0);
  const dup = await request(`/api/duplicates?report=other&wor=${wor}&serial=${serial}`);
  assert.equal(dup.total, 1, "No. column incorrectly matched the other visit.");
  assert(dup.matches[0].workbook.endsWith(".xlsm"));
  assert.deepEqual(dup.counts, {wor: 1, serial: 1});
  assert.deepEqual((await request('/api/duplicates?wor=N%2FA&serial=n%2Fa')).counts, {wor: 0, serial: 0});
  const extraId = (await request('/api/reports', {})).id;
  try {
    const extra = (await request(`/api/reports/${extraId}`)).report;
    extra.lines = Array.from({length: 55}, (_, i) => ({...blankLine(String(i + 1)), wor, serialNo: i < 52 ? serial : 'N/A'}));
    await request(`/api/reports/${extraId}`, extra, 'PUT');
    const capped = await request(`/api/duplicates?report=${id}&wor=${wor}&serial=${serial}`);
    assert.equal(capped.matches.length, 50);
    assert.equal(capped.total, 55);
    assert.deepEqual(capped.counts, {wor: 55, serial: 52});
  } finally {
    await request(`/api/reports/${extraId}`, {}, 'DELETE');
  }
  const exported = await fetch(base + `/api/reports/${id}/export`);
  assert(exported.ok);
  const parsed = await parseWorkbook(Buffer.from(await exported.arrayBuffer()));
  assert.equal(parsed.lines[0].partNo, "A\nREVIEW-PART");
  assert.equal(parsed.lines[0].description, "First\nReview replacement");
  const backup = await request("/api/admin/backup");
  assert(backup.reports.length >= 6);
  const admin = await request("/api/admin");
  assert(!JSON.stringify(admin).includes(process.env.ADMIN_TEST_TOKEN!));
  console.log(`Docker HTTP checks passed: auth, five imports, catalogs, historical technician retention, prefix edits, duplicate workbook references/No. exclusion, multiline export, backup and logs. Fixture report: ${id}`);
}
main().catch(e => { console.error(e); process.exit(1); });
