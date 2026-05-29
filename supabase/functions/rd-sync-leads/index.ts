import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const RD_TOKEN = Deno.env.get('RD_PUBLIC_TOKEN');
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
    if (!RD_TOKEN) throw new Error('RD_PUBLIC_TOKEN não configurado');

    const { data: inserted } = await supabase.from('rd_sync_log').insert(log).select('id').single();
    logId = inserted?.id ?? null;

    // Janela: últimas 24h (cron de hora em hora — pega com folga)
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    // Endpoint público legado: lista contatos atualizados
    // GET https://api.rd.services/platform/contacts ?? legado usa /api/1.3/conversions com auth_token
    const url = `https://api.rd.services/platform/conversions?updated_at_since=${encodeURIComponent(since)}`;
    const resp = await fetch(url, {
      headers: { Authorization: `Bearer ${RD_TOKEN}`, Accept: 'application/json' },
    });

    if (!resp.ok) {
      // Fallback para API legada v1.3 (auth_token na query)
      const legacyUrl = `https://api.rd.services/platform/contacts?auth_token=${encodeURIComponent(RD_TOKEN)}`;
      const r2 = await fetch(legacyUrl);
      if (!r2.ok) {
        const txt = await resp.text();
        throw new Error(`RD API ${resp.status}: ${txt.slice(0, 500)}`);
      }
    }

    const json = await resp.json().catch(() => ({}));
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
