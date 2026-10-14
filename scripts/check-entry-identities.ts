import assert from "node:assert/strict";
import {createBlankReport,getReport,getSuggestions,listWorkEntries,saveReport} from "../src/lib/db";
import {listCustomers} from "../src/lib/customers";
import {listTechnicians,saveTechnician} from "../src/lib/technicians";
import {listParts,savePart} from "../src/lib/parts";
import {database} from "../src/lib/storage";
import {blankLine,canonicalize,nameKey} from "../src/lib/model";
import {technicianHours,technicianJobs} from "../src/lib/reporting";
import {matchesDeskFilters} from "../src/lib/desk-filters";

async function main(){
 assert(process.env.DATA_DIR?.includes('.checks'));
 if(process.env.DB_ENGINE && process.env.DB_ENGINE!=='sqlite')assert(/^desk_test_/.test(process.env.DB_NAME??''));
 assert.equal(canonicalize('JESSICA',['Jessica','jessica']),'Jessica');
 const report=await createBlankReport();
 Object.assign(report.lines[0],{customer:'Example Company',location:'Main Site',technician:'Jessica',date:'2026-09-16',arrivalTime:'09:00',departureTime:'10:00',partNo:'PART-CASE',description:'Sample part'});
 await saveReport(report.id,report);
 report.lines.push({...blankLine('2'),customer:'EXAMPLE COMPANY',location:'MAIN SITE',technician:'JESSICA',secondaryTech:'jessica',date:'2026-09-17',arrivalTime:'09:00',departureTime:'10:00',partNo:'part-case',description:'Sample part'});
 await saveReport(report.id,report);
 const saved=(await getReport(report.id))!;
 assert.equal(saved.lines[1].customer,'Example Company');assert.equal(saved.lines[1].technician,'Jessica');assert.equal(saved.lines[1].location,'Main Site');
 const db=await database();
 // Simulate existing imported capitalization variants; views must coalesce them without rewriting history.
 const imported=JSON.parse(JSON.stringify(saved.lines));imported[1].customer='EXAMPLE COMPANY';imported[1].technician='JESSICA';
 await db.query('UPDATE reports SET lines = ? WHERE id = ?',[JSON.stringify(imported),report.id]);
 await db.query('INSERT INTO suggestions (kind,parent,value,uses) VALUES (?, ?, ?, ?)', ['customer','','EXAMPLE COMPANY',1]);
 await db.query('INSERT INTO suggestions (kind,parent,value,uses) VALUES (?, ?, ?, ?)', ['tech','','JESSICA',1]);
 const suggestions=await getSuggestions();
 assert.equal(suggestions.customers.filter(v=>nameKey(v)==='example company').length,1);
 assert.equal(suggestions.techs.filter(v=>nameKey(v)==='jessica').length,1);
 assert.equal((await listCustomers()).filter(v=>nameKey(v.name)==='example company').length,1);
 assert.equal((await listCustomers()).find(v=>nameKey(v.name)==='example company')!.jobs,2);
 assert.equal((await listTechnicians()).filter(v=>nameKey(v.name)==='jessica').length,1);
 const entries=(await listWorkEntries()).filter(v=>v.reportId===report.id);
 assert.equal(new Set(entries.map(v=>v.customer)).size,1);
 assert.equal(technicianJobs(entries,'JESSICA').length,2);
 assert.equal(technicianHours(entries).find(v=>nameKey(v.label)==='jessica')!.value,'2.0');
 assert(matchesDeskFilters(entries[0],{customer:'EXAMPLE COMPANY',technician:'JESSICA'}));
 assert.equal((await getReport(report.id))!.lines[1].customer,'EXAMPLE COMPANY','View normalization rewrote history');
 await saveTechnician({name:'JESSICA',active:false});assert(!(await getSuggestions()).techs.some(v=>nameKey(v)==='jessica'));
 await savePart({partNo:'part-case',description:'Updated description',active:true});
 assert.equal((await listParts()).filter(v=>nameKey(v.partNo)==='part-case').length,1);
 const invalid=JSON.parse(JSON.stringify(saved));invalid.lines[0].date='2026-02-16';
 await assert.rejects(()=>saveReport(report.id,invalid),/locked to 2026-09/);
 console.log('Entry identity checks passed: case variants coalesce, direct saves normalize, crew hours count once, history and month locks preserved, parts and inactive technicians match case-insensitively.');
 await db.close();
}
main().catch(e=>{console.error(e);process.exit(1)});
