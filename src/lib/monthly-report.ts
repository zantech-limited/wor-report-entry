import {nameKey,type WorkEntry} from "./model";
export type MonthlyReportOptions={month:string;technician?:string;customer?:string;includeUndated?:boolean};
export function monthlyEntries(entries:WorkEntry[],options:MonthlyReportOptions){
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(options.month))throw new Error("Choose a valid report month.");
  return entries.filter(entry=>(entry.date?entry.date.slice(0,7)===options.month:options.includeUndated&&entry.workbookMonth===options.month)
    &&(!options.technician||[entry.technician,entry.secondaryTech].some(name=>nameKey(name)===nameKey(options.technician!)))
    &&(!options.customer||nameKey(entry.customer)===nameKey(options.customer))).sort((a,b)=>a.date.localeCompare(b.date)||a.customer.localeCompare(b.customer)||a.no.localeCompare(b.no,undefined,{numeric:true}));
}
export function groupedCounts(entries:WorkEntry[],field:(entry:WorkEntry)=>string){
  const groups=new Map<string,{label:string;value:number}>();
  for(const entry of entries){const label=field(entry).trim()||"Unspecified",key=nameKey(label);const group=groups.get(key)??{label,value:0};group.value++;groups.set(key,group);}
  return [...groups.values()].sort((a,b)=>b.value-a.value||a.label.localeCompare(b.label));
}
export function monthlyAnalysis(entries:WorkEntry[]){
  const crew=new Map<string,{name:string;jobs:number;secondary:number;hours:number;timed:number;customers:Set<string>}>();
  const customers=new Map<string,{name:string;jobs:number;hours:number;revenue:number;machines:Set<string>;sites:Set<string>}>();
  const parts=new Map<string,{partNo:string;description:string;uses:number;quantity:number;unknownQuantity:number}>();
  const machines=new Map<string,{serial:string;model:string;customer:string;visits:number}>();
  const validSerial=(value:string)=>value.trim()&&!/^n\s*\/\s*a$/i.test(value.trim());
  for(const entry of entries){
    const names=new Map([entry.technician,entry.secondaryTech].filter(Boolean).map(name=>[nameKey(name),name]));
    for(const [key,name] of names){const row=crew.get(key)??{name,jobs:0,secondary:0,hours:0,timed:0,customers:new Set<string>()};row.jobs++;if(key===nameKey(entry.secondaryTech)&&key!==nameKey(entry.technician))row.secondary++;if(entry.hours!==null){row.hours+=entry.hours;row.timed++;}if(entry.customer)row.customers.add(nameKey(entry.customer));crew.set(key,row);}
    if(entry.customer){const key=nameKey(entry.customer);const row=customers.get(key)??{name:entry.customer,jobs:0,hours:0,revenue:0,machines:new Set<string>(),sites:new Set<string>()};row.jobs++;row.hours+=entry.hours??0;row.revenue+=entry.revenue??0;if(validSerial(entry.serialNo))row.machines.add(nameKey(entry.serialNo));if(entry.location)row.sites.add(nameKey(entry.location));customers.set(key,row);}
    if(validSerial(entry.serialNo)){const key=nameKey(entry.serialNo);const row=machines.get(key)??{serial:entry.serialNo,model:entry.modelNo,customer:entry.customer,visits:0};row.visits++;machines.set(key,row);}
    const numbers=(entry.partNo??"").split(/\r?\n/),descriptions=(entry.description??"").split(/\r?\n/),quantities=(entry.qty??"").split(/\r?\n/);
    numbers.forEach((value,index)=>{const partNo=value.trim();if(!validSerial(partNo))return;const key=nameKey(partNo),row=parts.get(key)??{partNo,description:numbers.length===descriptions.length?descriptions[index].trim():"",uses:0,quantity:0,unknownQuantity:0};row.uses++;const text=numbers.length===quantities.length?quantities[index].trim():"";const quantity=Number(text);if(text&&Number.isFinite(quantity)&&quantity>=0)row.quantity+=quantity;else row.unknownQuantity++;parts.set(key,row);});
  }
  return {jobs:entries.length,hours:entries.reduce((sum,e)=>sum+(e.hours??0),0),revenue:entries.reduce((sum,e)=>sum+(e.revenue??0),0),timed:entries.filter(e=>e.hours!==null).length,
    completed:entries.filter(e=>nameKey(e.jobStatus)==="completed").length,ftfYes:entries.filter(e=>nameKey(e.ftf??"")==="yes").length,ftfNo:entries.filter(e=>nameKey(e.ftf??"")==="no").length,
    crew:[...crew.values()].sort((a,b)=>b.hours-a.hours||b.jobs-a.jobs),customers:[...customers.values()].sort((a,b)=>b.jobs-a.jobs),parts:[...parts.values()].sort((a,b)=>b.uses-a.uses),machines:[...machines.values()].sort((a,b)=>b.visits-a.visits)};
}
