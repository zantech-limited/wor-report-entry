import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { parseWorkbook, writeWorkbook } from "../src/lib/excel";
import { blankLine, type Report } from "../src/lib/model";

async function main() {
const source = readFileSync("templates/monthly-service-report.xlsm");
const parsed = await parseWorkbook(source);

function assert(cond: unknown, message: string) {
  if (!cond) throw new Error(message);
}

assert(parsed.lines.length === 173, `expected 173 lines, got ${parsed.lines.length}`);
assert(parsed.preparedBy === "Denys Kowlessar", parsed.preparedBy);
assert(parsed.prefixMap.length === 148, `prefixes ${parsed.prefixMap.length}`);
assert(parsed.lines[0]?.customer === "Mt. Hope Secondary School", parsed.lines[0]?.customer ?? "");
assert(parsed.lines[0]?.date === "2026-08-12", parsed.lines[0]?.date ?? "");
assert(parsed.lines[0]?.arrivalTime === "12:00", parsed.lines[0]?.arrivalTime ?? "");
assert(parsed.lines[0]?.departureTime === "13:40", parsed.lines[0]?.departureTime ?? "");
assert(parsed.lines[0]?.serialNo === "4TV00762", parsed.lines[0]?.serialNo ?? "");
assert(parsed.prefixMap.some((entry) => entry.prefix === "4TV" && entry.model === "IR ADV DX 4845i"), "4TV map");
assert(parsed.directory.customers.get("Swissport") === 15, "swissport count");
assert(parsed.directory.locations.get("Swissport")?.get("Piarco") === 15, "swissport site");
assert((parsed.directory.locations.get("Tatil")?.size ?? 0) > 1, "tatil sites");
assert(parsed.directory.techs.has("Reggie"), "reggie");
assert(parsed.directory.techs.has("Joel"), "joel from master 2");
assert(parsed.directory.customers.has("Future Fishers"), "weekly customer");

const report: Report = {
  id: "test",
  title: "Monthly Service Report",
  preparedBy: "Timothy Adams",
  sourceFilename: "sample.xlsm",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  prefixMap: [...parsed.prefixMap, { prefix: "ZZZ", model: "Test Model" }],
  lines: [
    ...parsed.lines.slice(0, 2),
    {
      ...blankLine("900"),
      wor: "99999",
      date: "2026-08-20",
      customer: "Harbour Books",
      location: "San Juan",
      serviceType: "PM",
      slaType: "Rental",
      modelNo: "IR ADV DX 4845i",
      serialNo: "4TV99999",
      copycount: "10",
      technician: "Reggie",
      secondaryTech: "Andre",
      arrivalTime: "09:15",
      departureTime: "10:45",
      partsRequired: "No",
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
assert(again.lines.length === 3, `exported lines ${again.lines.length}`);
assert(again.lines[2]?.customer === "Harbour Books", again.lines[2]?.customer ?? "");
assert(again.lines[2]?.location === "San Juan", again.lines[2]?.location ?? "");
assert(again.lines[2]?.technician === "Reggie", again.lines[2]?.technician ?? "");
assert(again.lines[2]?.secondaryTech === "Andre", again.lines[2]?.secondaryTech ?? "");
assert(again.lines[0]?.modelNo === "IR ADV DX 4845i", again.lines[0]?.modelNo ?? "");
assert(again.prefixMap.some((entry) => entry.prefix === "ZZZ"), "new prefix");
assert(again.prefixMap.length === 149, `prefix length ${again.prefixMap.length}`);

const masterName = "xl/worksheets/sheet9.xml";
const masterXml = await zip.file(masterName)!.async("string");
assert(masterXml.includes("Time Taken") || masterXml.includes("Harbour Books"), "master body");
assert(masterXml.includes("Table2[[#This Row],[Departure Time]]"), "time formula");
assert(masterXml.includes("(C7)") || masterXml.includes("C7"), "month formula");

console.log("roundtrip ok", out.length);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
