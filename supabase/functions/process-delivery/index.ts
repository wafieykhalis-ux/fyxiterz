// process-delivery — staff (owner/admin) OR internal service-role invocation.
import { handleOptions } from '../_shared/cors.ts';
import { adminClient, resolveCaller, writeAudit } from '../_shared/supabase.ts';
import {
  badRequest,
  clientIp,
  forbidden,
  json,
  notFound,
  readJson,
  serverError,
  unauthorized,
} from '../_shared/util.ts';

interface Body {
  order_id?: string;
  order_item_id?: string;
}

interface OrderRow {
  id: string;
  order_code: string;
  customer_email: string | null;
  status: string | null;
}

interface OrderItemRow {
  id: string;
  order_id: string;
  product_id: string | null;
  product_name: string | null;
  variant_name: string | null;
}

interface ProductRow {
  id: string;
  name: string;
  auto_delivery: boolean;
}

/** Deterministic demo key, clearly labelled as auto-generated. */
async function generateContent(
  orderCode: string,
  productName: string,
  variantName: string | null,
  index: number,
): Promise<string> {
  const seed = `${orderCode}|${productName}|${variantName ?? '-'}|${index}`;
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(seed));
  const hex = Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .slice(0, 24)
    .toUpperCase();
  const label = variantName ? `${productName} - ${variantName}` : productName;
  return [
    '[AUTO-DELIVERY · DEMO KEY — auto-generated placeholder]',
    `Product : ${label}`,
    `Order   : ${orderCode}`,
    `Key     : FYX-${hex}`,
    '',
    'Replace with real delivery content from your supplier/stock integration.',
  ].join('\n');
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await readJson<Body>(req);
    if (!body?.order_id && !body?.order_item_id) {
      return badRequest('order_id or order_item_id is required');
    }

    const admin = adminClient();

    // Authorise: internal service-role call, or an owner/admin staff caller.
    const authHeader = req.headers.get('Authorization') ?? '';
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const isInternal = serviceKey !== '' && authHeader === `Bearer ${serviceKey}`;
    let actorId: string | null = null;
    let actorEmail: string | null = null;
    if (!isInternal) {
      const caller = await resolveCaller(req);
      if (!caller) return unauthorized('Authentication required');
      if (caller.role !== 'owner' && caller.role !== 'admin') {
        return forbidden('Only staff can process deliveries');
      }
      actorId = caller.id;
      actorEmail = caller.email;
    }

    let orderId = body.order_id ?? '';
    if (!orderId && body.order_item_id) {
      const { data: item } = await admin
        .from('order_items')
        .select('order_id')
        .eq('id', body.order_item_id)
        .maybeSingle();
      if (!item) return notFound('Order item not found');
      orderId = item.order_id as string;
    }

    const { data: order, error: orderErr } = await admin
      .from('orders')
      .select('id, order_code, customer_email, status')
      .eq('id', orderId)
      .maybeSingle();
    if (orderErr) return serverError(orderErr.message);
    if (!order) return notFound('Order not found');
    const typedOrder = order as OrderRow;

    // Load order items + product auto_delivery flags.
    const { data: items } = await admin
      .from('order_items')
      .select('id, order_id, product_id, product_name, variant_name')
      .eq('order_id', typedOrder.id);
    const orderItems = (items ?? []) as OrderItemRow[];

    const productIds = Array.from(
      new Set(orderItems.map((i) => i.product_id).filter((v): v is string => !!v)),
    );
    const { data: products } = productIds.length
      ? await admin.from('products').select('id, name, auto_delivery').in('id', productIds)
      : { data: [] as ProductRow[] };
    const productMap = new Map((products ?? []).map((p) => [p.id as string, p as ProductRow]));

    // Existing deliveries (for idempotency).
    const { data: existing } = await admin
      .from('deliveries')
      .select('order_item_id, status')
      .eq('order_id', typedOrder.id);
    const deliveredItemIds = new Set(
      (existing ?? []).filter((d) => d.status === 'sent').map((d) => d.order_item_id as string),
    );

    const now = new Date().toISOString();
    const receipientEmail = typedOrder.customer_email;
    let delivered = 0;
    let skipped = 0;
    const results: Array<Record<string, unknown>> = [];

    for (let i = 0; i < orderItems.length; i++) {
      const item = orderItems[i];
      const product = item.product_id ? productMap.get(item.product_id) : undefined;
      if (!product?.auto_delivery) continue;

      if (deliveredItemIds.has(item.id)) {
        skipped++;
        continue;
      }

      const content = await generateContent(
        typedOrder.order_code,
        item.product_name ?? product.name,
        item.variant_name,
        i,
      );

      const { error: insErr } = await admin.from('deliveries').insert({
        order_id: typedOrder.id,
        order_item_id: item.id,
        delivered_content: content,
        delivery_type: 'auto',
        status: 'sent',
        sent_at: now,
        sent_to: receipientEmail,
      });
      if (!insErr) {
        delivered++;
        deliveredItemIds.add(item.id);
        results.push({ order_item_id: item.id, status: 'sent' });
      }
    }

    // Move the order through 'processing' -> 'completed' once all auto items sent.
    const autoItemIds = orderItems
      .filter((i) => {
        const p = i.product_id ? productMap.get(i.product_id) : undefined;
        return !!p?.auto_delivery;
      })
      .map((i) => i.id);

    let finalStatus = typedOrder.status ?? 'pending';
    if (autoItemIds.length > 0 && autoItemIds.every((id) => deliveredItemIds.has(id))) {
      const completedAt = new Date().toISOString();
      await admin
        .from('orders')
        .update({ status: 'completed', completed_at: completedAt, updated_at: completedAt })
        .eq('id', typedOrder.id);
      finalStatus = 'completed';
    } else if (autoItemIds.length > 0 && typedOrder.status !== 'completed') {
      await admin
        .from('orders')
        .update({ status: 'processing', updated_at: new Date().toISOString() })
        .eq('id', typedOrder.id);
      finalStatus = 'processing';
    }

    await writeAudit({
      actor_id: actorId,
      actor_email: actorEmail ?? (isInternal ? 'system' : null),
      action: 'process_delivery',
      entity_type: 'orders',
      entity_id: typedOrder.id,
      details: { order_code: typedOrder.order_code, delivered, skipped },
      ip_address: clientIp(req),
      user_agent: req.headers.get('user-agent'),
    });

    return json({
      order_id: typedOrder.id,
      order_code: typedOrder.order_code,
      delivered,
      skipped,
      status: finalStatus,
      deliveries: results,
    });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
