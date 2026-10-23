import assert from "node:assert/strict";
import {defaultFormLayout,validateFormLayout,choiceSelected,formChoices,fieldsForLayout} from "../src/lib/form-layout";
import {readFormLayout,publishFormLayout} from "../src/lib/form-layout-store";
import {emptyJob,FORM_OPTIONS} from "../src/lib/field-model";
import {createSession} from "../src/lib/admin-auth";
import {POST} from "../src/app/api/admin/form-layout/route";
import {nextRequestNumber} from "../src/lib/request-number";
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
 const db=await database();const numbers=await Promise.all(Array.from({length:4},()=>db.transaction(()=>nextRequestNumber())));assert.equal(new Set(numbers).size,4);assert.deepEqual(numbers,["WRETO-16719","WRETO-16720","WRETO-16721","WRETO-16722"]);
 console.log("Layout checks passed: admin authorization, same-origin enforcement, persistence, revision conflicts, bounds, single choice and concurrent short numbers.");
 await db.close();
}
main().catch(e=>{console.error(e);process.exitCode=1;});
