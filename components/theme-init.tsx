"use client";
import {useEffect} from "react";

/**
 * Keeps the signed-in account's saved appearance fresh. The first request runs
 * immediately after login/page load, then preferences are refreshed every 2s.
 * This is account-backed (not localStorage), so accounts never leak themes.
 */
export default function ThemeInit(){
  useEffect(()=>{
    let cancelled=false;
    const apply=(payload:any)=>{
      if(cancelled) return;
      const p=payload?.preferences||payload||{};
      document.documentElement.dataset.theme=p?.theme||"indigo";
      document.documentElement.dataset.appearance=p?.appearance||"light";
      window.dispatchEvent(new CustomEvent("merchantpay:preferences",{detail:payload}));
    };
    const load=async()=>{
      try{
        const r=await fetch("/api/preferences",{cache:"no-store",credentials:"same-origin"});
        if(r.ok){
          const d=await r.json();
          apply(d?.preferences);
        }else if(r.status===401){
          apply({theme:"indigo",appearance:"light"});
        }
      }catch{}
    };
    load();
    const timer=window.setInterval(load,2000);
    return()=>{cancelled=true;window.clearInterval(timer)};
  },[]);
  return null;
}
