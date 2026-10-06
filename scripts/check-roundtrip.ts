import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { parseWorkbook, writeWorkbook } from "../src/lib/excel";
import { blankLine, type Report } from "../src/lib/model";
import { formatCopycount } from "../src/lib/copycount";

async function main() {
const source = readFileSync("templates/monthly-service-report.xlsm");
const parsed = await parseWorkbook(source);

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

assert(parsed.lines.length === 0, `blank template should have no work orders, got ${parsed.lines.length}`);
assert(parsed.preparedBy === "Denys Kowlessar", parsed.preparedBy);
assert(parsed.prefixMap.length === 148, `prefixes ${parsed.prefixMap.length}`);
assert(parsed.prefixMap.some((entry) => entry.prefix === "4TV" && entry.model === "IR ADV DX 4845i"), "4TV map");
assert(!parsed.directory.customers.has("Swissport"), "template still has Swissport");
assert(!parsed.directory.customers.has("Tatil"), "template still has Tatil");
assert(!parsed.directory.techs.has("Reggie"), "template still has a saved technician");

const report: Report = {
  id: "test",
  title: "Monthly Service Report",
  preparedBy: "Timothy Adams",
  sourceFilename: "sample.xlsm",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  prefixMap: [...parsed.prefixMap, { prefix: "ZZZ", model: "Test Model" }],
  lines: [
    {
      ...blankLine("1"),
      wor: "99999",
      copycount: "1,234,567",
      date: "2026-08-20",
      customer: "Harbour Books",
      location: "San Juan",
      serviceType: "PM",
      slaType: "Rental",
      modelNo: "IR ADV DX 4845i",
      serialNo: "4TV99999",
      technician: "Reggie",
      secondaryTech: "Andre",
      arrivalTime: "09:15",
      departureTime: "10:45",
      partsRequired: "No",
      partNo: "PART-001\nPART-002",
      description: "First part\nSecond part",
      qty: "1\n2",
      paymentMethod: "Cash",
      revenue: "350",
      jobStatus: "Completed",
    },
  ],
};

const out = await writeWorkbook(source, report);
const zip = await JSZip.loadAsync(out);
assert(zip.file("xl/vbaProject.bin"), "vba missing");
const originalVba = (await JSZip.loadAsync(source)).file("xl/vbaProject.bin");
const nextVba = zip.file("xl/vbaProject.bin");
if (!originalVba || !nextVba) throw new Error("vba files");
const a = Buffer.from(await originalVba.async("uint8array"));
const b = Buffer.from(await nextVba.async("uint8array"));
assert(a.equals(b), "vba bytes changed");
assert(!zip.file("xl/calcChain.xml"), "calc chain should be dropped");

const workbookXml = await zip.file("xl/workbook.xml")!.async("string");
for (const name of ["Master", "PrefixMap", "Service Type Dist.", "Weekly update", "Master (2)"]) {
  assert(workbookXml.includes(`name="${name}"`), `missing sheet ${name}`);
}

const again = await parseWorkbook(out);
assert(again.preparedBy === "Timothy Adams", again.preparedBy);
assert(again.lines.length === 1, `exported lines ${again.lines.length}`);
assert(again.lines[0]?.copycount === "1234567", "copycount must remain numeric in Excel");
assert(formatCopycount('1234567') === '1,234,567', "copycount comma formatting");
assert(again.lines[0]?.customer === "Harbour Books", again.lines[0]?.customer ?? "");
assert(again.lines[0]?.location === "San Juan", again.lines[0]?.location ?? "");
assert(again.lines[0]?.technician === "Reggie", again.lines[0]?.technician ?? "");
assert(again.lines[0]?.secondaryTech === "Andre", again.lines[0]?.secondaryTech ?? "");
assert(again.lines[0]?.partNo === "PART-001\nPART-002", "multiline part numbers changed");
assert(again.lines[0]?.description === "First part\nSecond part", "multiline descriptions changed");
assert(again.lines[0]?.qty === "1\n2", "multiline quantities changed");
assert(again.lines[0]?.modelNo === "IR ADV DX 4845i", again.lines[0]?.modelNo ?? "");
assert(again.prefixMap.some((entry) => entry.prefix === "ZZZ"), "new prefix");
assert(again.prefixMap.length === 149, `prefix length ${again.prefixMap.length}`);

const masterName = "xl/worksheets/sheet9.xml";
const masterXml = await zip.file(masterName)!.async("string");
const copyCell = masterXml.match(/<c r="[A-Z]+\d+"[^>]*s="(\d+)"[^>]*><v>1234567<\/v><\/c>/);
assert(copyCell, "copycount numeric cell/style");
const stylesXml = await zip.file('xl/styles.xml')!.async('string');
const xfs = [...stylesXml.match(/<cellXfs[^>]*>([\s\S]*?)<\/cellXfs>/)![1].matchAll(/<xf\b[^>]*\/>|<xf\b[^>]*>[\s\S]*?<\/xf>/g)];
assert(xfs[Number(copyCell![1])][0].includes('numFmtId="3"'), "copycount uses #,##0 Excel formatting");
assert(masterXml.includes("Time Taken") || masterXml.includes("Harbour Books"), "master body");
assert(masterXml.includes("Table2[[#This Row],[Departure Time]]"), "time formula");
assert(masterXml.includes("(C7)") || masterXml.includes("C7"), "month formula");

console.log("roundtrip ok", out.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
