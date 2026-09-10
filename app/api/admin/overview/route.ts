import {NextResponse} from "next/server";
import {cookies} from "next/headers";
import {db} from "@/lib/db";
export async function GET(){
 const uid=(await cookies()).get("merchantpay_session")?.value?.split(".")[0];
 const u=uid?await db.user.findUnique({where:{id:uid},select:{id:true,isAdmin:true}}):null; if(!u?.isAdmin)return NextResponse.json({error:"Forbidden"},{status:403});
 const businesses=await db.business.findMany({where:{members:{none:{user:{isAdmin:true}}}},include:{subscription:true,members:{include:{user:true},take:1},invoices:{select:{id:true}}},orderBy:{createdAt:"desc"}});
 const unread=await db.adminFeedback.count({where:{status:"OPEN"}}); const now=new Date();
 const rows=businesses.map(b=>{const s=b.subscription,exp=s?.expiresAt||null,ms=exp?exp.getTime()-now.getTime():0;const status=b.suspended?"SUSPENDED":!exp?"ACTIVE":ms<=0?"EXPIRED":ms<=7*86400000?"EXPIRING":"ACTIVE";const max=s?.maxInvoices??5;return {id:b.id,name:b.name,email:b.members[0]?.user.email||"—",logo:b.logoData,phone:b.phone,currency:b.currency,plan:s?.plan||"FREE",status,expiresAt:exp?.toISOString()||null,renewedAt:s?.lastRenewedAt?.toISOString()||null,lastPlanChangedAt:s?.lastPlanChangedAt?.toISOString()||null,startsAt:s?.startsAt?.toISOString()||null,maxInvoices:max,invoicesUsed:b.invoices.length,remainingInvoices:max<0?null:Math.max(0,max-b.invoices.length)}});
 return NextResponse.json({rows,unread,serverTime:now.toISOString()});
}
