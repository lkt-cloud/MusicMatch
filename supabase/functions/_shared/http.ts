// Browsers call create-checkout and cancel-promotion directly, so they need CORS.
const ALLOWED_ORIGIN = Deno.env.get('APP_URL') ?? '*';

export const cors = {
  'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

export const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...cors, 'Content-Type': 'application/json' } });

export const preflight = (req: Request) => (req.method === 'OPTIONS' ? new Response('ok', { headers: cors }) : null);
