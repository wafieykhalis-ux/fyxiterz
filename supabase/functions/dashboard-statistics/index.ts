// dashboard-statistics — staff (owner/admin) aggregate business metrics.
import { handleOptions } from '../_shared/cors.ts';
import { adminClient, resolveCaller } from '../_shared/supabase.ts';
import {
  forbidden,
  json,
  readJson,
  serverError,
  unauthorized,
} from '../_shared/util.ts';

interface Body {
  audit_logs?: boolean;
  staff?: boolean;
}

const LOW_STOCK_THRESHOLD = 5;

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const caller = await resolveCaller(req);
    if (!caller) return unauthorized('Authentication required');
    if (caller.role !== 'owner' && caller.role !== 'admin') {
      return forbidden('Only staff can view dashboard statistics');
    }

    const url = new URL(req.url);
    let body: Body | null = null;
    if (req.method === 'POST') body = await readJson<Body>(req);
    const wantsAudit = body?.audit_logs === true || url.searchParams.get('audit') === 'true';
    const wantsStaff = body?.staff === true || url.searchParams.get('staff') === 'true';

    const admin = adminClient();

    // --- Paid-order totals (summed client-side for portability) ---------------
    const { data: paidOrders } = await admin
      .from('orders')
      .select('total')
      .eq('payment_status', 'paid');
    const totalSales = (paidOrders ?? []).reduce((s, o) => s + Number(o.total ?? 0), 0);

    // Count rows in a table, optionally applying a filter builder.
    const countOf = async (
      table: string,
      apply?: (q: any) => any,
    ): Promise<number> => {
      let query: any = admin.from(table).select('id', { count: 'exact', head: true });
      if (apply) query = apply(query);
      const { count } = await query;
      return count ?? 0;
    };

    const [
      totalOrders,
      pendingOrders,
      completedOrders,
      cancelledOrders,
      totalCustomers,
      totalResellers,
      totalProducts,
      lowStockProducts,
    ] = await Promise.all([
      countOf('orders'),
      countOf('orders', (q) => q.eq('status', 'pending')),
      countOf('orders', (q) => q.eq('status', 'completed')),
      countOf('orders', (q) => q.eq('status', 'cancelled')),
      countOf('profiles', (q) => q.eq('role', 'customer')),
      countOf('profiles', (q) => q.eq('role', 'reseller')),
      countOf('products'),
      countOf('products', (q) => q.lte('stock', LOW_STOCK_THRESHOLD).eq('is_active', true)),
    ]);

    // --- Recent orders --------------------------------------------------------
    const { data: recentOrders } = await admin
      .from('orders')
      .select('order_code, customer_name, total, status, payment_status, created_at')
      .order('created_at', { ascending: false })
      .limit(10);

    // --- Sales by day (last 14 days) -----------------------------------------
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
    const { data: paidRecent } = await admin
      .from('orders')
      .select('total, created_at')
      .eq('payment_status', 'paid')
      .gte('created_at', since);
    const salesByDayMap = new Map<string, { total: number; orders: number }>();
    for (const o of paidRecent ?? []) {
      const day = String(o.created_at).slice(0, 10);
      const entry = salesByDayMap.get(day) ?? { total: 0, orders: 0 };
      entry.total += Number(o.total ?? 0);
      entry.orders += 1;
      salesByDayMap.set(day, entry);
    }
    const salesByDay = Array.from(salesByDayMap.entries())
      .map(([date, v]) => ({ date, total: v.total, orders: v.orders }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // --- Top products ---------------------------------------------------------
    const { data: topProducts } = await admin
      .from('products')
      .select('id, name, sku, sales_count')
      .order('sales_count', { ascending: false })
      .limit(5);

    // --- Revenue by category --------------------------------------------------
    let revenueByCategory: Array<{ category: string; revenue: number }> = [];
    try {
      const { data: items } = await admin
        .from('order_items')
        .select('subtotal, products!inner(category_id, categories(name))');
      const catMap = new Map<string, number>();
      for (const it of items ?? []) {
        const product = (it as Record<string, any>).products;
        const catName = product?.categories?.name ?? 'Uncategorised';
        catMap.set(catName, (catMap.get(catName) ?? 0) + Number(it.subtotal ?? 0));
      }
      revenueByCategory = Array.from(catMap.entries())
        .map(([category, revenue]) => ({ category, revenue }))
        .sort((a, b) => b.revenue - a.revenue);
    } catch {
      revenueByCategory = [];
    }

    // --- Low-stock list (name + stock) for the dashboard panel ----------------
    const { data: lowStockList } = await admin
      .from('products')
      .select('name, stock')
      .lte('stock', LOW_STOCK_THRESHOLD)
      .eq('is_active', true)
      .order('stock', { ascending: true })
      .limit(10);

    const payload: Record<string, unknown> = {
      total_sales: totalSales,
      total_orders: totalOrders,
      pending_orders: pendingOrders,
      completed_orders: completedOrders,
      cancelled_orders: cancelledOrders,
      total_customers: totalCustomers,
      total_resellers: totalResellers,
      total_products: totalProducts,
      low_stock_products: lowStockProducts,
      low_stock_list: lowStockList ?? [],
      recent_orders: recentOrders ?? [],
      sales_by_day: salesByDay,
      top_products: topProducts ?? [],
      revenue_by_category: revenueByCategory,
    };

    // --- Owner-only extras ----------------------------------------------------
    if (caller.role === 'owner') {
      if (wantsAudit) {
        const { data: audit } = await admin
          .from('audit_logs')
          .select('id, actor_email, action, entity_type, entity_id, details, created_at')
          .order('created_at', { ascending: false })
          .limit(100);
        payload.audit_logs = audit ?? [];
      }
      if (wantsStaff) {
        const { data: staff } = await admin
          .from('profiles')
          .select('id, email, full_name, role, is_active, created_at')
          .in('role', ['owner', 'admin', 'reseller'])
          .order('created_at', { ascending: true });
        payload.staff = staff ?? [];
      }
    }

    return json(payload);
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
