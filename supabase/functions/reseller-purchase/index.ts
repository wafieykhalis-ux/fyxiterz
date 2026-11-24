// reseller-purchase — RESELLER only. Server-side reseller pricing + wallet debit.
import { handleOptions } from '../_shared/cors.ts';
import { adminClient, resolveCaller, writeAudit } from '../_shared/supabase.ts';
import {
  badRequest,
  clientIp,
  forbidden,
  isValidEmail,
  json,
  rateLimit,
  readJson,
  serverError,
  unauthorized,
} from '../_shared/util.ts';

interface ItemInput {
  product_id?: string;
  variant_id?: string | null;
  quantity?: number;
}

interface Body {
  items?: ItemInput[];
  customer?: {
    name?: string;
    email?: string;
    whatsapp?: string;
    game_id?: string;
    server_id?: string;
  };
  use_wallet?: boolean;
}

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

const num = (v: unknown): number => Number(v ?? 0);
const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const caller = await resolveCaller(req);
    if (!caller) return unauthorized('Authentication required');

    const ip = clientIp(req);
    if (!rateLimit(`reseller-purchase:${caller.id}`, 60, 60_000).allowed) {
      return json({ error: 'Too many requests, please try again later' }, 429);
    }

    const admin = adminClient();

    // Must be an active reseller account.
    const { data: account } = await admin
      .from('reseller_accounts')
      .select('id, status')
      .eq('profile_id', caller.id)
      .maybeSingle();
    if (!account) return forbidden('No reseller account found for this user');
    if (account.status !== 'active') return forbidden('Reseller account is not active');
    const resellerId = account.id as string;

    const body = await readJson<Body>(req);
    if (!body) return badRequest('Invalid JSON body');

    const customer = body.customer ?? {};
    const name = String(customer.name ?? '').trim();
    const email = String(customer.email ?? '').trim().toLowerCase();
    const whatsapp = String(customer.whatsapp ?? '').trim();
    if (!name) return badRequest('customer.name is required');
    if (!isValidEmail(email)) return badRequest('A valid customer.email is required');
    if (!whatsapp) return badRequest('customer.whatsapp is required');

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

    const { data: resellerPrices } = await admin
      .from('reseller_prices')
      .select('product_id, variant_id, price')
      .eq('reseller_id', resellerId)
      .in('product_id', productIds);

    const products = new Map((productRows ?? []).map((p) => [p.id as string, p as ProductRow]));
    const variants = new Map((variantRows ?? []).map((v) => [v.id as string, v as VariantRow]));
    const priceOverrides = new Map(
      (resellerPrices ?? []).map((r) => [
        `${r.product_id}:${r.variant_id ?? ''}`,
        num(r.price),
      ]),
    );

    const lineItems: Array<Record<string, unknown>> = [];
    for (const raw of rawItems) {
      const productId = String(raw.product_id ?? '');
      const variantId = raw.variant_id ? String(raw.variant_id) : null;
      const quantity = Number(raw.quantity);
      if (!productId) return badRequest('Each item requires product_id');
      if (!Number.isInteger(quantity) || quantity < 1) {
        return badRequest('Each item requires an integer quantity >= 1');
      }

      const product = products.get(productId);
      if (!product || !product.is_active) return badRequest(`Product ${productId} is not available`);

      let variant: VariantRow | null = null;
      if (variantId) {
        variant = variants.get(variantId) ?? null;
        if (!variant || variant.product_id !== productId || !variant.is_active) {
          return badRequest(`Variant ${variantId} is not available`);
        }
      }

      const stock = variant ? variant.stock : product.stock;
      if (stock != null && stock < quantity) {
        return badRequest(`Insufficient stock for ${product.name}`);
      }

      // reseller_prices > variant.reseller_price > product.reseller_price > regular
      const key = `${productId}:${variantId ?? ''}`;
      const override = priceOverrides.get(key);
      const variantReseller = variant?.reseller_price;
      const productReseller = product.reseller_price;
      const chosen =
        override ?? (variantReseller != null ? num(variantReseller) : null) ??
        (productReseller != null ? num(productReseller) : null);
      const unitPrice = round2(
        chosen != null ? chosen : num(variant ? variant.price : product.regular_price),
      );

      lineItems.push({
        product_id: productId,
        variant_id: variantId,
        product_name: product.name,
        variant_name: variant?.name ?? null,
        unit_price: unitPrice,
        quantity,
        subtotal: round2(unitPrice * quantity),
        auto_delivery: !!product.auto_delivery,
        _stock: stock,
      });
    }

    const subtotal = round2(lineItems.reduce((s, li) => s + Number(li.subtotal), 0));
    const total = subtotal;

    const { data: codeData, error: codeErr } = await admin.rpc('next_order_code');
    if (codeErr || !codeData) return serverError(codeErr?.message ?? 'Could not generate order code');
    const orderCode = String(codeData);

    const useWallet = !!body.use_wallet;
    let walletId: string | null = null;

    if (useWallet) {
      const { data: wallet } = await admin
        .from('wallets')
        .select('id, balance')
        .eq('profile_id', caller.id)
        .maybeSingle();
      if (!wallet) return badRequest('No wallet found for this account');
      if (num(wallet.balance) < total) return badRequest('Insufficient wallet balance');
      walletId = wallet.id as string;

      // Atomic debit through the DB helper (negative amount = debit).
      const { data: txnResult, error: txnErr } = await admin.rpc('apply_wallet_txn', {
        p_wallet: walletId,
        p_amount: -total,
        p_type: 'purchase',
        p_desc: `Reseller purchase ${orderCode}`,
        p_ref: orderCode,
      });
      if (txnErr) return serverError(txnErr.message);
      const ok = (txnResult as { success?: boolean } | null)?.success !== false;
      if (!ok) return badRequest('Wallet debit failed (insufficient balance)');
    }

    const now = new Date().toISOString();
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
        discount_amount: 0,
        total,
        status: useWallet ? 'paid' : 'pending',
        payment_status: useWallet ? 'paid' : 'unpaid',
        paid_at: useWallet ? now : null,
        reseller_id: resellerId,
      })
      .select('id')
      .single();
    if (orderErr || !order) return serverError(orderErr?.message ?? 'Failed to create order');
    const orderId = order.id as string;

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

    if (useWallet && walletId) {
      await admin.from('transactions').insert({
        order_id: orderId,
        type: 'sale',
        amount: total,
        status: 'success',
        description: `Wallet payment for ${orderCode}`,
        reference: orderCode,
      });
    }

    // Best-effort stock + sales updates.
    for (const li of lineItems) {
      try {
        const variantId = li.variant_id as string | null;
        if (variantId) {
          const variant = variants.get(variantId)!;
          if (variant.stock != null) {
            await admin.from('product_variants')
              .update({ stock: variant.stock - Number(li.quantity) })
              .eq('id', variantId);
          }
        }
        const product = products.get(String(li.product_id))!;
        if (!variantId && product.stock != null) {
          await admin.from('products')
            .update({ stock: product.stock - Number(li.quantity) })
            .eq('id', product.id);
        }
        await admin.rpc('increment_product_sales', {
          p_product: li.product_id,
          p_qty: Number(li.quantity),
        });
      } catch {
        // best-effort
      }
    }

    await writeAudit({
      actor_id: caller.id,
      actor_email: caller.email,
      action: 'reseller_purchase',
      entity_type: 'orders',
      entity_id: orderId,
      details: { order_code: orderCode, total, use_wallet: useWallet },
      ip_address: ip,
      user_agent: req.headers.get('user-agent'),
    });

    // Wallet-paid orders can be auto-delivered straight away.
    if (useWallet) {
      try {
        await admin.functions.invoke('process-delivery', { body: { order_id: orderId } });
      } catch {
        // staff can retry
      }
      return json({ order_id: orderId, order_code: orderCode, subtotal, total }, 201);
    }

    // Otherwise mint a checkout URL via the public payment flow.
    let checkoutUrl: string | null = null;
    try {
      const { data: payData } = await admin.functions.invoke('create-payment', {
        body: { order_code: orderCode },
      });
      checkoutUrl = (payData as { checkout_url?: string } | null)?.checkout_url ?? null;
    } catch {
      checkoutUrl = null;
    }

    return json({ order_id: orderId, order_code: orderCode, subtotal, total, checkout_url: checkoutUrl }, 201);
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
