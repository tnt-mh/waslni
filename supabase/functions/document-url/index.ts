import { createClient } from 'jsr:@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL');
const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
const allowedOrigins = (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map((origin) => origin.trim()).filter(Boolean);

function corsHeaders(origin: string | null) {
  const headers: Record<string, string> = {
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Max-Age': '600',
    Vary: 'Origin',
  };
  if (origin && allowedOrigins.includes(origin)) headers['Access-Control-Allow-Origin'] = origin;
  return headers;
}

function json(body: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

Deno.serve(async (request) => {
  const origin = request.headers.get('origin');
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405, origin);
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return json({ error: 'Document service is not configured' }, 503, origin);
  }

  const authorization = request.headers.get('authorization');
  if (!authorization?.startsWith('Bearer ')) return json({ error: 'Authentication required' }, 401, origin);

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData.user) return json({ error: 'Authentication required' }, 401, origin);

  let payload: { documentId?: unknown; reason?: unknown };
  try {
    payload = await request.json();
  } catch {
    return json({ error: 'Invalid request' }, 400, origin);
  }
  const documentId = typeof payload.documentId === 'string' ? payload.documentId : '';
  const reason = typeof payload.reason === 'string' ? payload.reason.trim().slice(0, 1000) : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(documentId)) {
    return json({ error: 'Document is required' }, 400, origin);
  }

  const { error: auditError } = await userClient.rpc('record_document_access', {
    p_document_id: documentId,
    p_reason: reason,
  });
  if (auditError) return json({ error: 'Document access is not authorized' }, 403, origin);

  const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: document, error: documentError } = await serviceClient
    .from('driver_documents')
    .select('id,storage_path')
    .eq('id', documentId)
    .is('superseded_at', null)
    .maybeSingle();
  if (documentError || !document?.storage_path) return json({ error: 'Document is unavailable' }, 404, origin);

  const { data: signed, error: signedError } = await serviceClient.storage
    .from('driver-documents')
    .createSignedUrl(document.storage_path, 60);
  if (signedError || !signed?.signedUrl) return json({ error: 'Document URL could not be created' }, 502, origin);

  const { data: stillAuthorized, error: accessError } = await userClient
    .from('driver_documents')
    .select('id')
    .eq('id', documentId)
    .maybeSingle();
  if (accessError || !stillAuthorized) return json({ error: 'Document access changed' }, 403, origin);

  return json({ url: signed.signedUrl, expiresIn: 60 }, 200, origin);
});
