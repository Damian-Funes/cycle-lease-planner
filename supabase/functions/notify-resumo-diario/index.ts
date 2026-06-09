// Diário 7h BRT — resumo do dia para comerciais.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sendEmail, htmlWrap } from "../_shared/send-email.ts";

const TIPO = "resumo_diario";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { data: roles } = await adminClient.from("user_roles").select("user_id").eq("role", "comercial");
  const uids = (roles || []).map((r: any) => r.user_id);
  if (!uids.length) return new Response(JSON.stringify({ enviados: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: profs } = await adminClient.from("profiles").select("user_id, nome, email, status").in("user_id", uids).eq("status", "approved");

  const hoje = new Date();
  const inicio = new Date(hoje); inicio.setHours(0, 0, 0, 0);
  const fim = new Date(hoje); fim.setHours(23, 59, 59, 999);
  const dataHoje = hoje.toISOString().slice(0, 10);

  let enviados = 0;
  for (const p of profs || []) {
    if (!p.email) continue;
    const { data: pref } = await adminClient.from("email_notification_preferences").select("resumo_diario").eq("user_id", p.user_id).maybeSingle();
    if (pref && pref.resumo_diario === false) continue;

    const { data: ats } = await adminClient
      .from("atividades")
      .select("titulo, data_atividade, concluida")
      .eq("responsavel_id", p.user_id)
      .gte("data_atividade", inicio.toISOString())
      .lte("data_atividade", fim.toISOString())
      .order("data_atividade", { ascending: true });

    const { data: opps } = await adminClient
      .from("oportunidades")
      .select("id, titulo, proxima_atividade_em")
      .eq("responsavel_id", p.user_id)
      .eq("status", "aberta")
      .gte("proxima_atividade_em", inicio.toISOString())
      .lte("proxima_atividade_em", fim.toISOString());

    const { data: rota } = await adminClient
      .from("rotas")
      .select("id")
      .eq("vendedor_id", p.user_id)
      .eq("data_rota", dataHoje)
      .maybeSingle();

    const totalAts = ats?.length || 0;
    const totalOpps = opps?.length || 0;
    if (!totalAts && !totalOpps && !rota) continue;

    let body = `<p>Olá ${p.nome || ""}, veja o seu dia:</p>`;
    if (totalAts) body += `<h3 style="color:#059669;margin-top:16px">Atividades (${totalAts})</h3><ul>${ats!.map((a) => `<li>${a.titulo} — ${new Date(a.data_atividade).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}${a.concluida ? " ✓" : ""}</li>`).join("")}</ul>`;
    if (totalOpps) body += `<h3 style="color:#059669;margin-top:16px">Oportunidades com próxima ação hoje (${totalOpps})</h3><ul>${opps!.map((o) => `<li>${o.titulo}</li>`).join("")}</ul>`;
    if (rota) body += `<h3 style="color:#059669;margin-top:16px">Rota de hoje</h3><p><a href="https://crmls.com.br/rotas/${rota.id}" style="background:#059669;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Abrir rota</a></p>`;

    const subject = `Bom dia, ${p.nome?.split(" ")[0] || ""}! Veja seu dia de hoje`;
    await sendEmail({ tipo: TIPO, to: p.email, subject, html: htmlWrap(subject, body), destinatarioUserId: p.user_id });
    enviados++;
  }

  return new Response(JSON.stringify({ enviados }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
