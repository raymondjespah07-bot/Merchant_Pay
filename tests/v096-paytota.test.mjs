import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('Paytota provider exposes collection, payout, status and balance operations',()=>{
 const source=read('lib/paytota.ts');
 for(const term of ['PAYTOTA_SECRET_KEY','PAYTOTA_BRAND_ID','account/json/balance','purchases','payouts','/p/','executionUrl']) assert.match(source,new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')));
 assert.doesNotMatch(source,/EASYPAY/i);
});

test('Paytota webhook verification uses RSA signature verification',()=>{
 const source=read('lib/paytota.ts'); const route=read('app/api/paytota/webhook/route.ts');
 assert.match(source,/createVerify/); assert.match(route,/x-signature|paytota-signature/i);
});

test('verified customer payments create a one-hour payout hold instead of immediate payout',()=>{
 const source=read('lib/payment-settlement.ts');
 assert.match(source,/HOLD_MS = 60 \* 60 \* 1000/); assert.match(source,/status: 'HELD'/); assert.match(source,/status: 'RELEASING'/); assert.match(source,/releaseDueMerchantPayouts/);
});

test('payout release endpoint is protected for an external scheduler and Vercel has no frequent cron',()=>{
 const route=read('app/api/cron/release-payouts/route.ts'); const vercel=read('vercel.json'); const setup=read('docs/PAYTOTA-V0.9.6.1-SETUP.md');
 assert.match(route,/CRON_SECRET/); assert.match(route,/releaseDueMerchantPayouts/);
 assert.doesNotMatch(vercel,/\"crons\"/); assert.doesNotMatch(vercel,/\* \* \* \* \*/);
 assert.match(setup,/external HTTP scheduler/i); assert.match(setup,/api\/cron\/release-payouts/); assert.match(setup,/Authorization: Bearer/);
});

test('admin Money Center exposes Paytota account balance fields',()=>{
 const route=read('app/api/admin/paytota/balance/route.ts'); const page=read('app/admin/payments/page.tsx');
 for(const term of ['balance','getAccountBalance','currencies']) assert.match(route,new RegExp(term));
 const balance=read('app/admin/payments/balance-client.tsx');
 for(const term of ['available_balance','reserved','pending_payouts','available_payout_balance']) assert.match(balance,new RegExp(term));
 assert.match(page,/Paytota|Money center/i);
});

test('manual admin payout uses Paytota and remains available',()=>{
 const route=read('app/api/admin/payout/route.ts'); const client=read('app/admin/payments/payout-client.tsx');
 assert.match(route,/createPayout|Paytota/); assert.match(client,/Manual Paytota payout/); assert.match(client,/Network/);
});

test('admin pages narrow uid lookup instead of producing string-or-user unions',()=>{
 for(const p of ['app/admin/audit/page.tsx','app/admin/payments/page.tsx','app/admin/manage/page.tsx','app/api/admin/overview/route.ts','app/api/admin/announcement/route.ts','app/api/admin/business/[id]/route.ts','app/api/admin/payout/route.ts']){
  assert.doesNotMatch(read(p),/const (u|admin)=uid&&await db\.user\.findUnique/);
 }
});

test('no production source imports or references legacy payment provider',()=>{
 const root=fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,''); const files=[];
 const walk=(dir)=>{for(const e of fs.readdirSync(dir,{withFileTypes:true})){if(['node_modules','.next'].includes(e.name))continue;const f=`${dir}/${e.name}`;if(e.isDirectory())walk(f);else if(/\.(ts|tsx|js|jsx|prisma|json)$/.test(e.name))files.push(f)}}; walk(root);
 const offenders=files.filter(f=>/legacy payment provider/i.test(fs.readFileSync(f,'utf8'))); assert.deepEqual(offenders,[]);
});
