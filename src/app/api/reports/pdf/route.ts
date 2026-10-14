import {NextResponse} from "next/server";
import {listWorkEntries} from "@/lib/db";
import {createMonthlyPdf} from "@/lib/report-pdf";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const query=new URL(request.url).searchParams;
  const month=query.get("month")??"";
  if(!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))return NextResponse.json({error:"Choose a report month."},{status:400});
  const technician=query.get("technician")??"",customer=query.get("customer")??"";
  if(technician.length>255||customer.length>255)return NextResponse.json({error:"Invalid report filter."},{status:400});
  try{
    const pdf=await createMonthlyPdf(await listWorkEntries(),{month,technician,customer,includeUndated:query.get("undated")==="true"});
    return new NextResponse(new Uint8Array(pdf),{headers:{"Content-Type":"application/pdf","Content-Disposition":`attachment; filename="Zantech-service-report-${month}.pdf"`,"Cache-Control":"private, no-store"}});
  }catch(error){const message=error instanceof Error&&/^(Choose|No work orders)/.test(error.message)?error.message:"Could not generate the report PDF. Please retry.";return NextResponse.json({error:message},{status:message.startsWith("No work orders")?404:500});}
}
