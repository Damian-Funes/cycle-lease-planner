import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const RD_TOKEN = Deno.env.get('RD_PUBLIC_TOKEN');
const RD_API_KEY = Deno.env.get('RD_API_KEY');
const RD_CLIENT_ID = Deno.env.get('RD_CLIENT_ID');
const RD_CLIENT_SECRET = Deno.env.get('RD_CLIENT_SECRET');
const RD_REFRESH_TOKEN = Deno.env.get('RD_REFRESH_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function getOAuthAccessToken(): Promise<string | null> {
  if (!RD_CLIENT_ID || !RD_CLIENT_SECRET || !RD_REFRESH_TOKEN) return null;
  const r = await fetch('https://api.rd.services/auth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_id: RD_CLIENT_ID,
      client_secret: RD_CLIENT_SECRET,
      refresh_token: RD_REFRESH_TOKEN,
    }),
  });
  if (!r.ok) {
    const t = await r.text();
    console.error('[rd-sync-leads] OAuth refresh falhou:', r.status, t.slice(0, 300));
    return null;
  }
  const j = await r.json();
  return j.access_token || null;
}

// Endpoint legado público do RD Marketing: retorna conversões (leads de formulários)
// Doc: https://developers.rdstation.com/reference/post_platform-conversions
// Usamos /platform/conversions com filtro por data via query.

interface RDContact {
  uuid?: string;
  id?: string;
  email?: string;
  name?: string;
  personal_phone?: string;
  mobile_phone?: string;
  company?: string;
  job_title?: string;
  city?: string;
  state?: string;
  created_at?: string;
  last_conversion?: {
    conversion_identifier?: string;
    content?: Record<string, unknown>;
    created_at?: string;
  };
  tags?: string[];
}

function extractField(payload: any, ...keys: string[]): string | null {
  for (const k of keys) {
    const v = payload?.[k] ?? payload?.last_conversion?.content?.[k];
    if (v && typeof v === 'string') return v;
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const log = { iniciado_em: new Date().toISOString() } as any;
  let logId: string | null = null;
  const body = req.method === 'POST' ? await req.json().catch(() => ({})) : {};
  log.origem = body.origem || 'cron';

  try {
    if (!RD_TOKEN && !RD_API_KEY) throw new Error('Nenhum token RD configurado (RD_PUBLIC_TOKEN ou RD_API_KEY)');

    const { data: inserted } = await supabase.from('rd_sync_log').insert(log).select('id').single();
    logId = inserted?.id ?? null;

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Tenta múltiplos endpoints + tokens
    type Attempt = { url: string; auth: 'bearer' | 'token' | 'none'; token: string };
    const attempts: Attempt[] = [];
    if (RD_API_KEY) {
      attempts.push(
        { url: `https://api.rd.services/platform/contacts?page_size=200`, auth: 'bearer', token: RD_API_KEY },
        { url: `https://api.rd.services/platform/conversions?updated_at_since=${encodeURIComponent(since)}`, auth: 'bearer', token: RD_API_KEY },
        { url: `https://api.rd.services/platform/events?event_type=CONVERSION&start_date=${encodeURIComponent(since)}`, auth: 'bearer', token: RD_API_KEY },
      );
    }
    if (RD_TOKEN) {
      attempts.push(
        { url: `https://api.rd.services/platform/conversions?updated_at_since=${encodeURIComponent(since)}`, auth: 'bearer', token: RD_TOKEN },
        { url: `https://www.rdstation.com.br/api/1.3/conversions?auth_token=${encodeURIComponent(RD_TOKEN)}&start_date=${encodeURIComponent(since.slice(0, 10))}`, auth: 'none', token: '' },
      );
    }

    let json: any = null;
    let lastStatus = 0;
    let lastBody = '';
    let usedUrl = '';
    for (const a of attempts) {
      const headers: Record<string, string> = { Accept: 'application/json' };
      if (a.auth === 'bearer') headers.Authorization = `Bearer ${a.token}`;
      const r = await fetch(a.url, { headers });
      if (r.ok) {
        json = await r.json().catch(() => ({}));
        usedUrl = a.url;
        break;
      }
      lastStatus = r.status;
      lastBody = (await r.text()).slice(0, 300);
      console.log(`[rd-sync-leads] ${a.url} -> ${r.status} ${lastBody.slice(0, 120)}`);
    }

    if (!json) {
      const msg = `RD API indisponível (último status ${lastStatus}): ${lastBody}`;
      console.error('[rd-sync-leads]', msg);
      if (logId) {
        await supabase.from('rd_sync_log').update({
          finalizado_em: new Date().toISOString(),
          erro: msg,
        }).eq('id', logId);
      }
      return new Response(
        JSON.stringify({ ok: false, error: msg, fallback: true, recebidos: 0, novos: 0, atualizados: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const contacts: RDContact[] = json.conversions || json.contacts || json.events || (Array.isArray(json) ? json : []);

    let novos = 0;
    let atualizados = 0;

    for (const c of contacts) {
      const rd_uuid = c.uuid || c.id || c.email;
      if (!rd_uuid) continue;
      const payload = c as any;
      const row = {
        rd_uuid: String(rd_uuid),
        email: c.email ?? extractField(payload, 'email'),
        nome: c.name ?? extractField(payload, 'name', 'nome'),
        telefone: c.mobile_phone ?? c.personal_phone ?? extractField(payload, 'phone', 'telefone'),
        empresa: c.company ?? extractField(payload, 'company', 'empresa'),
        cargo: c.job_title ?? extractField(payload, 'cargo'),
        cidade: c.city ?? extractField(payload, 'city', 'cidade'),
        estado: c.state ?? extractField(payload, 'state', 'estado'),
        conversion_identifier: c.last_conversion?.conversion_identifier ?? extractField(payload, 'conversion_identifier'),
        utm_source: extractField(payload, 'utm_source', 'cf_utm_source'),
        utm_medium: extractField(payload, 'utm_medium', 'cf_utm_medium'),
        utm_campaign: extractField(payload, 'utm_campaign', 'cf_utm_campaign'),
        payload,
        criado_em_rd: c.created_at ?? c.last_conversion?.created_at ?? null,
      };

      const { data: existing } = await supabase
        .from('leads_rd')
        .select('id')
        .eq('rd_uuid', row.rd_uuid)
        .maybeSingle();

      if (existing) {
        await supabase.from('leads_rd').update(row).eq('id', existing.id);
        atualizados++;
      } else {
        await supabase.from('leads_rd').insert(row);
        novos++;
      }
    }

    if (logId) {
      await supabase.from('rd_sync_log').update({
        finalizado_em: new Date().toISOString(),
        total_recebidos: contacts.length,
        total_novos: novos,
        total_atualizados: atualizados,
      }).eq('id', logId);
    }

    return new Response(JSON.stringify({ ok: true, recebidos: contacts.length, novos, atualizados }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[rd-sync-leads]', msg);
    if (logId) {
      await supabase.from('rd_sync_log').update({
        finalizado_em: new Date().toISOString(),
        erro: msg,
      }).eq('id', logId);
    }
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
