import { releaseDueMerchantPayouts } from '@/lib/payment-settlement';
export async function GET(request: Request) {
  const auth = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) return new Response('Unauthorized', { status: 401 });
  try {
    const results = await releaseDueMerchantPayouts();
    return Response.json({ ok: true, processed: results.length });
  } catch (error) {
    console.error('Payout release cron failed', error);
    return Response.json({ error: 'Payout release failed.' }, { status: 500 });
  }
}
