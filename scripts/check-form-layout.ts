import assert from "node:assert/strict";
import {defaultFormLayout,validateFormLayout,choiceSelected,formChoices,fieldsForLayout,selectServiceOption} from "../src/lib/form-layout";
import {readFormLayout,publishFormLayout} from "../src/lib/form-layout-store";
import {emptyJob,FORM_OPTIONS} from "../src/lib/field-model";
import {createSession} from "../src/lib/admin-auth";
import {POST} from "../src/app/api/admin/form-layout/route";
import {formatWorkOrderNumber,nextRequestNumber,noteRequestNumber} from "../src/lib/request-number";
import {database} from "../src/lib/storage";
async function main(){
 assert(process.env.DATA_DIR?.includes(".checks"));
 assert.equal(process.env.DESK_ACCOUNTS_ENABLED,"false");
 const original=await readFormLayout();assert.equal(original.revision,0);
 const layout=defaultFormLayout();layout["Client name"]={...layout["Client name"],x:100,w:400,size:18,leading:24};
 const denied=await POST(new Request("http://localhost/api/admin/form-layout",{method:"POST",body:JSON.stringify({layout,revision:0})}));assert.equal(denied.status,401);
 const cookie="desk-admin="+createSession();
 const cross=await POST(new Request("http://localhost/api/admin/form-layout",{method:"POST",headers:{cookie,host:"localhost",origin:"https://other.test"},body:JSON.stringify({layout,revision:0})}));assert.equal(cross.status,403);
 const saved=await POST(new Request("http://localhost/api/admin/form-layout",{method:"POST",headers:{cookie,host:"localhost",origin:"http://localhost"},body:JSON.stringify({layout,revision:0})}));assert.equal(saved.status,200);
 assert.deepEqual((await readFormLayout()).layout,layout);
 assert.equal(fieldsForLayout(layout).find(f=>f.label==="Client name")?.x,100);
 await assert.rejects(publishFormLayout(layout,0),/Conflict:/);
 assert.throws(()=>validateFormLayout({...layout,"Client name":{...layout["Client name"],w:2000}}),/Invalid/);
 const job=emptyJob("test");job.line.paymentMethod="Cash";job.line.slaType="Rental";job.line.serviceType="PM";
 assert.equal(formChoices.filter(c=>choiceSelected(job,c.label)).length,1);
 for(const option of FORM_OPTIONS){job.fields.serviceOption=option;assert.deepEqual(formChoices.filter(c=>choiceSelected(job,c.label)).map(c=>c.label),[option]);}
 const db=await database();assert.equal(formatWorkOrderNumber(1),"OWOR00001");assert.equal(formatWorkOrderNumber(100000),"OWOR100000");const numbers=await Promise.all(Array.from({length:4},()=>db.transaction(()=>nextRequestNumber())));assert.equal(new Set(numbers).size,4);assert.deepEqual([...numbers].sort(),["OWOR00001","OWOR00002","OWOR00003","OWOR00004"]);
 const base=emptyJob("service-option");
 const cash=selectServiceOption(base,"Cash");assert.equal(cash.line.paymentMethod,"Cash");assert.deepEqual(formChoices.filter(c=>choiceSelected(cash,c.label)).map(c=>c.label),["Cash"]);
 const charge=selectServiceOption(base,"Charge");assert.equal(charge.line.paymentMethod,"");assert.equal(choiceSelected(charge,"Charge"),true);assert.equal(formChoices.filter(c=>choiceSelected(charge,c.label)).length,1);
 const rental=selectServiceOption(base,"Rental");assert.equal(rental.line.slaType,"Rental");assert.equal(rental.line.paymentMethod,"No charge");
 await noteRequestNumber("WRETO-16730");
 assert.equal(await db.transaction(()=>nextRequestNumber()),"OWOR00005");
 await noteRequestNumber("OWOR00030");
 assert.equal(await db.transaction(()=>nextRequestNumber()),"OWOR00031");
 console.log("Layout checks passed: admin authorization, same-origin enforcement, persistence, revision conflicts, bounds, single choice and concurrent short numbers.");
 await db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
