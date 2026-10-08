import { createClient } from 'npm:@supabase/supabase-js@2.117.2';

/** Server-side client: bypasses row-level security. Never send this key to a browser. */
export const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '', {
  auth: { persistSession: false },
});

/** The signed-in user making this request, from their Authorization header. */
export async function requireUser(req: Request) {
  const token = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await admin.auth.getUser(token);
  return error ? null : data.user;
}
