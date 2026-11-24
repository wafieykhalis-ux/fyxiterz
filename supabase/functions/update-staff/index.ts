// update-staff — OWNER only. Updates a staff profile (never mints/steals owner).
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
  user_id?: string;
  full_name?: string;
  phone?: string;
  role?: string;
  is_active?: boolean;
}

const ASSIGNABLE_ROLES = ['admin', 'reseller', 'customer'];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const caller = await resolveCaller(req);
    if (!caller) return unauthorized('Authentication required');
    if (caller.role !== 'owner') return forbidden('Only the owner can update staff');

    const body = await readJson<Body>(req);
    if (!body?.user_id) return badRequest('user_id is required');

    const admin = adminClient();
    const { data: target } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', body.user_id)
      .maybeSingle();
    if (!target) return notFound('Staff member not found');

    const isSelf = target.id === caller.id;

    // An owner may only be altered by that same owner; nobody can promote to owner.
    if (target.role === 'owner' && !isSelf) {
      return forbidden('Cannot modify another owner');
    }
    if (body.role != null) {
      const role = String(body.role).toLowerCase();
      if (role === 'owner' && !isSelf) {
        return forbidden('Cannot assign the owner role');
      }
      if (!ASSIGNABLE_ROLES.includes(role)) {
        return badRequest(`role must be one of: ${ASSIGNABLE_ROLES.join(', ')}`);
      }
    }

    const update: Record<string, unknown> = {};
    if (body.full_name != null) update.full_name = String(body.full_name).trim();
    if (body.phone != null) update.phone = String(body.phone).trim() || null;
    if (body.role != null) update.role = String(body.role).toLowerCase();
    if (body.is_active != null) update.is_active = Boolean(body.is_active);

    if (Object.keys(update).length === 0) return badRequest('No updatable fields provided');
    update.updated_at = new Date().toISOString();

    const { error } = await admin.from('profiles').update(update).eq('id', target.id);
    if (error) return serverError(error.message);

    await writeAudit({
      actor_id: caller.id,
      actor_email: caller.email,
      action: 'update_staff',
      entity_type: 'profiles',
      entity_id: target.id,
      details: update,
      ip_address: clientIp(req),
      user_agent: req.headers.get('user-agent'),
    });

    return json({ id: target.id, updated: update });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
