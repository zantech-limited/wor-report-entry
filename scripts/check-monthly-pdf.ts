import assert from "node:assert/strict";
import {mkdirSync,readFileSync,writeFileSync} from "node:fs";
import {blankLine,newEntryLine,isBlankLine,timeTakenHours,type WorkEntry,type WorkOrder} from "../src/lib/model";
import {monthlyEntries,monthlyAnalysis} from "../src/lib/monthly-report";
import {createMonthlyPdf} from "../src/lib/report-pdf";
import {PDFDocument} from "pdf-lib";

async function main(){
  assert(isBlankLine(blankLine("1")));
  assert(isBlankLine(newEntryLine("2")));
  assert(!isBlankLine({...newEntryLine("3"),customer:"Actual customer"}));
  const entry:WorkEntry={...blankLine("1"),reportId:"test",lineIndex:0,monthLabel:"Sep 2026",workbookMonth:"2026-09",date:"2026-09-01",hours:2,revenue:10,customer:"Acme",technician:"Primary",secondaryTech:"Assistant",partNo:"P1\nP2",description:"First\nSecond",qty:"1\n2",ftf:"Yes"};
  const entries=[entry,{...entry,no:"2",date:"2026-09-30",technician:"assistant",secondaryTech:"Assistant",ftf:"N/A"},{...entry,no:"3",date:"2026-10-01"},{...entry,no:"4",date:"",hours:null}];
  assert.equal(monthlyEntries(entries,{month:"2026-09"}).length,2);
  assert.equal(monthlyEntries(entries,{month:"2026-09",includeUndated:true}).length,3);
  assert.equal(monthlyEntries(entries,{month:"2026-09",technician:"ASSISTANT"}).length,2);
  const analysis=monthlyAnalysis(monthlyEntries(entries,{month:"2026-09"}));
  assert.equal(analysis.hours,4);
  assert.equal(analysis.crew.find(row=>row.name.toLowerCase()==="assistant")?.hours,4);
  assert.equal(analysis.parts.find(row=>row.partNo==="P2")?.quantity,4);
  assert.equal(analysis.ftfYes,1);assert.equal(analysis.ftfNo,0);
  const stress=await createMonthlyPdf([{...entry,comments:"LONG NOTE ".repeat(2000),customer:"LongUnbrokenCustomerName".repeat(10)}],{month:"2026-09"});
  assert((await PDFDocument.load(stress)).getPageCount()>12);
  mkdirSync(".checks/monthly-pdf",{recursive:true});writeFileSync(".checks/monthly-pdf/stress.pdf",stress);
  const source=process.argv[2];
  if(source){const report=JSON.parse(readFileSync(source,"utf8"));const jobs=report.lines.filter((line:WorkOrder)=>!isBlankLine(line)).map((line:WorkOrder,lineIndex:number)=>({...line,reportId:report.id,lineIndex,monthLabel:"Sep 2026",workbookMonth:"2026-09",hours:timeTakenHours(line.arrivalTime,line.departureTime),revenue:line.revenue.trim()&&Number.isFinite(Number(line.revenue))?Number(line.revenue):null}));writeFileSync(".checks/monthly-pdf/september.pdf",await createMonthlyPdf(jobs,{month:"2026-09"}));console.log(`September source: ${report.lines.length} stored rows, ${jobs.length} substantive work orders`);}
  console.log("Monthly filtering, secondary hours, parts alignment and PDF pagination passed.");
}
main().catch(error=>{console.error(error);process.exitCode=1;});
