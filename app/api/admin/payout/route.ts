import crypto from 'node:crypto';
import { NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { createPayout, executePayout, normalizePaytotaNetwork, normalizeUgandaPhone } from '@/lib/paytota';
import { auditMoney } from '@/lib/audit';
export async function POST(req:Request){
 const uid=(await cookies()).get('merchantpay_session')?.value?.split('.')[0];
 const admin=uid?await db.user.findUnique({where:{id:uid},select:{id:true,isAdmin:true}}):null;
 if(!admin?.isAdmin)return NextResponse.json({error:'Forbidden'},{status:403});
 let body:any={};
 try{
  body=await req.json();
  const phone=normalizeUgandaPhone(String(body.phone||''));
  const network=normalizePaytotaNetwork(String(body.network||''));
  const amount=new Prisma.Decimal(String(body.amount||0));
  const reason=String(body.reason||'Admin payout').trim().slice(0,160);
  if(!/^2567\d{8}$/.test(phone))return NextResponse.json({error:'Enter a valid Ugandan mobile money number.'},{status:400});
  if(!amount.isFinite()||amount.lte(0))return NextResponse.json({error:'Amount must be greater than zero.'},{status:400});
  const reference=`MP-ADMIN-PAYOUT-${crypto.randomUUID()}`;
  const initiated=await createPayout({amount:amount.toString(),phone,network,reference,currency:'UGX',reason});
  if(!initiated?.id||!initiated?.execution_url)throw new Error('Paytota did not return an executable payout transaction.');
  const executed=await executePayout({executionUrl:String(initiated.execution_url)});
  const status=String(executed?.status||executed?.detail||'').toLowerCase();
  const data=executed?.payment||initiated?.payment||{};
  const fee=new Prisma.Decimal(String(data.fee_amount??0));
  const payout=await db.merchantPayout.create({data:{phone,network,amount,currency:'UGX',provider:'PAYTOTA',providerReference:reference,providerTransactionId:String(initiated.id),status:status==='success'?'COMPLETED':'PENDING',reason,fee,completedAt:status==='success'?new Date():null}});
  await auditMoney({actorUserId:admin.id,actorType:'ADMIN',action:status==='success'?'ADMIN_MANUAL_PAYOUT_COMPLETED':'ADMIN_MANUAL_PAYOUT_INITIATED',target:payout.id,details:{amount:amount.toString(),phone,network,reason,providerReference:reference,providerTransactionId:String(initiated.id),fee:fee.toString(),status}});
  return NextResponse.json({ok:true,status:payout.status,amount:amount.toString(),phone,providerReference:reference,providerTransactionId:String(initiated.id),fee:fee.toString()});
 }catch(error){
  const message=error instanceof Error?error.message:'Paytota payout failed.';
  await auditMoney({actorUserId:admin.id,actorType:'ADMIN',action:'ADMIN_MANUAL_PAYOUT_FAILED',details:{amount:String(body.amount||''),phone:String(body.phone||''),network:String(body.network||''),reason:String(body.reason||''),error:message}});
  return NextResponse.json({error:message},{status:502});
 }
}
