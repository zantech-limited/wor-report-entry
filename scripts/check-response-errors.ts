import assert from "node:assert/strict";
import {deskApi} from "../src/lib/client-api";
const original=globalThis.fetch;
async function main(){
 try {
  for (const [body,status] of [["",502],["<html>failure</html>",503],["",200]] as const) {
   globalThis.fetch=async()=>new Response(body,{status});
   await assert.rejects(deskApi("/test"),(e:unknown)=> e instanceof Error && !e.message.includes("Unexpected end") && (e as Error&{status:number}).status===status);
  }
  globalThis.fetch=async()=>Response.json({error:"Conflict: newer revision"},{status:409});
  await assert.rejects(deskApi("/test"),(e:unknown)=>(e as {status:number}).status===409);
  globalThis.fetch=async()=>Response.json({saved:true});
  assert.deepEqual(await deskApi("/test"),{saved:true});
  console.log("Response handling passed: empty, HTML, malformed success, conflict status and success.");
 } finally {globalThis.fetch=original;}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
