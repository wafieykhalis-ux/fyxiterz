// create-order — PUBLIC checkout. All prices are recomputed server-side.
import { handleOptions } from '../_shared/cors.ts';
import {
  adminClient,
  evaluateDiscount,
  resolveCaller,
} from '../_shared/supabase.ts';
import {
  badRequest,
  clientIp,
  isValidEmail,
  json,
  rateLimit,
  readJson,
  serverError,
} from '../_shared/util.ts';

interface CustomerInput {
  name?: string;
  email?: string;
  whatsapp?: string;
  game_id?: string;
  server_id?: string;
}

interface ItemInput {
  product_id?: string;
  variant_id?: string | null;
  quantity?: number;
}

interface Body {
  customer?: CustomerInput;
  items?: ItemInput[];
  discount_code?: string;
  /** Requested gateway channel id, e.g. "tng_ewallet". Stored for create-payment. */
  payment_method?: string;
}

/** Gateway / manual channels accepted at checkout. */
const PAYMENT_METHODS = new Set([
  'qr_transfer', // manual QR transfer, verified by staff
  'tng_ewallet',
  'fpx',
  'card',
  'duitnow_qr',
  'grabpay',
  'boost',
  'shopee_pay',
]);

interface ProductRow {
  id: string;
  name: string;
  regular_price: number | string;
  reseller_price: number | string | null;
  stock: number | null;
  is_active: boolean;
  auto_delivery: boolean;
}

interface VariantRow {
  id: string;
  product_id: string;
  name: string;
  price: number | string;
  reseller_price: number | string | null;
  stock: number | null;
  is_active: boolean;
}

interface LineItem {
  product_id: string;
  variant_id: string | null;
  product_name: string;
  variant_name: string | null;
  unit_price: number;
  quantity: number;
  subtotal: number;
  auto_delivery: boolean;
}

const num = (v: unknown): number => Number(v ?? 0);
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    // Best-effort rate limiting by IP.
    const ip = clientIp(req);
    const rl = rateLimit(`create-order:${ip}`, 20, 60_000);
    if (!rl.allowed) {
      return json({ error: 'Too many requests, please try again later' }, 429);
    }

    const body = await readJson<Body>(req);
    if (!body) return badRequest('Invalid JSON body');

    const customer = body.customer ?? {};
    const name = String(customer.name ?? '').trim();
    const email = String(customer.email ?? '').trim().toLowerCase();
    const whatsapp = String(customer.whatsapp ?? '').trim();
    if (!name) return badRequest('customer.name is required');
    if (!isValidEmail(email)) return badRequest('A valid customer.email is required');
    if (!whatsapp) return badRequest('customer.whatsapp is required');

    const paymentMethod = String(body.payment_method ?? '').trim().toLowerCase();
    if (paymentMethod && !PAYMENT_METHODS.has(paymentMethod)) {
      return badRequest(`Unsupported payment_method '${paymentMethod}'`);
    }

    const rawItems = Array.isArray(body.items) ? body.items : [];
    if (rawItems.length === 0) return badRequest('items[] must not be empty');
    // Validate the basic item shape before hitting the database.
    for (const raw of rawItems) {
      if (!raw.product_id) return badRequest('Each item requires product_id');
      const q = Number(raw.quantity);
      if (!Number.isInteger(q) || q < 1) {
        return badRequest('Each item requires an integer quantity >= 1');
      }
    }

    const admin = adminClient();

    // Optionally resolve an authenticated caller (public checkout has none).
    const caller = await resolveCaller(req);
    let resellerAccountId: string | null = null;
    if (caller?.role === 'reseller') {
      const { data: ra } = await admin
        .from('reseller_accounts')
        .select('id, status')
        .eq('profile_id', caller.id)
        .eq('status', 'active')
        .maybeSingle();
      if (ra?.id) resellerAccountId = ra.id as string;
    }
    const isResellerPricing = !!resellerAccountId;

    // Load all referenced products and variants.
    const productIds = Array.from(
      new Set(rawItems.map((i) => String(i.product_id ?? '')).filter(Boolean)),
    );
    const variantIds = Array.from(
      new Set(rawItems.map((i) => i.variant_id).filter((v): v is string => !!v)),
    );

    const { data: productRows, error: prodErr } = await admin
      .from('products')
      .select('id, name, regular_price, reseller_price, stock, is_active, auto_delivery')
      .in('id', productIds);
    if (prodErr) return serverError(prodErr.message);

    const { data: variantRows } = variantIds.length
      ? await admin
          .from('product_variants')
          .select('id, product_id, name, price, reseller_price, stock, is_active')
          .in('id', variantIds)
      : { data: [] as VariantRow[] };

    const products = new Map((productRows ?? []).map((p) => [p.id as string, p as ProductRow]));
    const variants = new Map(
      (variantRows ?? []).map((v) => [v.id as string, v as VariantRow]),
    );

    // Optional reseller-specific prices: reseller_prices > variant.reseller_price
    // > product.reseller_price.
    const resellerPriceByKey = new Map<string, number>();
    if (isResellerPricing) {
      const { data: rp } = await admin
        .from('reseller_prices')
        .select('product_id, variant_id, price')
        .eq('reseller_id', resellerAccountId)
        .in('product_id', productIds);
      for (const row of rp ?? []) {
        const key = `${row.product_id}:${row.variant_id ?? ''}`;
        resellerPriceByKey.set(key, num(row.price));
      }
    }

    // Build authoritative line items.
    const lineItems: LineItem[] = [];
    for (const raw of rawItems) {
      const productId = String(raw.product_id ?? '');
      const variantId = raw.variant_id ? String(raw.variant_id) : null;
      const quantity = Number(raw.quantity);
      if (!productId) return badRequest('Each item requires product_id');
      if (!Number.isInteger(quantity) || quantity < 1) {
        return badRequest('Each item requires an integer quantity >= 1');
      }

      const product = products.get(productId);
      if (!product || !product.is_active) {
        return badRequest(`Product ${productId} is not available`);
      }

      let variant: VariantRow | null = null;
      if (variantId) {
        variant = variants.get(variantId) ?? null;
        if (!variant || variant.product_id !== productId || !variant.is_active) {
          return badRequest(`Variant ${variantId} is not available for this product`);
        }
      }

      const stock = variant ? variant.stock : product.stock;
      if (stock != null && stock < quantity) {
        return badRequest(
          `Insufficient stock for ${product.name}${variant ? ` (${variant.name})` : ''}`,
        );
      }

      // Server-side price resolution — client prices are never trusted.
      let unitPrice: number;
      if (isResellerPricing) {
        const key = `${productId}:${variantId ?? ''}`;
        const fromTable = resellerPriceByKey.get(key);
        const fallback = variant ? variant.reseller_price : product.reseller_price;
        const chosen = fromTable ?? (fallback != null ? num(fallback) : null);
        unitPrice = chosen != null ? chosen : num(variant ? variant.price : product.regular_price);
      } else {
        unitPrice = num(variant ? variant.price : product.regular_price);
      }
      unitPrice = round2(unitPrice);

      lineItems.push({
        product_id: productId,
        variant_id: variantId,
        product_name: product.name,
        variant_name: variant?.name ?? null,
        unit_price: unitPrice,
        quantity,
        subtotal: round2(unitPrice * quantity),
        auto_delivery: !!product.auto_delivery,
      });
    }

    const subtotal = round2(lineItems.reduce((s, li) => s + li.subtotal, 0));

    // Discount (validated server-side; consumed below).
    let discountAmount = 0;
    let discountCodeId: string | null = null;
    let appliedCode: string | null = null;
    if (body.discount_code) {
      const d = await evaluateDiscount(admin, {
        code: body.discount_code,
        subtotal,
        email,
      });
      if (!d.valid) return badRequest(d.message);
      discountAmount = d.discount_amount;
      discountCodeId = d.discount_code_id ?? null;
      appliedCode = d.code ?? null;
    }

    const total = round2(Math.max(0, subtotal - discountAmount));

    // Reserve the order code from the DB helper.
    const { data: codeData, error: codeErr } = await admin.rpc('next_order_code');
    if (codeErr || !codeData) return serverError(codeErr?.message ?? 'Could not generate order code');
    const orderCode = String(codeData);

    // Persist the order.
    const { data: order, error: orderErr } = await admin
      .from('orders')
      .insert({
        order_code: orderCode,
        customer_name: name,
        customer_email: email,
        customer_whatsapp: whatsapp,
        game_id: customer.game_id ? String(customer.game_id) : null,
        server_id: customer.server_id ? String(customer.server_id) : null,
        subtotal,
        discount_amount: discountAmount,
        total,
        discount_code: appliedCode,
        payment_method: paymentMethod || null,
        status: 'pending',
        payment_status: 'unpaid',
        reseller_id: resellerAccountId,
      })
      .select('id')
      .single();
    if (orderErr || !order) return serverError(orderErr?.message ?? 'Failed to create order');
    const orderId = order.id as string;

    // Order items.
    const { error: itemsErr } = await admin.from('order_items').insert(
      lineItems.map((li) => ({
        order_id: orderId,
        product_id: li.product_id,
        variant_id: li.variant_id,
        product_name: li.product_name,
        variant_name: li.variant_name,
        unit_price: li.unit_price,
        quantity: li.quantity,
        subtotal: li.subtotal,
      })),
    );
    if (itemsErr) return serverError(itemsErr.message);

    // Swallow-on-error steps below are best-effort: the order already exists.
    if (discountCodeId) {
      await admin.from('discount_redemptions').insert({
        discount_code_id: discountCodeId,
        order_id: orderId,
        email,
        amount: discountAmount,
      });
    }

    // Decrement stock + increment sales counters.
    for (const li of lineItems) {
      try {
        if (li.variant_id) {
          const variant = variants.get(li.variant_id)!;
          if (variant.stock != null) {
            await admin
              .from('product_variants')
              .update({ stock: variant.stock - li.quantity })
              .eq('id', li.variant_id);
          }
        }
        const product = products.get(li.product_id)!;
        const patches: Record<string, unknown> = {};
        if (!li.variant_id && product.stock != null) patches.stock = product.stock - li.quantity;
        if (Object.keys(patches).length) {
          await admin.from('products').update(patches).eq('id', li.product_id);
        }
        await admin.rpc('increment_product_sales', {
          p_product: li.product_id,
          p_qty: li.quantity,
        });
      } catch {
        // Stock is best-effort here; the order is already committed.
      }
    }

    return json(
      {
        order_id: orderId,
        order_code: orderCode,
        subtotal,
        discount_amount: discountAmount,
        total,
      },
      201,
    );
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
