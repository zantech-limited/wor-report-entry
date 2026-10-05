import assert from "node:assert/strict";
import { blankLine } from "../src/lib/model";
import { applyPartLine } from "../src/lib/parts-model";
async function main() {
  assert(process.env.DATA_DIR?.includes('.checks'));
  const {createBlankReport,saveReport,getReport} = await import('../src/lib/db');
  const {listParts,savePart,partUsage} = await import('../src/lib/parts');
  const {database} = await import('../src/lib/storage');
  const report = await createBlankReport();
  report.lines=[{...blankLine('1'),partNo:'P1\nP2',description:'Black Drum\nRoller',qty:'5\n2'},
    {...blankLine('2'),partNo:'P1',description:'Drum Unit Black',qty:'3'},
    {...blankLine('3'),partNo:'N/A',description:'Nothing'}];
  await saveReport(report.id,report);
  let part=(await listParts()).find(p=>p.partNo==='P1')!;
  assert.equal(part.usageCount,2);
  assert.equal((await partUsage()).totalUses,3);
  assert.equal(part.needsConsolidation,true);
  assert.equal(part.descriptionVariants?.length,2);
  assert.equal(applyPartLine('P1','Old','9',0,{...part,defaultQty:'8'}).qty,'1');
  await savePart({...part,description:'Drum Unit Black',consolidate:true});
  part=(await listParts()).find(p=>p.partNo==='P1')!;
  assert.equal(part.description,'Drum Unit Black');
  assert.equal(part.needsConsolidation,false);
  assert.equal((await getReport(report.id))?.lines[0].description,'Black Drum\nRoller');
  assert.equal((await getReport(report.id))?.lines[0].qty,'5\n2');
  report.lines.push({...blankLine('4'),partNo:'P1',description:'New variation'});
  await saveReport(report.id,report);
  part=(await listParts()).find(p=>p.partNo==='P1')!;
  assert.equal(part.needsConsolidation,true);
  assert.equal(part.usageCount,3);
  await saveReport(report.id,report);
  assert.equal((await partUsage()).totalUses,4,'Saving again must not increment usage');
  console.log('parts usage passed: multiline occurrence counts, N/A exclusion, quantity 1, consolidation, unchanged history, new variation detection, no save double counting');
  await (await database()).close();
}
main().catch(e=>{console.error(e);process.exit(1)});
