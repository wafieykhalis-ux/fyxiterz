// payment-webhook — PUBLIC gateway callback (ToyyibPay / Chip). Idempotent.
import { handleOptions } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import {
  header,
  json,
  md5Hex,
  readBody,
  safeEqual,
  verifyHmacSha256,
  verifyRsaSha256,
} from '../_shared/util.ts';

interface OrderRow {
  id: string;
  order_code: string;
  total: number | string;
  payment_status: string | null;
  status: string | null;
}

/** Compare a gateway amount (ringgit or cents) against the order total. */
function amountMatches(returned: unknown, total: number): boolean {
  const value = Number(returned);
  if (!Number.isFinite(value)) return false;
  const ringgit = Math.round(total * 100) / 100;
  return Math.abs(value - ringgit) < 0.01 || Math.abs(value / 100 - ringgit) < 0.01;
}

/**
 * ToyyibPay sends `hash`. The exact concatenation differs across their docs, so
 * we accept the known variants. (Confirm against the current gateway reference
 * before going live.)
 */
async function verifyToyyibpayHash(
  secret: string,
  p: Record<string, string>,
  rawBody: string,
): Promise<boolean> {
  const provided = (p.hash ?? '').trim();
  if (!provided) return false;
  const refno = p.refno ?? '';
  const status = p.status ?? '';
  const candidates = [
    await md5Hex(secret + refno + status + 'ok'),
    await md5Hex(secret + refno + 'ok' + status),
    await md5Hex(secret + refno + status),
  ];
  if (candidates.some((c) => safeEqual(c, provided))) return true;
  // Fallback: allow a straight HMAC-SHA256 of the raw body.
  return (
    (await verifyHmacSha256(rawBody, secret, provided, 'hex')) ||
    (await verifyHmacSha256(rawBody, secret, provided, 'base64'))
  );
}

/** Mark a paid order + trigger auto-delivery. Idempotent at the DB level. */
async function applyPaid(
  admin: ReturnType<typeof adminClient>,
  order: OrderRow,
  provider: string,
  providerRef: string,
  gatewayStatus: string,
): Promise<void> {
  const now = new Date().toISOString();

  await admin
    .from('payments')
    .update({ status: 'paid', paid_at: now, updated_at: now })
    .eq('order_id', order.id)
    .eq('provider_ref', providerRef)
    .neq('status', 'paid');

  await admin
    .from('orders')
    .update({ payment_status: 'paid', status: 'paid', paid_at: now, updated_at: now })
    .eq('id', order.id);

  await admin.from('transactions').insert({
    order_id: order.id,
    type: 'sale',
    amount: Number(order.total),
    status: 'success',
    description: `Payment received via ${provider} (${gatewayStatus})`,
    reference: providerRef,
  });

  // Trigger delivery for auto-delivery items (best-effort, non-blocking).
  try {
    await admin.functions.invoke('process-delivery', {
      body: { order_id: order.id },
    });
  } catch {
    // Delivery can be retried later by staff.
  }
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const url = new URL(req.url);
    const { raw, form, json: parsedJson } = await readBody(req);

    // Normalise the payload into a flat key/value record.
    const payload: Record<string, string> = {};
    if (form) {
      for (const [k, v] of form.entries()) payload[k] = v;
    } else if (parsedJson && typeof parsedJson === 'object') {
      for (const [k, v] of Object.entries(parsedJson as Record<string, unknown>)) {
        payload[k] = v == null ? '' : String(v);
      }
    }

    const provider = (
      url.searchParams.get('provider') ??
      payload.provider ??
      Deno.env.get('PAYMENT_PROVIDER') ??
      (payload.billcode ? 'toyyibpay' : 'chip')
    ).toLowerCase();

    const admin = adminClient();

    if (provider === 'toyyibpay') {
      const secret = Deno.env.get('TOYYIBPAY_SECRET_KEY');
      if (!secret) return json({ error: 'Webhook not configured' }, 400);

      const ok = await verifyToyyibpayHash(secret, payload, raw);
      if (!ok) return json({ error: 'Invalid signature' }, 400);

      const orderCode = payload.order_id || payload.billExternalReferenceNo || '';
      const providerRef = payload.billcode || payload.refno || '';
      const gatewayStatus = payload.status ?? '';

      const { data: order } = await admin
        .from('orders')
        .select('id, order_code, total, payment_status, status')
        .eq('order_code', orderCode)
        .maybeSingle();
      if (!order) return json({ error: 'Order not found' }, 200);

      const typed = order as OrderRow;

      // Duplicate-webhook protection.
      if (typed.payment_status === 'paid') {
        return json({ ok: true, duplicate: true }, 200);
      }

      if (gatewayStatus === '1') {
        if (!amountMatches(payload.amount, Number(typed.total))) {
          const now = new Date().toISOString();
          await admin.from('payments').update({ status: 'failed', updated_at: now })
            .eq('order_id', typed.id).eq('provider_ref', providerRef);
          await admin.from('orders').update({ payment_status: 'failed', updated_at: now })
            .eq('id', typed.id);
          return json({ ok: true, error: 'Amount mismatch' }, 200);
        }
        await applyPaid(admin, typed, 'toyyibpay', providerRef, gatewayStatus);
      } else if (gatewayStatus === '2') {
        await admin.from('payments').update({ status: 'pending', updated_at: new Date().toISOString() })
          .eq('order_id', typed.id).eq('provider_ref', providerRef);
      } else {
        const now = new Date().toISOString();
        await admin.from('payments').update({ status: 'failed', updated_at: now })
          .eq('order_id', typed.id).eq('provider_ref', providerRef);
        await admin.from('orders').update({ payment_status: 'failed', updated_at: now })
          .eq('id', typed.id);
      }

      return json({ ok: true }, 200);
    }

    // --- Chip ------------------------------------------------------------------
    const chipSecret = Deno.env.get('CHIP_SECRET_KEY') ?? '';
    const publicKey = Deno.env.get('CHIP_PUBLIC_KEY') ?? '';
    const signature = header(req, 'x-signature');

    let verified = false;
    if (publicKey) verified = await verifyRsaSha256(raw, publicKey, signature);
    if (!verified && chipSecret) {
      verified =
        (await verifyHmacSha256(raw, chipSecret, signature, 'base64')) ||
        (await verifyHmacSha256(raw, chipSecret, signature, 'hex'));
    }
    if (!verified) return json({ error: 'Invalid signature' }, 400);

    const chipStatus = String(payload.status ?? '').toLowerCase(); // e.g. 'paid'
    const orderCode = payload.reference ?? '';
    const providerRef = payload.id ?? payload.purchase_id ?? '';

    const { data: order } = await admin
      .from('orders')
      .select('id, order_code, total, payment_status, status')
      .eq('order_code', orderCode)
      .maybeSingle();
    if (!order) return json({ error: 'Order not found' }, 200);

    const typed = order as OrderRow;
    if (typed.payment_status === 'paid') {
      return json({ ok: true, duplicate: true }, 200);
    }

    if (chipStatus === 'paid' || chipStatus === 'purchase.paid') {
      if (!amountMatches(payload.amount, Number(typed.total))) {
        const now = new Date().toISOString();
        await admin.from('payments').update({ status: 'failed', updated_at: now })
          .eq('order_id', typed.id).eq('provider_ref', providerRef);
        await admin.from('orders').update({ payment_status: 'failed', updated_at: now })
          .eq('id', typed.id);
        return json({ ok: true, error: 'Amount mismatch' }, 200);
      }
      await applyPaid(admin, typed, 'chip', providerRef, chipStatus);
    } else if (chipStatus === 'expired') {
      const now = new Date().toISOString();
      await admin.from('payments').update({ status: 'expired', updated_at: now })
        .eq('order_id', typed.id).eq('provider_ref', providerRef);
      await admin.from('orders').update({ payment_status: 'expired', updated_at: now })
        .eq('id', typed.id);
    }

    return json({ ok: true }, 200);
  } catch (err) {
    // Always 200 so the gateway does not aggressively retry malformed payloads.
    return json({ ok: false, error: err instanceof Error ? err.message : 'error' }, 200);
  }
});
