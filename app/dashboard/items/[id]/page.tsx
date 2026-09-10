import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { currentBusiness } from "@/lib/current-user";

export default async function ItemDetail({params}:{params:Promise<{id:string}>}) {
  const context=await currentBusiness(); if(!context)redirect("/login"); if(context.business.suspended)redirect("/dashboard/suspended");
  const {id}=await params; const item=await db.item.findFirst({where:{id,businessId:context.business.id}}); if(!item)notFound();
  return <main className="dash"><aside className="side"><strong>MerchantPay</strong><nav className="nav">
    <Link href="/dashboard">Dashboard</Link><Link href="/dashboard/invoices">Invoices</Link><Link href="/dashboard/payments">Payments</Link><Link href="/dashboard/customers">Customers</Link><Link className="active" href="/dashboard/items">Products &amp; Services</Link>
  <Link href="/dashboard/reports">Reports</Link><Link href="/dashboard/settings">Settings</Link></nav></aside><section className="main"><div className="top"><div><p className="muted">{context.business.name}</p><h1>{item.name}</h1><p className="muted">{item.type==="PRODUCT"?"Product":"Service"}</p></div>
  <form action="/api/logout" method="post"><button className="btn" type="submit">Sign out</button></form></div>
  <div className="detail-actions"><Link className="btn" href="/dashboard/items">← Back to products &amp; services</Link></div>
  <section className="panel customer-detail">
    <div className="detail-item"><span className="muted">Name</span><strong>{item.name}</strong></div><div className="detail-item"><span className="muted">Type</span><strong>{item.type==="PRODUCT"?"Product":"Service"}</strong></div>
    <div className="detail-item"><span className="muted">Price</span><strong>{item.currency} {Number(item.price).toLocaleString()}</strong></div><div className="detail-item"><span className="muted">Status</span><strong>{item.active?"Active":"Inactive"}</strong></div>
    <div className="detail-item"><span className="muted">Description</span><strong>{item.description||"No description saved."}</strong></div><div className="detail-item"><span className="muted">Created</span><strong>{new Date(item.createdAt).toLocaleDateString()}</strong></div>
  </section></section></main>;
}
