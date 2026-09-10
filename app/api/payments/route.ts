import { NextResponse } from 'next/server';
import { currentBusiness } from '@/lib/current-user';
import { db } from '@/lib/db';
export async function GET(){const c=await currentBusiness();if(!c)return NextResponse.json({error:'Not authenticated.'},{status:401});const payments=await db.payment.findMany({where:{businessId:c.business.id,status:'COMPLETED'},include:{invoice:{include:{customer:true}}},orderBy:{createdAt:'desc'}});return NextResponse.json({payments:payments.map(p=>({id:p.id,amount:p.amount.toString(),currency:p.currency,provider:p.provider,providerReference:p.providerReference,createdAt:p.createdAt.toISOString(),invoice:{number:p.invoice.number,customer:p.invoice.customer?{name:p.invoice.customer.name}:null}}))});}
