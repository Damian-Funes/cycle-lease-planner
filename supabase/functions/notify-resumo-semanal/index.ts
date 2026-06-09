// Segunda 8h BRT — resumo de orgs incompletas para cada comercial.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sendEmail, htmlWrap } from "../_shared/send-email.ts";

const TIPO = "resumo_semanal";

function camposFaltando(o: any, temContato: boolean) {
  const f: string[] = [];
  if (!temContato) f.push("sem contato");
  if (!o.telefone_principal) f.push("sem telefone");
  if (!o.email_principal) f.push("sem email");
  if (!o.cidade || (!o.estado && !o.estado_id)) f.push("sem cidade/estado");
  return f;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { data: roles } = await adminClient.from("user_roles").select("user_id").eq("role", "comercial");
  const userIds = (roles || []).map((r: any) => r.user_id);
  if (!userIds.length) return new Response(JSON.stringify({ enviados: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: profs } = await adminClient.from("profiles").select("user_id, nome, email, status").in("user_id", userIds).eq("status", "approved");
  let enviados = 0;

  for (const p of profs || []) {
    if (!p.email) continue;
    const { data: pref } = await adminClient.from("email_notification_preferences").select("resumo_semanal").eq("user_id", p.user_id).maybeSingle();
    if (pref && pref.resumo_semanal === false) continue;

    const { data: orgs } = await adminClient
      .from("organizacoes")
      .select("id, nome, telefone_principal, email_principal, cidade, estado, estado_id")
      .eq("responsavel_id", p.user_id);

    const incompletas: any[] = [];
    for (const o of orgs || []) {
      const { count } = await adminClient.from("pessoas").select("id", { count: "exact", head: true }).eq("organizacao_id", o.id);
      const temContato = (count ?? 0) > 0;
      const faltam = camposFaltando(o, temContato);
      if (faltam.length) incompletas.push({ ...o, faltam });
    }

    if (!incompletas.length) continue;

    const linhas = incompletas
      .slice(0, 50)
      .map((o) => `<li><strong>${o.nome}</strong> — <span style="color:#dc2626">${o.faltam.join(", ")}</span></li>`)
      .join("");
    const html = htmlWrap(
      `Resumo semanal — ${incompletas.length} organizações precisam de atenção`,
      `<p>Olá ${p.nome || ""},</p><p>Estas organizações sob sua responsabilidade têm informações faltando:</p><ul>${linhas}</ul><p><a href="https://crmls.com.br/organizacoes?filtro=incompletas" style="background:#059669;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Ver lista</a></p>`
    );
    await sendEmail({
      tipo: TIPO,
      to: p.email,
      subject: `Resumo semanal — ${incompletas.length} organizações precisam de atenção`,
      html,
      destinatarioUserId: p.user_id,
    });
    enviados++;
  }

  return new Response(JSON.stringify({ enviados }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
