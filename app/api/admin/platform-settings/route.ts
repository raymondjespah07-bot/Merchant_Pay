import {NextResponse} from "next/server";
import {db} from "@/lib/db";
import {cookies} from "next/headers";
async function admin(){const id=(await cookies()).get("merchantpay_session")?.value?.split(".")[0];if(!id)return null;const u=await db.user.findUnique({where:{id},select:{id:true,isAdmin:true}});return u?.isAdmin?u:null}
async function settings(){return db.platformSettings.upsert({where:{id:"platform"},update:{},create:{id:"platform"}})}
export async function GET(){if(!await admin())return NextResponse.json({error:"Forbidden"},{status:403});return NextResponse.json(await settings())}
export async function PATCH(req:Request){
 const u=await admin();if(!u)return NextResponse.json({error:"Forbidden"},{status:403});
 const b=await req.json();
 const allowed=["testMode","basicLive","plusLive","proLive","platinumLive","basicTest","plusTest","proTest","platinumTest","liveExpirationMinutes","testExpirationMinutes"];
 const data:any={};
 for(const k of allowed){
   if(!(k in b))continue;
   if(k==="testMode")data[k]=!!b[k];
   else if(Number.isInteger(Number(b[k]))&&Number(b[k])>=1)data[k]=Number(b[k]);
 }
 // Basic prices may legitimately be zero.
 for(const k of ["basicLive","basicTest"])if(k in b&&Number.isInteger(Number(b[k]))&&Number(b[k])>=0)data[k]=Number(b[k]);
 const before=await settings();
 const after=await db.platformSettings.update({where:{id:"platform"},data});
 if(data.testMode!==undefined&&data.testMode!==before.testMode)await db.adminAuditLog.create({data:{adminId:u.id,action:data.testMode?"TEST_MODE_ENABLED":"TEST_MODE_DISABLED",target:"PlatformSettings",details:`Automatic mode switch recorded. ${data.testMode?"TEST MODE ACTIVE":"LIVE MODE ACTIVE"}`}});
 if(data.liveExpirationMinutes!==undefined&&data.liveExpirationMinutes!==before.liveExpirationMinutes)await db.adminAuditLog.create({data:{adminId:u.id,action:"LIVE_EXPIRATION_CHANGED",target:"PlatformSettings",details:`Live expiration period changed from ${before.liveExpirationMinutes} minutes to ${data.liveExpirationMinutes} minutes.`}});
 if(data.testExpirationMinutes!==undefined&&data.testExpirationMinutes!==before.testExpirationMinutes)await db.adminAuditLog.create({data:{adminId:u.id,action:"TEST_EXPIRATION_CHANGED",target:"PlatformSettings",details:`Test expiration period changed from ${before.testExpirationMinutes} minutes to ${data.testExpirationMinutes} minutes.`}});
 return NextResponse.json(after);
}
