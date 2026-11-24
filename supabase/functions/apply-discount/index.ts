// apply-discount — PUBLIC. Validates a discount code without consuming it.
import { handleOptions } from '../_shared/cors.ts';
import { adminClient, evaluateDiscount } from '../_shared/supabase.ts';
import { badRequest, json, readJson, serverError } from '../_shared/util.ts';

interface Body {
  code?: string;
  subtotal?: number;
  email?: string;
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const body = await readJson<Body>(req);
    if (!body) return badRequest('Invalid JSON body');

    const code = String(body.code ?? '').trim();
    const subtotal = Number(body.subtotal);
    const email = body.email ? String(body.email).trim().toLowerCase() : null;

    if (!code) return badRequest('code is required');
    if (!Number.isFinite(subtotal) || subtotal < 0) {
      return badRequest('subtotal must be a non-negative number');
    }

    // Validation only — consumption happens inside create-order.
    const result = await evaluateDiscount(adminClient(), { code, subtotal, email });

    return json({
      valid: result.valid,
      code: result.code ?? code.toUpperCase(),
      discount_amount: result.discount_amount,
      discount_type: result.discount_type ?? null,
      discount_value: result.discount_value ?? null,
      message: result.message,
    });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
