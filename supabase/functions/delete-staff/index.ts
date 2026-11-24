// delete-staff — OWNER only. Deletes a staff auth user (profile cascades).
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
}

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const caller = await resolveCaller(req);
    if (!caller) return unauthorized('Authentication required');
    if (caller.role !== 'owner') return forbidden('Only the owner can delete staff');

    const body = await readJson<Body>(req);
    if (!body?.user_id) return badRequest('user_id is required');

    const admin = adminClient();
    const { data: target } = await admin
      .from('profiles')
      .select('id, role, email')
      .eq('id', body.user_id)
      .maybeSingle();
    if (!target) return notFound('Staff member not found');

    if (target.id === caller.id) return forbidden('You cannot delete your own account');
    if (target.role === 'owner') return forbidden('An owner account cannot be deleted');

    const { error } = await admin.auth.admin.deleteUser(target.id);
    if (error) return serverError(error.message);

    await writeAudit({
      actor_id: caller.id,
      actor_email: caller.email,
      action: 'delete_staff',
      entity_type: 'profiles',
      entity_id: target.id,
      details: { email: target.email, role: target.role },
      ip_address: clientIp(req),
      user_agent: req.headers.get('user-agent'),
    });

    return json({ deleted: target.id });
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
