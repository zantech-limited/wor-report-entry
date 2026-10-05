import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import JSZip from "jszip";
import { parseWorkbook, writeWorkbook } from "../src/lib/excel";
import type { Report } from "../src/lib/model";

async function main() {
  const filenames = ["Aug", "Jun", "July", "May", "April"].map(
    (month) => `Monthly Service Report Timothy Adams ${month} 26.xlsm`,
  );
  mkdirSync(".checks/exports", { recursive: true });
  for (const filename of filenames) {
    const source = readFileSync(path.join("Z:/", filename));
    const parsed = await parseWorkbook(source);
    const report: Report = {
      id: "roundtrip",
      title: parsed.title,
      preparedBy: parsed.preparedBy,
      sourceFilename: filename,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      prefixMap: parsed.prefixMap,
      lines: parsed.lines,
    };
    const output = await writeWorkbook(source, report);
    const again = await parseWorkbook(output);
    const withoutIds = (lines: typeof parsed.lines) =>
      lines.map((line) =>
        Object.fromEntries(
          Object.entries(line)
            .filter(([key]) => key !== "id")
            .map(([key, value]) => [
              key,
              ["copycount", "revenue"].includes(key) &&
              /^-?\d+(\.\d+)?$/.test(value)
                ? Number(value)
                : value,
            ]),
        ),
      );
    assert.deepEqual(
      withoutIds(again.lines),
      withoutIds(parsed.lines),
      `${filename}: changed work-order fields`,
    );
    assert.deepEqual(
      again.prefixMap,
      parsed.prefixMap,
      `${filename}: changed prefix map`,
    );
    const originalZip = await JSZip.loadAsync(source);
    const nextZip = await JSZip.loadAsync(output);
    const originalVba = originalZip.file("xl/vbaProject.bin");
    const nextVba = nextZip.file("xl/vbaProject.bin");
    assert(originalVba && nextVba, "Missing macros");
    assert(
      Buffer.from(await originalVba.async("uint8array")).equals(
        Buffer.from(await nextVba.async("uint8array")),
      ),
      "VBA changed",
    );
    writeFileSync(path.join(".checks/exports", filename), output);
    console.log(
      `${filename}: ${parsed.lines.length} orders; all fields, multiline cells, prefix map, and macros preserved`,
    );
  }
}
main().catch((error) => {
  console.error(error);
  process.exit(1);
});
