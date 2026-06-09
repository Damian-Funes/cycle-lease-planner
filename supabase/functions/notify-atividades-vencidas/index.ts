// Diário 7h BRT — atividades vencidas ou para hoje/amanhã, agrupadas por responsável.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sendEmail, htmlWrap } from "../_shared/send-email.ts";

const TIPO = "atividades_vencidas";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 2); // até fim de amanhã

  const { data: ats } = await adminClient
    .from("atividades")
    .select("id, titulo, data_atividade, responsavel_id, oportunidade_id, organizacao_id")
    .eq("concluida", false)
    .lte("data_atividade", amanha.toISOString())
    .order("data_atividade", { ascending: true });

  // agrupar por responsavel
  const grupos = new Map<string, any[]>();
  for (const a of ats || []) {
    if (!a.responsavel_id) continue;
    if (!grupos.has(a.responsavel_id)) grupos.set(a.responsavel_id, []);
    grupos.get(a.responsavel_id)!.push(a);
  }

  let enviados = 0;
  for (const [uid, lista] of grupos) {
    const { data: pref } = await adminClient.from("email_notification_preferences").select("atividades_vencidas").eq("user_id", uid).maybeSingle();
    if (pref && pref.atividades_vencidas === false) continue;
    const { data: prof } = await adminClient.from("profiles").select("nome, email").eq("user_id", uid).maybeSingle();
    if (!prof?.email) continue;

    const linhas = lista.slice(0, 50).map((a) => {
      const d = new Date(a.data_atividade);
      const venc = d.getTime() < Date.now() - 86400000 ? "VENCIDA" : d.toDateString() === new Date().toDateString() ? "HOJE" : "AMANHÃ";
      const cor = venc === "VENCIDA" ? "#dc2626" : venc === "HOJE" ? "#d97706" : "#059669";
      return `<li><span style="color:${cor};font-weight:600">${venc}</span> — ${a.titulo} <span style="color:#6b7280">(${d.toLocaleDateString("pt-BR")})</span></li>`;
    }).join("");

    const subject = `Você tem ${lista.length} atividade${lista.length > 1 ? "s" : ""} vencida${lista.length > 1 ? "s" : ""} ou para hoje`;
    const html = htmlWrap(subject, `<p>Olá ${prof.nome || ""},</p><ul>${linhas}</ul><p><a href="https://crmls.com.br/atividades" style="background:#059669;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Ver atividades</a></p>`);
    await sendEmail({ tipo: TIPO, to: prof.email, subject, html, destinatarioUserId: uid });
    enviados++;
  }

  return new Response(JSON.stringify({ enviados }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
