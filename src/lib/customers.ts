import {database,assertWritable} from './storage';
import {whenReady} from './db';
import {similarCustomer} from './customer-names';
import type {Suggestions,MachineRecord} from './model';
import {logEvent} from './events';
export async function customerSettings() {
  const rows=await (await database()).query("SELECT key, value FROM meta WHERE key LIKE 'customer-%'");
  const aliases=new Map<string,string>();
  const states=new Map<string,boolean>();
  for(const row of rows) {
    const key=String(row.key);
    if(key.startsWith('customer-alias:')) aliases.set(key.slice(15),String(row.value));
    if(key.startsWith('customer-name:')) states.set(key.slice(14),row.value==='1');
  }
  const canonical=(name:string)=>{const seen=new Set<string>(); while(aliases.has(name) && !seen.has(name)){seen.add(name);name=aliases.get(name)!;} return name;};
  return {aliases,states,canonical};
}
export async function customerSuggestions(input:Suggestions):Promise<Suggestions> {
  const {states,canonical}=await customerSettings();
  const customers=new Set(input.customers.map(canonical));
  for(const [name,active] of states) if(active) customers.add(canonical(name));else customers.delete(name);
  const locationsByCustomer:Record<string,string[]>={};
  for(const [name,sites] of Object.entries(input.locationsByCustomer)) {
    const target=canonical(name); locationsByCustomer[target]=[...new Set([...(locationsByCustomer[target]??[]),...sites])].sort((a,b)=>a.localeCompare(b));
  }
  const machinesByCustomer:Record<string,MachineRecord[]>={};
  for(const [name,machines] of Object.entries(input.machinesByCustomer)) {
    const target=canonical(name);machinesByCustomer[target]=[...(machinesByCustomer[target]??[]),...machines];
  }
  for(const [name,machines] of Object.entries(machinesByCustomer)) {
    const grouped=new Map<string,{serialNo:string;models:Set<string>;locations:Set<string>}>();
    for(const machine of machines) {
      const key=machine.serialNo.toLowerCase();
      const group=grouped.get(key)??{serialNo:machine.serialNo,models:new Set<string>(),locations:new Set<string>()};
      if(machine.modelNo)group.models.add(machine.modelNo);
      group.locations.add(machine.location);grouped.set(key,group);
    }
    machinesByCustomer[name]=[...grouped.values()].map(group=>({serialNo:group.serialNo,modelNo:group.models.size===1?[...group.models][0]:'',location:group.locations.size===1?[...group.locations][0]:''}));
  }
  return {...input,customers:[...customers].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'})),locationsByCustomer,machinesByCustomer};
}
export async function listCustomers() {
  await whenReady(); const db=await database();
  const {aliases,states,canonical}=await customerSettings();
  const counts=new Map<string,number>();
  for(const row of await db.query('SELECT lines FROM reports')) for(const line of JSON.parse(String(row.lines))) if(line.customer?.trim()) counts.set(line.customer,(counts.get(line.customer)??0)+1);
  for(const row of await db.query("SELECT value FROM suggestions WHERE kind = 'customer'")) if(!counts.has(String(row.value))) counts.set(String(row.value),0);
  for(const name of states.keys()) if(!counts.has(name)) counts.set(name,0);
  const names=[...counts.keys()].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
  return names.map(name=>({name,jobs:counts.get(name)??0,active:states.get(name)!==false && !aliases.has(name),preferred:aliases.has(name)?canonical(name):'',similar:names.filter(other=>other!==name && !aliases.has(other) && similarCustomer(name,other))}));
}
export async function saveCustomer(input:unknown) {
  const body=input as {name:string;active:boolean;names?:string[];preferred?:string};
  const valid=(name:unknown):name is string=>typeof name==='string' && !!name.trim() && name.length<=240;
  if(!body || !valid(body.name) || typeof body.active!=='boolean') throw new Error('Enter a customer name up to 240 characters.');
  if(body.names && (!Array.isArray(body.names) || body.names.length>100 || !body.names.every(valid) || !valid(body.preferred))) throw new Error('Invalid customer consolidation.');
  await whenReady();const db=await database();
  await db.transaction(async()=>{
    assertWritable();
    const set=async(key:string,value:string)=>{await db.query('DELETE FROM meta WHERE key = ?',[key]);await db.query('INSERT INTO meta (key, value) VALUES (?, ?)',[key,value]);};
    await set(`customer-name:${body.name.trim()}`,body.active?'1':'0');
    if(body.active && !body.names) await db.query('DELETE FROM meta WHERE key = ?',[`customer-alias:${body.name.trim()}`]);
    if(body.names && body.preferred) {
      const preferred=body.preferred.trim();
      await db.query('DELETE FROM meta WHERE key = ?',[`customer-alias:${preferred}`]);
      await set(`customer-name:${preferred}`,'1');
      for(const name of body.names.map(n=>n.trim())) if(name!==preferred) await set(`customer-alias:${name}`,preferred);
    }
  });
  logEvent('customers.updated','Updated customer dropdown names; historical work orders preserved.');
}
