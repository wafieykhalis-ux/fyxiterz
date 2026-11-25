// update-order-status — staff (owner/admin) status/payment updates + audit.
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
  status?: string;
  payment_status?: string;
  notes?: string;
}

const ORDER_STATUSES = [
  'pending',
  'paid',
  'processing',
  'completed',
  'cancelled',
  'expired',
  'failed',
];
const PAYMENT_STATUSES = [
  'unpaid',
  'pending',
  'paid',
  'failed',
  'expired',
  'refunded',
];

interface OrderRow {
  id: string;
  order_code: string;
  status: string | null;
  payment_status: string | null;
  paid_at: string | null;
  completed_at: string | null;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const caller = await resolveCaller(req);
    if (!caller) return unauthorized('Authentication required');
    if (caller.role !== 'owner' && caller.role !== 'admin') {
      return forbidden('Only staff can update order status');
    }

    const body = await readJson<Body>(req);
    if (!body?.order_id) return badRequest('order_id is required');

    const admin = adminClient();
    const { data: order } = await admin
      .from('orders')
      .select('id, order_code, status, payment_status, paid_at, completed_at')
      .eq('id', body.order_id)
      .maybeSingle();
    if (!order) return notFound('Order not found');
    const typed = order as OrderRow;

    const update: Record<string, unknown> = {};
    const now = new Date().toISOString();

    if (body.status != null) {
      const status = String(body.status).toLowerCase();
      if (!ORDER_STATUSES.includes(status)) {
        return badRequest(`status must be one of: ${ORDER_STATUSES.join(', ')}`);
      }
      update.status = status;
      if (status === 'completed' && !typed.completed_at) update.completed_at = now;
    }

    if (body.payment_status != null) {
      const paymentStatus = String(body.payment_status).toLowerCase();
      if (!PAYMENT_STATUSES.includes(paymentStatus)) {
        return badRequest(`payment_status must be one of: ${PAYMENT_STATUSES.join(', ')}`);
      }
      update.payment_status = paymentStatus;
      if (paymentStatus === 'paid' && !typed.paid_at) update.paid_at = now;
    }

    if (body.notes != null) update.notes = String(body.notes);

    if (Object.keys(update).length === 0) return badRequest('No updatable fields provided');
    update.updated_at = now;

    const { error } = await admin.from('orders').update(update).eq('id', typed.id);
    if (error) return serverError(error.message);

    await writeAudit({
      actor_id: caller.id,
      actor_email: caller.email,
      action: 'update_order_status',
      entity_type: 'orders',
      entity_id: typed.id,
      details: { order_code: typed.order_code, changes: update },
      ip_address: clientIp(req),
      user_agent: req.headers.get('user-agent'),
    });

    // When an order becomes completed, ensure auto-delivery items are fulfilled.
    if (update.status === 'completed') {
      const { count } = await admin
        .from('order_items')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', typed.id);
      if ((count ?? 0) > 0) {
        try {
          await admin.functions.invoke('process-delivery', { body: { order_id: typed.id } });
        } catch {
          // Delivery can be retried by staff.
        }
      }
    }

    return json({ order_id: typed.id, updated: update });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
