import {PDFDocument,rgb,type PDFPage} from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import {readFileSync} from "node:fs";
import {monthlyAnalysis,groupedCounts,monthlyEntries,type MonthlyReportOptions} from "./monthly-report";
import {nameKey,type WorkEntry} from "./model";
import packageInfo from "../../package.json";
const {version}=packageInfo;

const ink=rgb(.09,.15,.24),muted=rgb(.35,.4,.47),blue=rgb(.12,.36,.62),pale=rgb(.94,.96,.98),line=rgb(.82,.86,.9),red=rgb(.72,.1,.1);
const margin=36;
export async function createMonthlyPdf(allEntries:WorkEntry[],options:MonthlyReportOptions){
  const entries=monthlyEntries(allEntries,options);
  if(!entries.length)throw new Error("No work orders match this month and these filters.");
  const analysis=monthlyAnalysis(entries),doc=await PDFDocument.create();doc.registerFontkit(fontkit);
  const font=await doc.embedFont(readFileSync(`${process.cwd()}/templates/fonts/NotoSans-Regular.ttf`),{subset:true});
  const month=new Date(`${options.month}-01T12:00:00Z`).toLocaleDateString("en-GB",{month:"long",year:"numeric",timeZone:"UTC"});
  doc.setTitle(`Monthly Service Report — ${month}`);doc.setAuthor("Zantech Limited");doc.setSubject("Field service activity, hours, customers, parts and recorded revenue");
  const clean=(value:string)=>value.normalize("NFC").replace(/[\u0000-\u0008\u000b-\u001f]/g,"");
  function wrap(value:string,width:number,size=9){
    const lines:string[]=[];
    for(const paragraph of clean(value).split(/\r?\n/)){let current="";for(const word of paragraph.split(/\s+/).filter(Boolean)){
      if(font.widthOfTextAtSize(word,size)>width){if(current){lines.push(current);current="";}let fragment="";for(const c of word){if(font.widthOfTextAtSize(fragment+c,size)>width&&fragment){lines.push(fragment);fragment="";}fragment+=c;}current=fragment;}
      else if(current&&font.widthOfTextAtSize(current+" "+word,size)>width){lines.push(current);current=word;}else current=current?current+" "+word:word;
    }lines.push(current);}return lines.length?lines:[""];
  }
  const text=(page:PDFPage,value:string,x:number,y:number,size=10,color=ink)=>page.drawText(clean(value),{x,y,size,font,color});
  const heading=(page:PDFPage,value:string,y:number,size=17)=>{text(page,value,margin,y,size);return y-size-18;};
  function page(title:string,landscape=false){const p=doc.addPage(landscape?[841.89,595.28]:[595.28,841.89]);text(p,"ZANTECH LIMITED  /  FIELD SERVICE",margin,p.getHeight()-37,8,blue);text(p,month,p.getWidth()-margin-font.widthOfTextAtSize(month,9),p.getHeight()-37,9,muted);return {p,y:heading(p,title,p.getHeight()-73)};}
  function paragraph(p:PDFPage,value:string,y:number,size=9,width=p.getWidth()-margin*2){for(const row of wrap(value,width,size)){text(p,row,margin,y,size,muted);y-=size+4;}return y-9;}
  function chart(p:PDFPage,title:string,data:{label:string;value:number}[],top:number,unit="jobs",height=260){
    const width=p.getWidth()-margin*2;p.drawRectangle({x:margin,y:top-height,width,height,color:pale});text(p,title,margin+14,top-25,13);
    if(!data.length){text(p,"No recorded data",margin+14,top-50,10,muted);return top-height-20;}
    const rows=data.slice(0,10);if(data.length>10)rows.push({label:"Other",value:data.slice(10).reduce((sum,row)=>sum+row.value,0)});
    const max=Math.max(...rows.map(row=>row.value),1),labelWidth=155,barWidth=width-labelWidth-105,rowHeight=Math.min(20,(height-58)/rows.length);
    rows.forEach((row,index)=>{const y=top-52-index*rowHeight;let label=row.label;while(font.widthOfTextAtSize(label,8)>labelWidth-8)label=label.slice(0,-2)+"…";text(p,label,margin+14,y,8);p.drawRectangle({x:margin+labelWidth+12,y:y-1,width:Math.max(.4,row.value/max*barWidth),height:10,color:blue});text(p,unit==="hours"?row.value.toFixed(1):unit==="amount ($)"?row.value.toFixed(2):String(row.value),margin+width-72,y,8);});
    text(p,`Scale: ${unit}. All matching work orders; smaller categories grouped as Other.`,margin+14,top-height+12,7,muted);return top-height-20;
  }
  function table(title:string,headers:string[],rows:string[][],widths:number[],landscape=false){
    let {p,y}=page(title,landscape);const size=landscape?8:9;
    function header(){p.drawRectangle({x:margin,y:y-22,width:widths.reduce((a,b)=>a+b,0),height:26,color:pale});let x=margin;headers.forEach((label,i)=>{text(p,label,x+4,y-12,8,blue);x+=widths[i];});y-=31;}
    header();
    for(const row of rows){const cells=row.map((value,index)=>wrap(value||"—",widths[index]-8,size));const count=Math.max(...cells.map(cell=>cell.length));let offset=0;
      while(offset<count){if(y<82){({p,y}=page(`${title} (continued)`,landscape));header();}const available=Math.max(1,Math.floor((y-64)/(size+4))),take=Math.min(count-offset,available);let x=margin;
        cells.forEach((cell,index)=>{cell.slice(offset,offset+take).forEach((value,j)=>text(p,value,x+4,y-j*(size+4),size));x+=widths[index];});y-=take*(size+4)+8;p.drawLine({start:{x:margin,y:y+11},end:{x:margin+widths.reduce((a,b)=>a+b,0),y:y+11},thickness:.4,color:line});offset+=take;
      }
    }
    if(!rows.length)paragraph(p,"No recorded data for this section.",y);
  }
  let {p,y}=page("Monthly service report");
  y=paragraph(p,`Scope: ${options.technician?"Technician — "+options.technician:"All technicians"}; ${options.customer?"customer — "+options.customer:"all customers"}. Fully blank and default-only placeholder rows are excluded.`,y);
  const cards=[["Work orders",String(analysis.jobs)],["On-site hours",analysis.hours.toFixed(1)],["Customers",String(analysis.customers.length)],["Machines",String(analysis.machines.length)],["Completed",String(analysis.completed)],["Recorded revenue ($)",analysis.revenue.toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})]];
  const cardWidth=(p.getWidth()-margin*2-24)/3;cards.forEach(([label,value],i)=>{const x=margin+(i%3)*(cardWidth+12),top=y-Math.floor(i/3)*96;p.drawRectangle({x,y:top-80,width:cardWidth,height:80,color:pale});text(p,label,x+12,top-23,9,muted);text(p,value,x+12,top-55,value.length>12?14:23,blue);});y-=205;
  y=heading(p,"Results and coverage",y,14);
  y=paragraph(p,`Completion rate: ${(100*analysis.completed/analysis.jobs).toFixed(1)}% of all work orders. First-time fix: ${analysis.ftfYes+analysis.ftfNo?(100*analysis.ftfYes/(analysis.ftfYes+analysis.ftfNo)).toFixed(1)+"%":"not recorded"} across ${analysis.ftfYes+analysis.ftfNo} Yes/No responses. N/A and missing FTF responses are excluded from that rate.`,y);
  y=paragraph(p,`${analysis.timed} of ${analysis.jobs} jobs have usable arrival/departure times. ${entries.filter(e=>!e.jobStatus).length} have no job status; ${entries.filter(e=>e.revenue===null).length} have no recorded revenue; ${entries.filter(e=>!e.date).length} have no date. Missing values are not assumed to be zero or completed.`,y);
  y=paragraph(p,"On-site hours count each job once. Technician hours include primary and secondary assignments and credit the full visit duration to each distinct technician, so their combined hours can exceed on-site hours. Shared visits are not counted twice for the same technician.",y);
  y=paragraph(p,"Repeat serial visits can be valid return visits. They are activity indicators, not proof of duplicate work orders or failed repairs. Recorded revenue is the entered job amount; costs, profit, invoices and payment collection cannot be inferred from these records.",y);
  y=paragraph(p,options.includeUndated?"Dated jobs use their work-order date. Undated jobs are included only when their source workbook's first dated job establishes this month.":"Only jobs dated within the selected calendar month are included.",y);
  paragraph(p,`Generated ${new Date().toLocaleString("en-GB",{timeZone:"America/Port_of_Spain"})} (Trinidad and Tobago time).`,y);
  ({p,y}=page("Activity and service mix"));
  const days=new Map<string,number>();for(const entry of entries)if(entry.date)days.set(entry.date.slice(-2),(days.get(entry.date.slice(-2))??0)+1);
  const max=Math.max(...days.values(),1),last=new Date(Date.UTC(Number(options.month.slice(0,4)),Number(options.month.slice(5)),0)).getUTCDate();
  text(p,"Daily work orders",margin,y,13);const base=y-218,step=(p.getWidth()-margin*2-15)/last;
  p.drawLine({start:{x:margin,y:base},end:{x:p.getWidth()-margin,y:base},thickness:1,color:line});
  for(let day=1;day<=last;day++){const value=days.get(String(day).padStart(2,"0"))??0,x=margin+(day-1)*step;const height=value/max*176;p.drawRectangle({x:x+2,y:base,width:step-4,height,color:blue});text(p,String(day),x+1,base-15,7,muted);if(value)text(p,String(value),x+2,base+height+5,7);}
  text(p,"Day of month; undated jobs are omitted from this graph.",margin,base-35,8,muted);
  chart(p,"Service type mix",groupedCounts(entries,e=>e.serviceType),base-60);
  ({p,y}=page("Job status and SLA activity"));y=chart(p,"Job status",groupedCounts(entries,e=>e.jobStatus),y);chart(p,"SLA types",groupedCounts(entries,e=>e.slaType),y);
  ({p,y}=page("Technician and customer workload"));y=chart(p,"Technician hours (includes secondary tech)",analysis.crew.map(row=>({label:row.name,value:row.hours})),y,"hours");chart(p,"Customer work orders",analysis.customers.map(row=>({label:row.name,value:row.jobs})),y);
  table("Technician workload",["Technician","Jobs","Secondary","Hours","Timed jobs","Customers"],analysis.crew.map(row=>[row.name,String(row.jobs),String(row.secondary),row.hours.toFixed(2),String(row.timed),String(row.customers.size)]),[183,52,73,65,72,78]);
  table("Customer and site activity",["Customer","Jobs","Hours","Sites","Machines","Revenue ($)"],analysis.customers.map(row=>[row.name,String(row.jobs),row.hours.toFixed(2),String(row.sites.size),String(row.machines.size),row.revenue.toFixed(2)]),[188,45,60,45,65,120]);
  ({p,y}=page("Machines and parts"));y=chart(p,"Most serviced models",groupedCounts(entries,e=>e.modelNo),y);chart(p,"Most used parts (part-line occurrences)",analysis.parts.map(row=>({label:row.partNo,value:row.uses})),y);
  table("Parts usage",["Part number","Description","Uses","Known qty","Qty missing"],analysis.parts.map(row=>[row.partNo,row.description||"Not consistently recorded",String(row.uses),String(row.quantity),String(row.unknownQuantity)]),[112,235,42,66,68]);
  table("Repeat visits by serial number",["Serial","First model","First customer","Visits"],analysis.machines.filter(row=>row.visits>1).map(row=>[row.serial,row.model,row.customer,String(row.visits)]),[112,145,213,53]);
  ({p,y}=page("Revenue and first-time fix"));
  const payment=new Map<string,number>();for(const entry of entries)if(entry.revenue!==null)payment.set(nameKey(entry.paymentMethod||"Unspecified"),(payment.get(nameKey(entry.paymentMethod||"Unspecified"))??0)+entry.revenue);
  const payments=groupedCounts(entries,e=>e.paymentMethod??"").map(({label})=>({label,value:payment.get(nameKey(label))??0})).sort((a,b)=>b.value-a.value);
  // Negative adjustments are preserved in the financial table; bars show nonnegative amounts.
  y=chart(p,"Recorded revenue by payment method",payments.map(row=>({...row,value:Math.max(0,row.value)})),y,"amount ($)");y=chart(p,"First-time fix responses",groupedCounts(entries,e=>e.ftf??""),y);paragraph(p,"Revenue bars show positive amounts; negative adjustments remain included in the payment summary and total.",y,8);
  table("Payment method summary",["Payment method","Work orders","Recorded revenue ($)"],groupedCounts(entries,e=>e.paymentMethod??"").map(row=>[row.label,String(row.value),(payment.get(nameKey(row.label))??0).toFixed(2)]),[245,98,180]);
  const details=entries.map(e=>[
    e.no,e.date,e.wor,e.customer+(e.location?"\n"+e.location:""),e.serviceType,e.technician+(e.secondaryTech?"\nSecondary: "+e.secondaryTech:""),e.serialNo+(e.modelNo?"\n"+e.modelNo:""),e.hours===null?"—":e.hours.toFixed(2),e.jobStatus,
  ]);
  table("Work-order register",["No.","Date","WOR","Customer / site","Service","Technicians","Serial / model","Hours","Status"],details,[30,62,55,154,65,123,135,48,97],true);
  const supplementary=entries.filter(e=>e.partNo||e.description||e.comments||e.paymentMethod||e.ftf||e.revenue!==null).map(e=>[
    `${e.no||"—"}\n${e.wor||""}\n${e.date||"Undated"}`,
    [e.partNo?"Parts:\n"+e.partNo:"",e.description?"Descriptions:\n"+e.description:"",e.qty?"Quantities:\n"+e.qty:"",e.comments?"Notes:\n"+e.comments:""].filter(Boolean).join("\n"),
    ["Payment: "+(e.paymentMethod||"Unspecified"),"Revenue ($): "+(e.revenue===null?"Not recorded":e.revenue.toFixed(2)),"FTF: "+(e.ftf||"Unspecified")].join("\n"),
  ]);
  table("Work-order parts, billing and notes",["No. / WOR / Date","Parts and notes","Billing"],supplementary,[94,305,124]);
  const pages=doc.getPages();pages.forEach((page,index)=>{page.drawLine({start:{x:margin,y:45},end:{x:page.getWidth()-margin,y:45},thickness:.5,color:line});text(page,"Internal use only",margin,28,8,red);text(page,"© Zantech Limited",page.getWidth()/2-43,28,8,muted);const footer=`v${version} · ${index+1} / ${pages.length}`;text(page,footer,page.getWidth()-margin-font.widthOfTextAtSize(footer,8),28,8,muted);});
  return Buffer.from(await doc.save());
}
