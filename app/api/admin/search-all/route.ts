import {NextResponse} from 'next/server';
import {cookies} from 'next/headers';
import {db} from '@/lib/db';
const like=(q:string)=>({contains:q,mode:'insensitive' as const});
export async function GET(req:Request){
 const uid=(await cookies()).get('merchantpay_session')?.value?.split('.')[0];
 const u=uid?await db.user.findUnique({where:{id:uid},select:{id:true,isAdmin:true}}):null;
 if(!u?.isAdmin)return NextResponse.json({error:'Forbidden'},{status:403});
 const q=new URL(req.url).searchParams.get('q')?.trim();if(!q)return NextResponse.json({results:[]});const numericAmount=Number(q);const amountFilter=Number.isFinite(numericAmount)?[{amount:numericAmount}]:[];const invoiceTotalFilter=Number.isFinite(numericAmount)?[{total:numericAmount}]:[];
 const searchSources=[

  db.business.findMany({where:{OR:[{id:like(q)},{name:like(q)},{phone:like(q)},{mobileMoneyPhone:like(q)},{mobileMoneyNetwork:like(q)},{currency:like(q)}]},take:20,select:{id:true,name:true}}),
  db.user.findMany({where:{OR:[{id:like(q)},{email:like(q)},{name:like(q)}]},take:20,select:{id:true,email:true,name:true,isAdmin:true}}),
  db.businessMember.findMany({where:{OR:[{id:like(q)},{businessId:like(q)},{userId:like(q)},{role:like(q)}]},take:20,select:{id:true,businessId:true,userId:true,role:true}}),
  db.subscription.findMany({
    where:{
        OR:[
            {id:like(q)},
            {businessId:like(q)},
            {plan:like(q)},
            {status:q as any}
        ]
    },
        take:20,
        select:{
            id:true,
            businessId:true,
            plan:true,
            status:true,
            maxInvoices:true
            ,expiresAt:true
        }
    }),

  db.subscriptionPlanChange.findMany({where:{OR:[{id:like(q)},{businessId:like(q)},{subscriptionId:like(q)},{fromPlan:like(q)},{toPlan:like(q)}]},take:20,orderBy:{changedAt:'desc'},select:{id:true,businessId:true,fromPlan:true,toPlan:true,changedAt:true,expiresAt:true}}),
  db.customer.findMany({where:{OR:[{id:like(q)},{businessId:like(q)},{name:like(q)},{email:like(q)},{phone:like(q)},{notes:like(q)}]},take:20,select:{id:true,businessId:true,name:true,email:true,phone:true}}),
  db.product.findMany({where:{OR:[{id:like(q)},{businessId:like(q)},{name:like(q)}]},take:20,select:{id:true,businessId:true,name:true,price:true}}),
  db.item.findMany({where:{OR:[{id:like(q)},{businessId:like(q)},{name:like(q)},{type:like(q)},{description:like(q)},{currency:like(q)}]},take:20,select:{id:true,businessId:true,name:true,type:true,price:true,currency:true,active:true}}),
  db.invoice.findMany({where:{OR:[{id:like(q)},{number:like(q)},{status:like(q)},...invoiceTotalFilter]},take:20,select:{id:true,number:true,status:true,businessId:true}}),
  db.invoiceItem.findMany({where:{OR:[{id:like(q)},{invoiceId:like(q)},{productId:like(q)},{name:like(q)}]},take:20,select:{id:true,invoiceId:true,name:true,quantity:true,unitPrice:true,total:true}}),
  db.payment.findMany({where:{OR:[{id:like(q)},{provider:like(q)},{providerReference:like(q)},{providerTransactionId:like(q)},{status:like(q)},...amountFilter]},take:20,select:{id:true,provider:true,providerReference:true,providerTransactionId:true,status:true,businessId:true,invoiceId:true,amount:true}}),
  db.adminFeedback.findMany({where:{OR:[{id:like(q)},{subject:like(q)},{message:like(q)},{status:like(q)}]},take:20,select:{id:true,subject:true,status:true,businessId:true}}),
  db.adminAuditLog.findMany({where:{OR:[{id:like(q)},{adminId:like(q)},{actorUserId:like(q)},{actorType:like(q)},{action:like(q)},{target:like(q)},{details:like(q)}]},take:30,orderBy:{createdAt:'desc'},select:{id:true,action:true,target:true,details:true,createdAt:true}}),

  db.ledgerEntry.findMany({where:{OR:[{id:like(q)},{businessId:like(q)},{invoiceId:like(q)},{paymentId:like(q)},{entryType:like(q)},...amountFilter,{direction:like(q)},{provider:like(q)},{providerReference:like(q)},{sourceId:like(q)},{description:like(q)}]},take:30,orderBy:{createdAt:'desc'},select:{id:true,businessId:true,entryType:true,direction:true,amount:true,currency:true,providerReference:true,createdAt:true,invoiceId:true}}),
  db.merchantPayout.findMany({where:{OR:[{id:like(q)},{businessId:like(q)},{sourcePaymentId:like(q)},{phone:like(q)},...amountFilter,{providerReference:like(q)},{providerTransactionId:like(q)},{status:like(q)},{reason:like(q)}]},take:30,orderBy:{createdAt:'desc'},select:{id:true,businessId:true,phone:true,network:true,amount:true,currency:true,status:true,providerReference:true,providerTransactionId:true,holdUntil:true,createdAt:true}}),
  db.subscriptionPayment.findMany({where:{OR:[{id:like(q)},{businessId:like(q)},{plan:like(q)},{phone:like(q)},...amountFilter,{providerReference:like(q)},{providerTransactionId:like(q)},{status:like(q)}]},take:30,orderBy:{createdAt:'desc'},select:{id:true,businessId:true,plan:true,amount:true,currency:true,status:true,providerReference:true,providerTransactionId:true,createdAt:true}}),
  db.adminAnnouncement.findMany({where:{OR:[{id:like(q)},{subject:like(q)},{message:like(q)},{audience:like(q)}]},take:20,orderBy:{createdAt:'desc'},select:{id:true,subject:true,audience:true,createdAt:true}}),
  db.announcementView.findMany({where:{OR:[{id:like(q)},{announcementId:like(q)},{userId:like(q)},{businessId:like(q)}]},take:20,orderBy:{seenAt:'desc'},select:{id:true,announcementId:true,userId:true,businessId:true,seenAt:true}}),
  db.platformSettings.findMany({where:{id:like(q)},take:5,select:{id:true,testMode:true,basicLive:true,plusLive:true,proLive:true,platinumLive:true}})
 ];
 const settled=await Promise.allSettled(searchSources);
 const failedSources=settled.map((r,i)=>r.status==='rejected'?i:null).filter((i):i is number=>i!==null);
 const values:any[] = settled.map(r=>r.status==='fulfilled'?r.value:[]);
 const businesses=values[0] as Array<{id:string;name:string}>;
 const users=values[1] as Array<{id:string;email?:string;name?:string|null;isAdmin?:boolean}>;
 const businessMembers=values[2] as Array<{id:string;businessId:string;userId:string;role:string}>;
 const subscriptions=values[3] as Array<{id:string;businessId:string;plan:string;status:string;expiresAt:Date|null;maxInvoices:number}>;
 const changes=values[4] as Array<{id:string;businessId:string;fromPlan:string;toPlan:string;changedAt:Date;expiresAt?:Date|null}>;
 const customers=values[5] as Array<{id:string;businessId:string;name:string;email?:string|null;phone?:string|null}>;
 const products=values[6] as Array<{id:string;businessId:string;name:string;price:number|string}>;
 const items=values[7] as Array<{id:string;businessId:string;name:string;type:string;currency:string;price:number|string}>;
 const invoices=values[8] as Array<{id:string;number:string;status:string;businessId:string}>;
 const invoiceItems=values[9] as Array<{id:string;invoiceId:string;name:string;quantity:number;unitPrice:number;total:number}>;
 const payments=values[10] as Array<{id:string;provider:string;providerReference?:string|null;status:string;amount:number|string;businessId:string}>;
 const feedback=values[11] as Array<{id:string;subject:string;status:string;businessId:string}>;
 const audits=values[12] as Array<{id:string;action:string;target?:string|null;details?:string|null}>;
 const ledger=values[13] as Array<{id:string;businessId:string;entryType:string;direction:string;amount:number|string;currency:string;providerReference?:string|null;invoiceId?:string|null}>;
 const payouts=values[14] as Array<{id:string;businessId?:string|null;phone?:string|null;amount:number|string;currency:string;status:string;providerReference?:string|null;holdUntil?:Date|null}>;
 const subscriptionPayments=values[15] as Array<{id:string;businessId:string;plan:string;amount:number|string;currency:string;status:string;providerReference?:string|null}>;
 const announcements=values[16] as Array<{id:string;subject:string;audience:string;createdAt:Date}>;
 const announcementViews=values[17] as Array<{id:string;announcementId:string;userId:string;businessId?:string|null;seenAt:Date}>;
 const platformSettings=values[18] as Array<{id:string;testMode:boolean}>;
 const results=[
 ...businesses.map(x=>({type:'Merchant',id:x.id,title:x.name,detail:`Business ID: ${x.id}`,href:`/admin/businesses/${x.id}`})),
 ...users.map(x=>({type:x.isAdmin?'Admin user':'User',id:x.id,title:x.name||x.email,detail:`${x.email} · ID: ${x.id}`,href:null})),
 ...businessMembers.map(x=>({type:'Business member',id:x.id,title:x.role,detail:`Business: ${x.businessId} · User: ${x.userId}`,href:`/admin/businesses/${x.businessId}`})),
 ...subscriptions.map(x=>({type:'Subscription',id:x.id,title:`${x.plan} · ${x.status}`,detail:`Business: ${x.businessId} · Expires: ${x.expiresAt?.toLocaleString()||'—'}`,href:`/admin/businesses/${x.businessId}`})),
 ...changes.map(x=>({type:'Subscription change',id:x.id,title:`${x.fromPlan} → ${x.toPlan}`,detail:`Business: ${x.businessId} · ${x.changedAt.toLocaleString()}`,href:`/admin/businesses/${x.businessId}`})),
 ...customers.map(x=>({type:'Customer',id:x.id,title:x.name,detail:`${x.phone||x.email||'No contact'} · Business: ${x.businessId}`,href:`/admin/businesses/${x.businessId}`})),
 ...products.map(x=>({type:'Product',id:x.id,title:x.name,detail:`${x.price} · Business: ${x.businessId}`,href:`/admin/businesses/${x.businessId}`})),
 ...items.map(x=>({type:'Product/service item',id:x.id,title:x.name,detail:`${x.type} · ${x.currency} ${x.price} · Business: ${x.businessId}`,href:`/admin/businesses/${x.businessId}`})),
 ...invoices.map(x=>({type:'Invoice',id:x.id,title:x.number,detail:`${x.status} · Business: ${x.businessId}`,href:`/admin/businesses/${x.businessId}`})),
 ...payments.map((x)=>({type:'Payment',id:x.id,title:x.providerReference||x.provider,detail:`${x.status} · ${x.amount} · Business: ${x.businessId}`,href:`/admin/businesses/${x.businessId}`})),
 ...feedback.map(x=>({type:'Feedback',id:x.id,title:x.subject,detail:`${x.status} · Business: ${x.businessId}`,href:`/admin/businesses/${x.businessId}?from=feedback`})),
 ...audits.map(x=>({type:'Audit log',id:x.id,title:x.action,detail:`${x.target||'—'} · ${x.details||''}`,href:'/admin/audit'})),
 ...ledger.map(x=>({type:'Ledger entry',id:x.id,title:`${x.direction} ${x.entryType}`,detail:`${x.currency} ${x.amount.toString()} · Business: ${x.businessId} · ${x.providerReference||x.invoiceId||''}`,href:'/admin/payments'})),
 ...payouts.map(x=>({type:'Merchant payout',id:x.id,title:x.providerReference,detail:`${x.status} · ${x.currency} ${x.amount.toString()} → ${x.phone} · Hold: ${x.holdUntil?.toLocaleString()||'released'} · Business: ${x.businessId||'ADMIN'}`,href:'/admin/payments'})),
 ...subscriptionPayments.map(x=>({type:'Subscription payment',id:x.id,title:`${x.plan} · ${x.providerReference}`,detail:`${x.status} · ${x.currency} ${x.amount.toString()} · Business: ${x.businessId}`,href:'/admin/payments'})),
 ...announcements.map(x=>({type:'Announcement',id:x.id,title:x.subject,detail:`${x.audience} · ${x.createdAt.toLocaleString()}`,href:'/admin'})),
 ...announcementViews.map(x=>({type:'Announcement view',id:x.id,title:x.announcementId,detail:`User: ${x.userId} · Business: ${x.businessId||'—'} · ${x.seenAt.toLocaleString()}`,href:'/admin'})),
 ...platformSettings.map(x=>({type:'Platform settings',id:x.id,title:'Platform settings',detail:`Test mode: ${x.testMode}`,href:'/admin/manage'}))
 ];
 const uniqueResults=Array.from(new Map(results.map(r=>[`${r.type}:${r.id}`,r])).values());
 return NextResponse.json({results:uniqueResults.slice(0,100),degradedSources:failedSources.length});
}
