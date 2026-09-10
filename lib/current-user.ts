import { cookies } from "next/headers";
import { db } from "@/lib/db";
export async function currentBusiness(){
 const c=await cookies(); const raw=c.get("merchantpay_session")?.value; const userId=raw?.split(".")[0];
 if(!userId) return null;
 const member=await db.businessMember.findFirst({where:{userId},include:{business:true,user:true}});
 return member ? {user:member.user,business:member.business,membership:member}:null;
}
