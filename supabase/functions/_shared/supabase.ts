// Shared Supabase client factories + small domain helpers for Edge Functions.
import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { requireEnv, round2 } from './util.ts';

/**
 * Service-role client.
 *
 * Bypasses Row Level Security. Use ONLY inside Edge Functions and NEVER expose
 * this client (or its key) to the browser.
 */
export function adminClient(): SupabaseClient {
  const url = requireEnv('SUPABASE_URL');
  const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
  return createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Per-request client bound to the caller's Authorization header and the anon
 * key. Used only to resolve the authenticated caller via auth.getUser().
 */
export function userClient(req: Request): SupabaseClient {
  const url = requireEnv('SUPABASE_URL');
  const anonKey = requireEnv('SUPABASE_ANON_KEY');
  const authHeader = req.headers.get('Authorization') ?? '';
  return createClient(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
    global: { headers: { Authorization: authHeader } },
  });
}

export interface Caller {
  id: string;
  email: string | null;
  role: string;
  profile: Record<string, unknown> | null;
}

/** Resolve the authenticated caller (or null) using the request's auth header. */
export async function resolveCaller(req: Request): Promise<Caller | null> {
  try {
    const client = userClient(req);
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    const admin = adminClient();
    const { data: profile } = await admin
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .maybeSingle();
    return {
      id: user.id,
      email: user.email ?? ((profile?.email as string | null) ?? null),
      role: (profile?.role as string | null) ?? 'customer',
      profile: (profile as Record<string, unknown> | null) ?? null,
    };
  } catch {
    return null;
  }
}

/** True when the caller holds one of the given roles. */
export function hasRole(caller: Caller | null, ...roles: string[]): boolean {
  return !!caller && roles.includes(caller.role);
}

export interface AuditEntry {
  actor_id?: string | null;
  actor_email?: string | null;
  action: string;
  entity_type?: string | null;
  entity_id?: string | null;
  details?: unknown;
  ip_address?: string | null;
  user_agent?: string | null;
}

/** Write an audit log entry. Never throws — auditing must not break the flow. */
export async function writeAudit(entry: AuditEntry): Promise<void> {
  try {
    await adminClient().from('audit_logs').insert({
      actor_id: entry.actor_id ?? null,
      actor_email: entry.actor_email ?? null,
      action: entry.action,
      entity_type: entry.entity_type ?? null,
      entity_id: entry.entity_id ?? null,
      details: entry.details ?? null,
      ip_address: entry.ip_address ?? null,
      user_agent: entry.user_agent ?? null,
    });
  } catch {
    // best-effort only
  }
}

// --- Discount evaluation -----------------------------------------------------

export interface DiscountInput {
  code?: string | null;
  subtotal: number;
  email?: string | null;
}

export interface DiscountResult {
  valid: boolean;
  code?: string;
  discount_code_id?: string;
  discount_amount: number;
  discount_type?: string;
  discount_value?: number;
  message: string;
}

/**
 * Validate a discount code server-side without consuming it. Consumption happens
 * inside create-order / reseller-purchase.
 */
export async function evaluateDiscount(
  admin: SupabaseClient,
  input: DiscountInput,
): Promise<DiscountResult> {
  const code = String(input.code ?? '').trim().toUpperCase();
  if (!code) return { valid: false, discount_amount: 0, message: 'No discount code provided' };

  const { data: dc, error } = await admin
    .from('discount_codes')
    .select('*')
    .eq('code', code)
    .maybeSingle();
  if (error || !dc) {
    return { valid: false, discount_amount: 0, message: 'Invalid discount code' };
  }

  const now = Date.now();
  if (!dc.is_active) {
    return { valid: false, code, discount_amount: 0, message: 'Discount code is not active' };
  }
  if (dc.starts_at && new Date(dc.starts_at as string).getTime() > now) {
    return { valid: false, code, discount_amount: 0, message: 'Discount code is not yet active' };
  }
  if (dc.expires_at && new Date(dc.expires_at as string).getTime() < now) {
    return { valid: false, code, discount_amount: 0, message: 'Discount code has expired' };
  }
  if (dc.min_purchase != null && input.subtotal < Number(dc.min_purchase)) {
    return {
      valid: false,
      code,
      discount_amount: 0,
      message: `Minimum purchase of ${dc.min_purchase} required`,
    };
  }
  if (dc.max_uses != null && Number(dc.used_count ?? 0) >= Number(dc.max_uses)) {
    return { valid: false, code, discount_amount: 0, message: 'Discount code usage limit reached' };
  }
  if (dc.max_uses_per_user != null && input.email) {
    const { count } = await admin
      .from('discount_redemptions')
      .select('id', { count: 'exact', head: true })
      .eq('discount_code_id', dc.id)
      .eq('email', String(input.email).toLowerCase());
    if ((count ?? 0) >= Number(dc.max_uses_per_user)) {
      return {
        valid: false,
        code,
        discount_amount: 0,
        message: 'You have already used this discount code',
      };
    }
  }

  const type = String(dc.discount_type ?? '').toLowerCase();
  const value = Number(dc.discount_value ?? 0);
  let amount: number;
  if (type === 'percentage' || type === 'percent') amount = input.subtotal * (value / 100);
  else amount = value; // fixed / amount
  amount = Math.min(Math.max(round2(amount), 0), input.subtotal);

  return {
    valid: true,
    code: dc.code as string,
    discount_code_id: dc.id as string,
    discount_amount: amount,
    discount_type: dc.discount_type as string,
    discount_value: value,
    message: 'Discount applied',
  };
}
