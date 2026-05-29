import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';
import { createClient } from 'npm:@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    // Autentica o usuário chamador
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) throw new Error('Não autenticado');

    const { lead_id, pipeline_id, organizacao_id: existingOrgId } = await req.json();
    if (!lead_id || !pipeline_id) throw new Error('lead_id e pipeline_id são obrigatórios');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: lead, error: leadErr } = await admin
      .from('leads_rd').select('*').eq('id', lead_id).single();
    if (leadErr || !lead) throw new Error('Lead não encontrado');
    if (lead.status === 'convertido') throw new Error('Lead já convertido');

    // Resolve estado_id pela sigla (se vier do RD)
    let estado_id: string | null = null;
    if (lead.estado) {
      const sigla = String(lead.estado).trim().toUpperCase().slice(0, 2);
      const { data: est } = await admin.from('estados').select('id').eq('sigla', sigla).maybeSingle();
      estado_id = est?.id ?? null;
    }

    let organizacao_id = existingOrgId as string | null;
    let pessoa_id: string | null = null;

    if (!organizacao_id) {
      // Cria organização — o trigger fn_atribuir_responsavel_org cuida do responsável por estado
      const orgNome = lead.empresa || lead.nome || lead.email || 'Lead RD sem nome';
      const { data: org, error: orgErr } = await admin
        .from('organizacoes')
        .insert({
          nome: orgNome,
          email_principal: lead.email,
          telefone_principal: lead.telefone,
          cidade: lead.cidade,
          estado_id,
          status: 'lead',
          observacoes: `Origem: RD Station${lead.utm_source ? ` · ${lead.utm_source}` : ''}${lead.conversion_identifier ? ` · ${lead.conversion_identifier}` : ''}`,
        })
        .select('id, responsavel_id')
        .single();
      if (orgErr) throw new Error(`Erro criando organização: ${orgErr.message}`);
      organizacao_id = org.id;

      if (lead.nome || lead.email) {
        const { data: pes } = await admin
          .from('pessoas')
          .insert({
            nome: lead.nome || lead.email,
            email: lead.email,
            telefone: lead.telefone,
            cargo: lead.cargo,
            organizacao_id,
          })
          .select('id').single();
        pessoa_id = pes?.id ?? null;
      }
    }

    // Primeira etapa do pipeline escolhido
    const { data: etapa } = await admin
      .from('etapas_pipeline')
      .select('id, probabilidade_default')
      .eq('pipeline_id', pipeline_id)
      .order('ordem', { ascending: true })
      .limit(1).maybeSingle();
    if (!etapa) throw new Error('Pipeline sem etapas');

    // Busca responsável da organização para atribuir à oportunidade
    const { data: orgRow } = await admin
      .from('organizacoes').select('responsavel_id').eq('id', organizacao_id).single();

    const { data: opp, error: oppErr } = await admin
      .from('oportunidades')
      .insert({
        titulo: `Lead RD — ${lead.nome || lead.empresa || lead.email || 'sem nome'}`,
        organizacao_id,
        pipeline_id,
        etapa_id: etapa.id,
        valor_estimado: 0,
        probabilidade: etapa.probabilidade_default ?? 50,
        status: 'aberta',
        responsavel_id: orgRow?.responsavel_id ?? user.id,
      })
      .select('id').single();
    if (oppErr) throw new Error(`Erro criando oportunidade: ${oppErr.message}`);

    if (pessoa_id) {
      await admin.from('oportunidade_pessoas').insert({
        oportunidade_id: opp.id, pessoa_id, papel: 'contato_principal',
      });
    }

    await admin.from('leads_rd').update({
      status: 'convertido',
      organizacao_id,
      oportunidade_id: opp.id,
      convertido_por: user.id,
      convertido_em: new Date().toISOString(),
    }).eq('id', lead_id);

    return new Response(JSON.stringify({ ok: true, organizacao_id, oportunidade_id: opp.id }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[rd-convert-lead]', msg);
    return new Response(JSON.stringify({ ok: false, error: msg }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
