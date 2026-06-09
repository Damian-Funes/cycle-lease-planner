// Diário 9h BRT — alerta de oportunidades paradas há 15/20/25/30/40/50 dias.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sendEmail, htmlWrap } from "../_shared/send-email.ts";

const TIPO = "deals_parados";
const MARCOS = [15, 20, 25, 30, 40, 50];

function brl(v: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { data: opps } = await adminClient
    .from("oportunidades")
    .select("id, titulo, valor_estimado, responsavel_id, ultima_atividade_em, created_at, status, organizacoes(nome)")
    .eq("status", "aberta");

  let enviados = 0;
  for (const o of (opps as any[]) || []) {
    if (!o.responsavel_id) continue;
    const ref = o.ultima_atividade_em || o.created_at;
    const dias = Math.floor((Date.now() - new Date(ref).getTime()) / 86400000);
    if (!MARCOS.includes(dias)) continue;

    // dedup: já alertou este marco?
    const { data: jaTem } = await adminClient
      .from("email_notifications_log")
      .select("id, assunto")
      .eq("tipo", TIPO)
      .eq("referencia_id", o.id)
      .ilike("assunto", `%há ${dias} dias%`)
      .limit(1);
    if (jaTem && jaTem.length) continue;

    const { data: pref } = await adminClient.from("email_notification_preferences").select("deals_parados").eq("user_id", o.responsavel_id).maybeSingle();
    if (pref && pref.deals_parados === false) continue;

    const { data: prof } = await adminClient.from("profiles").select("nome, email").eq("user_id", o.responsavel_id).maybeSingle();
    if (!prof?.email) continue;

    const cliente = o.organizacoes?.nome || "—";
    const subject = `Deal parado há ${dias} dias — ${o.titulo}`;
    const html = htmlWrap(
      subject,
      `<p>Olá ${prof.nome || ""},</p><p>A oportunidade <strong>${o.titulo}</strong> está sem movimentação.</p>
       <ul><li>Cliente: ${cliente}</li><li>Valor estimado: ${brl(o.valor_estimado)}</li><li>Última atividade: ${new Date(ref).toLocaleDateString("pt-BR")}</li></ul>
       <p><a href="https://crmls.com.br/crm/deal/${o.id}" style="background:#059669;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Abrir oportunidade</a></p>`
    );
    await sendEmail({ tipo: TIPO, to: prof.email, subject, html, destinatarioUserId: o.responsavel_id, referenciaId: o.id, referenciaTipo: "oportunidade" });
    enviados++;
  }

  return new Response(JSON.stringify({ enviados }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
