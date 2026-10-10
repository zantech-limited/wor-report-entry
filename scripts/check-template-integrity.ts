import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { parseWorkbook, writeWorkbook } from "../src/lib/excel";
import { blankLine } from "../src/lib/model";

async function checkPackage(bytes: Buffer) {
  const zip = await JSZip.loadAsync(bytes);
  for (const name of Object.keys(zip.files)) {
    if (!name.startsWith("xl/pivotCache/") || !name.endsWith(".xml")) continue;
    const xml = await zip.file(name)!.async("string");
    const fields = xml.match(/<cacheFields\b[^>]*count="(\d+)"[^>]*>([\s\S]*?)<\/cacheFields>/);
    if (fields) {
      assert.equal([...fields[2].matchAll(/<cacheField\b/g)].length, Number(fields[1]), `${name}: missing pivot cache fields`);
    }
    const records = xml.match(/<pivotCacheRecords\b[^>]*count="(\d+)"[^>]*(?:\/>|>([\s\S]*?)<\/pivotCacheRecords>)/);
    if (records) {
      assert.equal([...(records[2] ?? "").matchAll(/<r(?:\s|>)/g)].length, Number(records[1]), `${name}: missing cache records`);
    }
  }
  assert(!zip.file("xl/calcChain.xml"), "Blank template must not contain a stale calculation chain");
  return zip;
}

async function main() {
  const bytes = readFileSync(process.argv[2] ?? "templates/monthly-service-report.xlsm");
  const source = await checkPackage(bytes);
  const parsed = await parseWorkbook(bytes);
  assert.equal(parsed.lines.length, 0);
  assert.equal(parsed.directory.customers.size, 0);
  assert.equal(parsed.directory.techs.size, 0);
  assert.equal(parsed.prefixMap.length, 148);
  const report = {
    id: "template-regression", createdAt: "", updatedAt: "", sourceFilename: null,
    title: parsed.title, preparedBy: "Timothy Adams", prefixMap: parsed.prefixMap,
    lines: [{ ...blankLine("1"), wor: "TEST-SEP", date: "2026-09-10", customer: "Template test", arrivalTime: "09:00", departureTime: "10:00" }],
  };
  for (const lines of [[], report.lines]) {
    const exported = await writeWorkbook(bytes, { ...report, lines });
    const zip = await checkPackage(exported);
    assert.deepEqual((await parseWorkbook(exported)).lines.map(line => ({ ...line, id: "" })), lines.map(line => ({ ...line, id: "" })));
    assert((await zip.file("xl/vbaProject.bin")!.async("nodebuffer")).equals(await source.file("xl/vbaProject.bin")!.async("nodebuffer")), "Macros changed during export");
  }
  console.log("Template integrity passed: complete pivot fields and records; blank and populated exports preserve data, prefixes and macros.");
}
main().catch(error => { console.error(error); process.exit(1); });
