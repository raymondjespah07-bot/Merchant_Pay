"use client";
import {useEffect,useState} from "react";
export default function AdminAppearance(){
    const[theme,setTheme]=useState("indigo"),[appearance,setAppearance]=useState("light");
    useEffect(()=>{
        fetch("/api/settings").then(r=>r.json()).then(d=>{
            setTheme(d.preferences?.theme||"indigo");
            setAppearance(d.preferences?.appearance||"light")
        })
    },[]);
    async function save(x:any){
        if(x.theme){
            setTheme(x.theme);
            document.documentElement.dataset.theme=x.theme
        }if(x.appearance){
            setAppearance(x.appearance);
            document.documentElement.dataset.appearance=x.appearance
        }await fetch("/api/settings",{
            method:"PATCH",
            headers:{"Content-Type":"application/json"},
            body:JSON.stringify(x)
        })
    }
    return <section className="panel"><h2>Admin appearance</h2><p className="muted">Your Super Admin account has its own saved appearance and accent.</p><div className="theme-controls"><label>Background<select value={appearance} 
    onChange={
        e=>save({
            appearance:e.target.value
        })
    }><option value="light">Light</option>
    <option value="dark">Dark</option></select></label>
    <label>Accent<select value={theme} onChange={
        e=>save({
            theme:e.target.value
        })
    }>
    <option value="indigo">Indigo</option>
    <option value="emerald">Emerald</option>
    <option value="violet">Violet</option>
    <option value="rose">Rose</option>
    <option value="amber">Amber</option>
    </select></label></div></section>
}
