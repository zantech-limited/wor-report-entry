import type { WorkOrder } from "./model";
export function workbookMonth(lines:WorkOrder[]) {return lines.find(line=>/^\d{4}-(0[1-9]|1[0-2])-\d{2}$/.test(line.date))?.date.slice(0,7) ?? "";}
export function monthBounds(key:string) {
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return undefined;
  const [year,month]=key.split('-').map(Number);
  const last=new Date(Date.UTC(year,month,0)).getUTCDate();
  return {min:`${key}-01`,max:`${key}-${String(last).padStart(2,'0')}`};
}
