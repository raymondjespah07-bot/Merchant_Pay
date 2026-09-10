import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { db } from '@/lib/db';
import AdminPayoutClient from './payout-client';
import PaytotaBalanceClient from './balance-client';

export default async function AdminPayments(){
 const uid=(await cookies()).get('merchantpay_session')?.value?.split('.')[0];
 const admin=uid?await db.user.findUnique({where:{id:uid},select:{id:true,isAdmin:true}}):null; if(!admin?.isAdmin)redirect('/login');
 const [payouts,subs,ledger]=await Promise.all([
  db.merchantPayout.findMany({orderBy:{createdAt:'desc'},take:100,include:{business:true,sourcePayment:{include:{invoice:true}}}}),
  db.subscriptionPayment.findMany({orderBy:{createdAt:'desc'},take:100,include:{business:true}}),
  db.ledgerEntry.findMany({orderBy:{createdAt:'desc'},take:100,include:{business:true,invoice:true}})
 ]);
 return <main className="dash"><aside className="side"><strong>MerchantPay Admin</strong><nav className="nav"><Link href="/admin">Overview</Link><Link href="/admin/feedback">Merchant feedback</Link><Link href="/admin/manage">Control center</Link><Link className="active" href="/admin/payments">Money center</Link><Link href="/admin/audit">Audit log</Link></nav></aside><section className="main"><div className="top"><div><p className="muted">Super administrator</p><h1>Money center</h1><p className="muted">Monitor Paytota collections, the one-hour merchant settlement hold, payouts and subscription payments.</p></div><Link className="btn" href="/admin">Back</Link></div>
 <PaytotaBalanceClient/><AdminPayoutClient/>
 <section className="panel"><h2>Recent merchant payouts</h2>{payouts.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Merchant</th><th>Invoice</th><th>Phone</th><th>Amount</th><th>Status</th><th>Hold until</th><th>Provider ref</th></tr></thead><tbody>{payouts.map(p=><tr key={p.id}><td>{p.createdAt.toLocaleString()}</td><td>{p.business?.name||'Admin/manual'}</td><td>{p.sourcePayment?.invoice.number||'—'}</td><td>{p.phone}</td><td>{p.currency} {p.amount.toString()}</td><td>{p.status}</td><td>{p.holdUntil?.toLocaleString()||'Released'}</td><td>{p.providerReference}</td></tr>)}</tbody></table></div>:<p className="muted">No payouts yet.</p>}</section>
 <section className="panel"><h2>Subscription payments</h2>{subs.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Merchant</th><th>Plan</th><th>Amount</th><th>Status</th><th>Provider ref</th></tr></thead><tbody>{subs.map(p=><tr key={p.id}><td>{p.createdAt.toLocaleString()}</td><td>{p.business.name}</td><td>{p.plan}</td><td>{p.currency} {p.amount.toString()}</td><td>{p.status}</td><td>{p.providerReference}</td></tr>)}</tbody></table></div>:<p className="muted">No subscription payments yet.</p>}</section>
 <section className="panel"><h2>Ledger</h2>{ledger.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Merchant</th><th>Type</th><th>Direction</th><th>Amount</th><th>Invoice</th><th>Provider ref</th></tr></thead><tbody>{ledger.map(x=><tr key={x.id}><td>{x.createdAt.toLocaleString()}</td><td>{x.business.name}</td><td>{x.entryType}</td><td>{x.direction}</td><td>{x.currency} {x.amount.toString()}</td><td>{x.invoice?.number||'—'}</td><td>{x.providerReference||'—'}</td></tr>)}</tbody></table></div>:<p className="muted">No ledger entries yet.</p>}</section>
 </section></main>;
}
