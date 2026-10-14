import {nameKey, type WorkEntry} from "./model";
export type DeskFilters = {month?:string; technician?:string; status?:string; service?:string; customer?:string; part?:string; from?:string; to?:string; undated?:string};
export function masterHref(filters: DeskFilters) {
  const query=new URLSearchParams();
  for(const [key,value] of Object.entries(filters)) if(value!==undefined && value!=="") query.set(key,value);
  return `/master?${query}`;
}
export function matchesDeskFilters(entry:WorkEntry, filters:DeskFilters) {
  if(filters.from && filters.to && filters.from>filters.to) return false;
  if(filters.month && (entry.date ? entry.date.slice(0,7) : "undated")!==filters.month) return false;
  if(filters.technician && nameKey(entry.technician)!==nameKey(filters.technician) && nameKey(entry.secondaryTech)!==nameKey(filters.technician)) return false;
  if(filters.status && entry.jobStatus!==(filters.status==='__blank__'?'':filters.status)) return false;
  if(filters.service && entry.serviceType!==(filters.service==='__blank__'?'':filters.service)) return false;
  if(filters.customer && nameKey(entry.customer)!==nameKey(filters.customer)) return false;
  if(filters.part && !(entry.partNo ?? '').split(/\r?\n/).some(number=>number.trim().toLowerCase()===filters.part!.trim().toLowerCase())) return false;
  if(!entry.date) return !(filters.undated==='false' || filters.from || filters.to) || filters.undated==='true';
  return !(filters.from && entry.date<filters.from || filters.to && entry.date>filters.to);
}
