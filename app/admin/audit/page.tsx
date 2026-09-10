import {cookies} from "next/headers";
import {redirect} from "next/navigation";
import Link from "next/link";
import {db} from "@/lib/db";
export default async function AuditLog(){
 const uid=(await cookies()).get("merchantpay_session")?.value?.split(".")[0];
 const u=uid?await db.user.findUnique({where:{id:uid},select:{id:true,isAdmin:true}}):null;
 if(!u?.isAdmin)redirect("/login");
 const logs=await db.adminAuditLog.findMany({orderBy:{createdAt:"desc"},take:500});
 return <main className="dash"><aside className="side"><strong>MerchantPay Admin</strong><nav className="nav"><Link href="/admin">Overview</Link><Link href="/admin/feedback">Merchant feedback</Link><Link href="/admin/manage">Control center</Link><Link href="/admin/payments">Money center</Link><Link className="active" href="/admin/audit">Audit log</Link></nav></aside><section className="main"><div className="top"><div><p className="muted">Super administrator</p><h1>Admin audit log</h1><p className="muted">Automatic records of sensitive administration changes.</p></div><Link className="btn" href="/admin">Back</Link></div><section className="panel"><div className="section-heading"><div><h2>Recent activity</h2><p className="muted">Newest first · up to 500 records.</p></div></div>{logs.length?<div className="table-wrap"><table className="data-table"><thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Target</th><th>Details</th></tr></thead><tbody>{logs.map(x=><tr key={x.id}><td>{x.createdAt.toLocaleString()}</td><td>{x.actorType}{x.actorUserId?` · ${x.actorUserId}`:""}</td><td>{x.action}</td><td>{x.target||"—"}</td><td>{x.details||"—"}</td></tr>)}</tbody></table></div>:<p className="muted">No audit records yet.</p>}</section></section></main>
}
