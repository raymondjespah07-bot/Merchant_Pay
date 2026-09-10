"use client";
import Link from "next/link";
import { useMemo, useState } from "react";

type Item = { id:string; name:string; type:"PRODUCT"|"SERVICE"; description:string|null; price:string|number; currency:string; active:boolean; createdAt:string };

export default function ItemClient({initialItems, defaultCurrency}:{initialItems:Item[];defaultCurrency:string}) {
  const [items,setItems]=useState(initialItems),[query,setQuery]=useState(""),[type,setType]=useState("ALL");
  const [activeOnly,setActiveOnly]=useState(false),[open,setOpen]=useState(false),[editing,setEditing]=useState<Item|null>(null),[error,setError]=useState("");
  const visible=useMemo(()=>items.filter(i=>{const q=query.toLowerCase().trim();return(!q||i.name.toLowerCase().includes(q)||(i.description??"").toLowerCase().includes(q))&&(type==="ALL"||i.type===type)&&(!activeOnly||i.active)}),[items,query,type,activeOnly]);

  async function save(e:React.FormEvent<HTMLFormElement>){e.preventDefault();setError("");const form=e.currentTarget;const data=Object.fromEntries(new FormData(form));
    const activeInput = form.elements.namedItem("active");
    data.active = String(activeInput instanceof HTMLInputElement ? activeInput.checked : false);
    const r=await fetch(editing?`/api/items/${editing.id}`:"/api/items",{method:editing?"PATCH":"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(data)});const result=await r.json();
    if(!r.ok){setError(result.error??"Unable to save item.");return} const saved = {
      ...result.item,
      price: String(result.item.price),
      createdAt: String(result.item.createdAt),
      updatedAt: String(result.item.updatedAt)
    };
    setItems(p=>editing?p.map(x=>x.id===editing.id?saved:x):[saved,...p]);
    setEditing(null);setOpen(false);
  }
  async function remove(id:string){if(!confirm("Delete this item?"))return;const r=await fetch(`/api/items/${id}`,{method:"DELETE"});if(r.ok)setItems(p=>p.filter(x=>x.id!==id));}

  return <><div className="customer-toolbar">
    <input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search products and services..." />
    <select value={type} onChange={e=>setType(e.target.value)}><option value="ALL">All types</option><option value="PRODUCT">Products</option><option value="SERVICE">Services</option></select>
    <label className="check"><input type="checkbox" checked={activeOnly} onChange={e=>setActiveOnly(e.target.checked)}/> Active only</label>
    <button className="btn primary" onClick={()=>{setEditing(null);setError("");setOpen(true)}}>+ Add item</button>
  </div>
  <section className="panel">{visible.length===0?<div className="empty"><strong>{query||type!=="ALL"||activeOnly?"No matching items.":"No products or services yet."}</strong><br/>Add your first item to prepare for invoicing.</div>:
  <div className="customer-list">{visible.map(item=><div className="customer-row" key={item.id}>
    <Link className="customer-summary" href={`/dashboard/items/${item.id}`}><strong>{item.name}</strong>
      <div className="muted">{item.type==="PRODUCT"?"Product":"Service"} · {item.currency} {Number(item.price).toLocaleString()} · {item.active?"Active":"Inactive"}</div></Link>
    <div className="row-actions"><button className="btn" onClick={()=>{setEditing(item);setError("");setOpen(true)}}>Edit</button><button className="btn danger" onClick={()=>remove(item.id)}>Delete</button></div>
  </div>)}</div>}</section>
  {open&&<div className="modal-backdrop"><section className="modal"><h2>{editing?"Edit item":"Add product or service"}</h2>
    <form key={editing?.id ?? "new"} className="form" onSubmit={save}><label>Name<input name="name" required defaultValue={editing?.name??""}/></label>
    <label>Type<select name="type" defaultValue={editing?.type??"PRODUCT"}><option value="PRODUCT">Product</option><option value="SERVICE">Service</option></select></label>
    <label>Description<textarea name="description" rows={3} defaultValue={editing?.description??""}/></label>
    <label>Price<input name="price" type="number" min="0" step="0.01" required defaultValue={editing?.price??""}/></label>
    <label>Currency<input name="currency" maxLength={3} required defaultValue={editing?.currency??defaultCurrency}/></label>
    <label className="check"><input name="active" type="checkbox" defaultChecked={editing?.active??true}/> Active</label>
    {error&&<div className="error">{error}</div>}<div className="row-actions"><button type="button" className="btn" onClick={()=>setOpen(false)}>Cancel</button><button className="btn primary">{editing?"Save changes":"Add item"}</button></div></form>
  </section></div>}</>;
}
