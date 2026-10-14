import type {Report} from "./model";
import {validateReportInput} from "./report-validation";
export function draftKey(id:string){return `service-desk-draft:${id}`;}
export function archiveLocalDraft(report:Report){
  try{localStorage.setItem(`${draftKey(report.id)}:archive:${report.updatedAt}`,JSON.stringify({format:"service-desk-draft",savedAt:new Date().toISOString(),report}));return true;}catch{return false;}
}
export function writeLocalDraft(report:Report){
  try{localStorage.setItem(draftKey(report.id),JSON.stringify({format:"service-desk-draft",savedAt:new Date().toISOString(),report}));return true;}catch{return false;}
}
export function readLocalDraft(id:string):Report|null {
  try{let raw=localStorage.getItem(draftKey(id));if(!raw){const keys=Object.keys(localStorage).filter(key=>key.startsWith(`${draftKey(id)}:archive:`)).sort();raw=keys.length?localStorage.getItem(keys[keys.length-1]):null;}if(!raw)return null;const draft=JSON.parse(raw);if(draft.format!=="service-desk-draft"||draft.report?.id!==id)return null;validateReportInput(draft.report);return draft.report;}catch{return null;}
}
export function clearLocalDraft(id:string){try{localStorage.removeItem(draftKey(id));}catch{}}
