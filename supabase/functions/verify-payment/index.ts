// verify-payment — PUBLIC. Returns server-side payment truth, optionally reconciling.
import { handleOptions } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import {
  badRequest,
  json,
  notFound,
  readJson,
  serverError,
} from '../_shared/util.ts';

interface Body {
  order_code?: string;
}

interface OrderRow {
  id: string;
  order_code: string;
  total: number | string;
  payment_status: string | null;
  status: string | null;
  paid_at: string | null;
}

interface PaymentRow {
  id: string;
  provider: string;
  provider_ref: string | null;
  status: string | null;
}

/** Ask ToyyibPay whether the bill has been paid. */
async function toyyibpayIsPaid(secret: string, billCode: string): Promise<boolean | null> {
  try {
    const resp = await fetch('https://toyyibpay.com/index.php/api/getBillTransactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ billCode, billpaymentStatus: '1' }).toString(),
    });
    const data = await resp.json();
    const rows = Array.isArray(data) ? data : [];
    return rows.some((r) => String((r as Record<string, unknown>).billpaymentStatus) === '1');
  } catch {
    return null;
  }
}

/** Ask Chip whether the purchase has been paid. */
async function chipIsPaid(secret: string, purchaseId: string): Promise<boolean | null> {
  try {
    const resp = await fetch(`https://api.chip-in.asia/v1.1.0/purchases/${purchaseId}/`, {
      headers: { Authorization: `Bearer ${secret}` },
    });
    if (!resp.ok) return null;
    const data = await resp.json() as Record<string, unknown>;
    const status = String(data.status ?? '').toLowerCase();
    return status === 'paid' || status === 'purchase.paid';
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await readJson<Body>(req);
    if (!body?.order_code) return badRequest('order_code is required');

    const admin = adminClient();
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, order_code, total, payment_status, status, paid_at')
      .eq('order_code', body.order_code)
      .maybeSingle();
    if (orderErr) return serverError(orderErr.message);
    if (!order) return notFound('Order not found');

    let typed = order as OrderRow;

    // If the DB says unpaid, actively reconcile with the gateway.
    if (typed.payment_status !== 'paid') {
      const { data: payment } = await admin
        .from('payments')
        .select('id, provider, provider_ref, status')
        .eq('order_id', typed.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const typedPayment = payment as PaymentRow | null;
      if (typedPayment?.provider_ref) {
        let gatewayPaid: boolean | null = null;
        if (typedPayment.provider === 'toyyibpay') {
          const secret = Deno.env.get('TOYYIBPAY_SECRET_KEY');
          if (secret) gatewayPaid = await toyyibpayIsPaid(secret, typedPayment.provider_ref);
        } else if (typedPayment.provider === 'chip') {
          const secret = Deno.env.get('CHIP_SECRET_KEY');
          if (secret) gatewayPaid = await chipIsPaid(secret, typedPayment.provider_ref);
        }

        if (gatewayPaid === true) {
          const now = new Date().toISOString();
          await admin.from('payments')
            .update({ status: 'paid', paid_at: now, updated_at: now })
            .eq('id', typedPayment.id);
          await admin.from('orders')
            .update({ payment_status: 'paid', status: 'paid', paid_at: now, updated_at: now })
            .eq('id', typed.id);
          await admin.from('transactions').insert({
            order_id: typed.id,
            payment_id: typedPayment.id,
            type: 'sale',
            amount: Number(typed.total),
            status: 'success',
            description: `Payment reconciled via ${typedPayment.provider}`,
            reference: typedPayment.provider_ref,
          });
          try {
            await admin.functions.invoke('process-delivery', { body: { order_id: typed.id } });
          } catch {
            // delivery retried later by staff
          }
          typed = { ...typed, payment_status: 'paid', status: 'paid', paid_at: now };
        }
      }
    }

    return json({
      order_code: typed.order_code,
      payment_status: typed.payment_status ?? 'unpaid',
      status: typed.status,
      total: Number(typed.total),
      paid_at: typed.paid_at,
    });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
