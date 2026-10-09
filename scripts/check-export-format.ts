import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import JSZip from "jszip";
import { workbookFileType, writeWorkbook, parseWorkbook } from "../src/lib/excel";

async function main() {
  const dir = process.argv[2];
  const files = dir ? readdirSync(dir).filter(name => /^export-\d+\.xlsm$/.test(name)).map(name => join(dir,name)) : ["templates/monthly-service-report.xlsm"];
  const kinds = { xlsm: 0, xlsx: 0 };
  for (const path of files) {
    const source = readFileSync(path);
    const format = await workbookFileType(source);
    kinds[format.extension as keyof typeof kinds]++;
    const parsed = await parseWorkbook(source);
    const output = await writeWorkbook(source, { id:"format-test",createdAt:"",updatedAt:"",sourceFilename:null,title:parsed.title,preparedBy:parsed.preparedBy,prefixMap:parsed.prefixMap,lines:parsed.lines });
    assert.deepEqual(await workbookFileType(output), format);
    const original = await JSZip.loadAsync(source);
    const rewritten = await JSZip.loadAsync(output);
    const vba = original.file("xl/vbaProject.bin");
    if (vba) assert((await vba.async("nodebuffer")).equals(await rewritten.file("xl/vbaProject.bin")!.async("nodebuffer")), "Macro bytes changed");
    assert.deepEqual((await parseWorkbook(output)).lines.map(line=>({...line,id:""})), parsed.lines.map(line=>({...line,id:""})));
  }
  console.log(`Export package checks passed: ${files.length} workbooks; ${kinds.xlsm} XLSM and ${kinds.xlsx} XLSX; format, work-order values and macro bytes preserved.`);
}
main().catch(error=>{console.error(error);process.exit(1)});
