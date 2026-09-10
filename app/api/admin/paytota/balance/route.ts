import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';
import { getAccountBalance } from '@/lib/paytota';
export async function GET() {
  const uid = (await cookies()).get('merchantpay_session')?.value?.split('.')[0];
  const admin = uid ? await db.user.findUnique({ where: { id: uid }, select: { id: true, isAdmin: true } }) : null;
  if (!admin?.isAdmin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  try {
    const data = await getAccountBalance();
    return NextResponse.json({ ok: true, provider: 'PAYTOTA', currencies: data });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Unable to load Paytota balance.' }, { status: 502 });
  }
}
