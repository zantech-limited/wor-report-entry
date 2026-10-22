import {legacyAccess} from "@/lib/access";
import {NextResponse} from "next/server";
import {listWorkEntries} from "@/lib/db";
import {reportBounds} from "@/lib/monthly-report";
import {createMonthlyPdf} from "@/lib/report-pdf";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const accessDenied=await legacyAccess(request,["admin","manager"]);if(accessDenied)return accessDenied;
  const query=new URL(request.url).searchParams;
  const month=query.get("month")??"";
  const options={month,from:query.get("from")||undefined,to:query.get("to")||undefined};
  try{reportBounds(options);}catch{return NextResponse.json({error:"Choose a valid month or date range."},{status:400});}
  const technician=query.get("technician")??"",customer=query.get("customer")??"";
  if(technician.length>255||customer.length>255)return NextResponse.json({error:"Invalid report filter."},{status:400});
  try{
    const pdf=await createMonthlyPdf(await listWorkEntries(),{...options,technician,customer,includeUndated:query.get("undated")==="true"});
    return new NextResponse(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="Zantech-service-report-${options.from?`${options.from}-to-${options.to}`:month}.pdf"`,"Cache-Control":"private, no-store"}});
  }catch(error){const message=error instanceof Error&&/^(Choose|No work orders)/.test(error.message)?error.message:"Could not generate the report PDF. Please retry.";return NextResponse.json({error:message},{status:message.startsWith("No work orders")?404:500});}
}
