import {mkdirSync,writeFileSync,readdirSync,unlinkSync} from "node:fs";
import {createHash} from "node:crypto";
import path from "node:path";
import {dataDirectory} from "./storage";
import type {Report} from "./model";
export function preserveReportHistory(report:Report){
  const folder=path.join(dataDirectory,"report-history",createHash("sha256").update(report.id).digest("hex"));
  mkdirSync(folder,{recursive:true,mode:0o700});
  const filename=`${report.updatedAt.replace(/[^a-zA-Z0-9_-]/g,"_")}.json`;
  try{writeFileSync(path.join(folder,filename),JSON.stringify({format:"service-desk-draft",report}),{mode:0o600,flag:"wx"});}
  catch(error){if((error as NodeJS.ErrnoException).code!=="EEXIST")throw new Error("Recovery snapshot failed. Keep this tab open and download your unsaved copy before retrying.");}
  // Keep a bounded history of acknowledged versions, independent of Supabase backups.
  const files=readdirSync(folder).filter(name=>name.endsWith(".json")).sort();
  for(const name of files.slice(0,Math.max(0,files.length-20)))unlinkSync(path.join(folder,name));
}
