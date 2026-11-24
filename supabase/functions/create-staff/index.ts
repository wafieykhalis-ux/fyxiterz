// create-staff — OWNER only. Creates an 'admin' or 'reseller' staff account.
import { handleOptions } from '../_shared/cors.ts';
import { adminClient, resolveCaller, writeAudit } from '../_shared/supabase.ts';
import {
  badRequest,
  clientIp,
  forbidden,
  isValidEmail,
  json,
  readJson,
  serverError,
  unauthorized,
} from '../_shared/util.ts';

interface Body {
  email?: string;
  password?: string;
  full_name?: string;
  role?: string;
  phone?: string;
}

// The owner account can never be minted through this endpoint.
const CREATABLE_ROLES = ['admin', 'reseller'];

Deno.serve(async (req) => {
  const preflight = handleOptions(req);
  if (preflight) return preflight;

  try {
    const caller = await resolveCaller(req);
    if (!caller) return unauthorized('Authentication required');
    if (caller.role !== 'owner') return forbidden('Only the owner can create staff');

    const body = await readJson<Body>(req);
    if (!body) return badRequest('Invalid JSON body');

    const email = String(body.email ?? '').trim().toLowerCase();
    const password = String(body.password ?? '');
    const fullName = String(body.full_name ?? '').trim();
    const role = String(body.role ?? '').trim().toLowerCase();
    const phone = body.phone != null ? String(body.phone).trim() : null;

    if (!isValidEmail(email)) return badRequest('A valid email is required');
    if (password.length < 8) return badRequest('Password must be at least 8 characters');
    if (!fullName) return badRequest('full_name is required');
    if (!CREATABLE_ROLES.includes(role)) {
      return badRequest(`role must be one of: ${CREATABLE_ROLES.join(', ')}`);
    }

    const admin = adminClient();

    const { data: created, error: createErr } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: fullName, role },
    });
    if (createErr || !created?.user) {
      return serverError(createErr?.message ?? 'Failed to create auth user');
    }

    const userId = created.user.id;

    // Ensure the profile row reflects the requested role/status.
    const { error: profileErr } = await admin.from('profiles').upsert(
      {
        id: userId,
        email,
        full_name: fullName,
        phone,
        role,
        is_active: true,
      },
      { onConflict: 'id' },
    );
    if (profileErr) {
      // Roll back the auth user so we don't leave an orphan account.
      await admin.auth.admin.deleteUser(userId);
      return serverError(profileErr.message);
    }

    await writeAudit({
      actor_id: caller.id,
      actor_email: caller.email,
      action: 'create_staff',
      entity_type: 'profiles',
      entity_id: userId,
      details: { email, role, full_name: fullName },
      ip_address: clientIp(req),
      user_agent: req.headers.get('user-agent'),
    });

    // Never return credentials or secrets.
    return json({ id: userId, email, role }, 201);
  } catch (err) {
    return serverError(err instanceof Error ? err.message : 'Unexpected error');
  }
});
