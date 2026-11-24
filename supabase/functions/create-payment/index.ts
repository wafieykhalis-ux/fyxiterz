// create-payment — PUBLIC. Creates a gateway payment intent for an order.
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
  provider?: string;
  /** Gateway channel id, e.g. "tng_ewallet" (Touch 'n Go eWallet), "fpx", "card". */
  payment_method?: string;
}

/**
 * Channels we allow through to the gateway. These ids match CHIP's
 * `payment_method_whitelist` values exactly, so they are passed through.
 * ToyyibPay configures its channels per-category, so it only accepts a
 * channel that its account already supports.
 */
const CHIP_CHANNELS = new Set([
  'tng_ewallet',
  'fpx',
  'card',
  'duitnow_qr',
  'grabpay',
  'boost',
  'shopee_pay',
]);

/** ToyyibPay does not offer TNG eWallet; reject it explicitly rather than silently downgrade. */
const TOYYIBPAY_UNSUPPORTED = new Set(['tng_ewallet', 'grabpay', 'boost', 'shopee_pay']);

interface OrderRow {
  id: string;
  order_code: string;
  total: number | string;
  customer_name: string | null;
  customer_email: string | null;
  customer_whatsapp: string | null;
  payment_status: string | null;
  payment_method: string | null;
}

type Provider = 'toyyibpay' | 'chip';

function siteUrl(): string {
  return (
    Deno.env.get('PUBLIC_SITE_URL') ??
    Deno.env.get('SITE_URL') ??
    'https://fyxiterz.com'
  ).replace(/\/+$/, '');
}

function callbackUrl(provider: Provider): string {
  const base = (Deno.env.get('SUPABASE_URL') ?? '').replace(/\/+$/, '');
  return `${base}/functions/v1/payment-webhook?provider=${provider}`;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await readJson<Body>(req);
    if (!body?.order_code) return badRequest('order_code is required');

    const provider = String(body.provider ?? Deno.env.get('PAYMENT_PROVIDER') ?? 'toyyibpay')
      .trim()
      .toLowerCase() as Provider;
    if (provider !== 'toyyibpay' && provider !== 'chip') {
      return badRequest("provider must be 'toyyibpay' or 'chip'");
    }

    const admin = adminClient();
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, order_code, total, customer_name, customer_email, customer_whatsapp, payment_status, payment_method')
      .eq('order_code', body.order_code)
      .maybeSingle();
    if (orderErr) return serverError(orderErr.message);
    if (!order) return notFound('Order not found');

    const typedOrder = order as OrderRow;
    if (typedOrder.payment_status === 'paid') {
      return badRequest('Order has already been paid');
    }

    // Resolve the requested gateway channel (falls back to what the order stored).
    const method = String(body.payment_method ?? typedOrder.payment_method ?? '')
      .trim()
      .toLowerCase();
    if (method && provider === 'toyyibpay' && TOYYIBPAY_UNSUPPORTED.has(method)) {
      return badRequest(
        `ToyyibPay does not support the '${method}' channel. Use provider 'chip' for Touch 'n Go eWallet.`,
      );
    }
    if (method && provider === 'chip' && !CHIP_CHANNELS.has(method)) {
      return badRequest(`Unsupported chip channel '${method}'`);
    }

    const amountCents = Math.round(Number(typedOrder.total) * 100);
    if (!Number.isFinite(amountCents) || amountCents <= 0) {
      return badRequest('Order total is invalid');
    }

    let providerRef = '';
    let checkoutUrl = '';
    let rawResponse: unknown = null;

    if (provider === 'toyyibpay') {
      const secretKey = Deno.env.get('TOYYIBPAY_SECRET_KEY');
      const categoryCode = Deno.env.get('TOYYIBPAY_CATEGORY_CODE');
      if (!secretKey) {
        return badRequest('Missing required env var TOYYIBPAY_SECRET_KEY for provider toyyibpay');
      }
      if (!categoryCode) {
        return badRequest('Missing required env var TOYYIBPAY_CATEGORY_CODE for provider toyyibpay');
      }

      const params = new URLSearchParams({
        userSecretKey: secretKey,
        categoryCode,
        billName: `FYXITERZ ${typedOrder.order_code}`.slice(0, 30),
        billDescription: `Payment for order ${typedOrder.order_code}`,
        billPriceSetting: '1',
        billPayorInfo: '1',
        billAmount: String(amountCents),
        billReturnUrl: `${siteUrl()}/order/${typedOrder.order_code}`,
        billCallbackUrl: callbackUrl('toyyibpay'),
        billExternalReferenceNo: typedOrder.order_code,
        billTo: typedOrder.customer_name ?? 'Customer',
        billEmail: typedOrder.customer_email ?? 'noreply@fyxiterz.com',
        billPhone: typedOrder.customer_whatsapp ?? '0000000000',
        billSplitPayment: '0',
      });

      const resp = await fetch('https://toyyibpay.com/index.php/api/createBill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params.toString(),
      });
      rawResponse = await resp.json().catch(async () => ({ raw: await resp.text() }));

      const bill = Array.isArray(rawResponse) ? rawResponse[0] : rawResponse;
      const billCode = (bill as Record<string, unknown>)?.BillCode;
      if (!resp.ok || !billCode) {
        return serverError(
          `ToyyibPay createBill failed: ${JSON.stringify(rawResponse).slice(0, 500)}`,
        );
      }
      providerRef = String(billCode);
      checkoutUrl = `https://toyyibpay.com/${providerRef}`;
    } else {
      const chipSecret = Deno.env.get('CHIP_SECRET_KEY');
      const brandId = Deno.env.get('CHIP_BRAND_ID');
      if (!chipSecret) {
        return badRequest('Missing required env var CHIP_SECRET_KEY for provider chip');
      }
      if (!brandId) {
        return badRequest('Missing required env var CHIP_BRAND_ID for provider chip');
      }

      const resp = await fetch('https://api.chip-in.asia/v1.1.0/purchases/', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${chipSecret}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          brand_id: brandId,
          amount: amountCents,
          currency: 'MYR',
          reference: typedOrder.order_code,
          success_redirect: `${siteUrl()}/order/${typedOrder.order_code}`,
          failure_redirect: `${siteUrl()}/order/${typedOrder.order_code}`,
          cancel_redirect: `${siteUrl()}/order/${typedOrder.order_code}`,
          callback_url: callbackUrl('chip'),
          product: { name: `Order ${typedOrder.order_code}` },
          // Restrict the gateway to the customer's chosen channel, e.g. TNG eWallet.
          ...(method ? { payment_method_whitelist: [method] } : {}),
        }),
      });
      rawResponse = await resp.json().catch(async () => ({ raw: await resp.text() }));

      const chip = rawResponse as Record<string, unknown>;
      const purchaseId = chip?.id;
      const url = chip?.checkout_url;
      if (!resp.ok || !purchaseId || !url) {
        return serverError(`Chip createPurchase failed: ${JSON.stringify(rawResponse).slice(0, 500)}`);
      }
      providerRef = String(purchaseId);
      checkoutUrl = String(url);
    }

    const { data: payment, error: payErr } = await admin
      .from('payments')
      .insert({
        order_id: typedOrder.id,
        provider,
        provider_ref: providerRef,
        provider_bill_code: provider === 'toyyibpay' ? providerRef : null,
        amount: Number(typedOrder.total),
        currency: 'MYR',
        status: 'pending',
        checkout_url: checkoutUrl,
        raw_response: rawResponse,
        payment_method: method || null,
      })
      .select('id')
      .single();
    if (payErr || !payment) return serverError(payErr?.message ?? 'Failed to store payment');
    const paymentId = payment.id as string;

    // Record the chosen channel on the order too (best-effort).
    if (method && method !== (typedOrder.payment_method ?? '')) {
      await admin.from('orders').update({ payment_method: method }).eq('id', typedOrder.id);
    }

    await admin.from('transactions').insert({
      order_id: typedOrder.id,
      payment_id: paymentId,
      type: 'payment_intent',
      amount: Number(typedOrder.total),
      status: 'pending',
      description: `Payment intent for ${typedOrder.order_code} via ${provider}`,
      reference: providerRef,
    });

    // Never leak gateway secrets — only the checkout URL + identifiers.
    return json(
      { checkout_url: checkoutUrl, payment_id: paymentId, provider_ref: providerRef },
      201,
    );
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
