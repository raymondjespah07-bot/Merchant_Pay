"use client";
import {useEffect,useRef,useState} from "react";
type A={id:string;subject:string;message:string;createdAt:string;seen:boolean};
export default function AnnouncementCenter(){
  const [all,setAll]=useState<A[]>([]);
  const [open,setOpen]=useState<A|null>(null);
  const loading=useRef(false);
  const load=async()=>{
    if(loading.current) return;
    loading.current=true;
    try{
      const r=await fetch('/api/announcements',{cache:'no-store',credentials:'same-origin'});
      if(!r.ok) return;
      const x:A[]=await r.json();
      setAll(x);
      setOpen(current=>{
        if(current) return current;
        return x.find(a=>!a.seen)||null;
      });
    }catch{}finally{loading.current=false}
  };
  useEffect(()=>{
    load();
    const i=window.setInterval(load,2000);
    return()=>window.clearInterval(i);
  },[]);
  const seen=async(a:A)=>{
    try{await fetch(`/api/announcements/${a.id}/seen`,{method:'POST',cache:'no-store'});}catch{}
    setAll(v=>v.map(x=>x.id===a.id?{...x,seen:true}:x));
    setOpen(null);
  };
  if(!open)return null;
  return <div className="modal-backdrop"><section className="modal-card announcement-popup"><p className="eyebrow">MerchantPay announcement</p><h2>{open.subject}</h2><p>{open.message}</p><small className="muted">{new Date(open.createdAt).toLocaleString()}</small><button className="btn primary" onClick={()=>seen(open)}>Got it</button></section></div>
}
