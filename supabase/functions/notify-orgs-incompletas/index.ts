// Disparo imediato para 1+ organização incompleta.
// Body: { organizacao_ids: string[] }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sendEmail, htmlWrap } from "../_shared/send-email.ts";

const TIPO = "orgs_incompletas";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { organizacao_ids } = await req.json();
    if (!Array.isArray(organizacao_ids) || !organizacao_ids.length) {
      return new Response(JSON.stringify({ error: "organizacao_ids vazio" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const { data: orgs } = await adminClient
      .from("organizacoes")
      .select("id, nome, telefone_principal, email_principal, cidade, estado, estado_id, responsavel_id")
      .in("id", organizacao_ids);

    let enviados = 0;
    for (const o of orgs || []) {
      if (!o.responsavel_id) continue;

      // dedup: já enviou nas últimas 24h?
      const { data: jaTem } = await adminClient
        .from("email_notifications_log")
        .select("id")
        .eq("tipo", TIPO)
        .eq("referencia_id", o.id)
        .gte("enviado_em", new Date(Date.now() - 24 * 3600 * 1000).toISOString())
        .limit(1);
      if (jaTem && jaTem.length) continue;

      const { data: pref } = await adminClient.from("email_notification_preferences").select("orgs_incompletas").eq("user_id", o.responsavel_id).maybeSingle();
      if (pref && pref.orgs_incompletas === false) continue;

      const { data: prof } = await adminClient.from("profiles").select("nome, email").eq("user_id", o.responsavel_id).maybeSingle();
      if (!prof?.email) continue;

      const { count } = await adminClient.from("pessoas").select("id", { count: "exact", head: true }).eq("organizacao_id", o.id);
      const faltam: string[] = [];
      if (!(count ?? 0)) faltam.push("contato");
      if (!o.telefone_principal) faltam.push("telefone");
      if (!o.email_principal) faltam.push("email");
      if (!o.cidade || (!o.estado && !o.estado_id)) faltam.push("cidade/estado");

      const html = htmlWrap(
        "Nova organização incompleta atribuída a você",
        `<p>Olá ${prof.nome || ""},</p><p>A organização <strong>${o.nome}</strong> foi atribuída a você e está com dados faltando:</p><ul>${faltam.map((f) => `<li>${f}</li>`).join("")}</ul><p><a href="https://crmls.com.br/organizacoes/${o.id}" style="background:#059669;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Completar agora</a></p>`
      );

      await sendEmail({
        tipo: TIPO,
        to: prof.email,
        subject: "Nova organização incompleta atribuída a você",
        html,
        destinatarioUserId: o.responsavel_id,
        referenciaId: o.id,
        referenciaTipo: "organizacao",
      });
      enviados++;
    }

    return new Response(JSON.stringify({ enviados }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
