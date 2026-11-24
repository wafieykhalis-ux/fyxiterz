// track-order — PUBLIC. Returns sanitized order tracking info for one customer.
import { handleOptions } from '../_shared/cors.ts';
import { adminClient } from '../_shared/supabase.ts';
import {
  badRequest,
  clientIp,
  isValidEmail,
  json,
  notFound,
  rateLimit,
  readJson,
  serverError,
} from '../_shared/util.ts';

interface Body {
  email?: string;
  order_code?: string;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await readJson<Body>(req);
    if (!body) return badRequest('Invalid JSON body');

    const email = String(body.email ?? '').trim().toLowerCase();
    const orderCode = String(body.order_code ?? '').trim();
    if (!isValidEmail(email)) return badRequest('A valid email is required');
    if (!orderCode) return badRequest('order_code is required');

    // Rate-limit by IP and by email to slow enumeration attempts.
    const ip = clientIp(req);
    if (!rateLimit(`track-order:ip:${ip}`, 30, 60_000).allowed) {
      return json({ error: 'Too many requests, please try again later' }, 429);
    }
    if (!rateLimit(`track-order:email:${email}`, 20, 60_000).allowed) {
      return json({ error: 'Too many requests, please try again later' }, 429);
    }

    const admin = adminClient();
    const { data: order, error } = await admin
      .from('orders')
      .select(
        'id, order_code, status, payment_status, total, created_at, paid_at, completed_at, customer_email',
      )
      .eq('order_code', orderCode)
      .maybeSingle();
    if (error) return serverError(error.message);
    // Never reveal whether the order exists for a different email.
    if (!order || String(order.customer_email ?? '').toLowerCase() !== email) {
      return notFound('No matching order found for this email');
    }

    const { data: items } = await admin
      .from('order_items')
      .select('id, product_name, variant_name, quantity, subtotal')
      .eq('order_id', order.id);

    const { data: deliveries } = await admin
      .from('deliveries')
      .select('order_item_id, delivery_type, status, sent_at, delivered_content')
      .eq('order_id', order.id);

    const isPaid = order.payment_status === 'paid';

    return json({
      order_code: order.order_code,
      status: order.status,
      payment_status: order.payment_status,
      total: Number(order.total),
      created_at: order.created_at,
      paid_at: order.paid_at,
      completed_at: order.completed_at,
      items: (items ?? []).map((i) => ({
        id: i.id,
        product_name: i.product_name,
        variant_name: i.variant_name,
        quantity: i.quantity,
        subtotal: Number(i.subtotal),
      })),
      // Delivered content is only revealed once payment is confirmed.
      deliveries: (deliveries ?? []).map((d) => ({
        order_item_id: d.order_item_id,
        delivery_type: d.delivery_type,
        status: d.status,
        sent_at: d.sent_at,
        delivered_content: isPaid ? d.delivered_content : null,
      })),
    });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
