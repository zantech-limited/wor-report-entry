import {legacyAccess} from "@/lib/access";
import {NextResponse} from 'next/server';
import {requireAdmin} from '@/lib/admin-auth';
import {listCustomers,saveCustomer} from '@/lib/customers';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(request:Request){const guard=await legacyAccess(request,["admin","manager","supervisor","tech"]);if(guard)return guard;return NextResponse.json({customers:await listCustomers()});}
export async function POST(request:Request){
  const denied=await requireAdmin(request);if(denied)return denied;
  try {await saveCustomer(await request.json());return NextResponse.json({customers:await listCustomers()});}
  catch(error){return NextResponse.json({error:error instanceof Error && /^(Enter|Invalid)/.test(error.message)?error.message:'Could not update customers.'},{status:400});}
}
