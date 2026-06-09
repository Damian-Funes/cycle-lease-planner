// Diário 18h BRT — rota planejada para amanhã.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sendEmail, htmlWrap } from "../_shared/send-email.ts";

const TIPO = "rota_amanha";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const amanha = new Date();
  amanha.setDate(amanha.getDate() + 1);
  const dataAmanha = amanha.toISOString().slice(0, 10);

  const { data: rotas } = await adminClient
    .from("rotas")
    .select("id, vendedor_id, data_rota, observacoes")
    .eq("data_rota", dataAmanha);

  let enviados = 0;
  for (const r of rotas || []) {
    if (!r.vendedor_id) continue;

    const { data: jaTem } = await adminClient.from("email_notifications_log").select("id").eq("tipo", TIPO).eq("referencia_id", r.id).limit(1);
    if (jaTem && jaTem.length) continue;

    const { data: pref } = await adminClient.from("email_notification_preferences").select("rota_amanha").eq("user_id", r.vendedor_id).maybeSingle();
    if (pref && pref.rota_amanha === false) continue;
    const { data: prof } = await adminClient.from("profiles").select("nome, email").eq("user_id", r.vendedor_id).maybeSingle();
    if (!prof?.email) continue;

    const { data: paradas } = await adminClient
      .from("rota_paradas")
      .select("ordem, cidade, estado, organizacoes(nome)")
      .eq("rota_id", r.id)
      .order("ordem", { ascending: true });

    const linhas = (paradas || []).map((p: any) =>
      `<li><strong>${p.ordem}.</strong> ${p.organizacoes?.nome || "—"} <span style="color:#6b7280">(${p.cidade || ""}${p.estado ? "/" + p.estado : ""})</span></li>`
    ).join("");

    const total = paradas?.length || 0;
    const subject = `Sua rota de amanhã — ${total} parada${total !== 1 ? "s" : ""} planejada${total !== 1 ? "s" : ""}`;
    const html = htmlWrap(subject, `<p>Olá ${prof.nome || ""},</p><p>Rota para <strong>${amanha.toLocaleDateString("pt-BR")}</strong>:</p><ol>${linhas}</ol><p><a href="https://crmls.com.br/rotas/${r.id}" style="background:#059669;color:#fff;padding:10px 16px;border-radius:6px;text-decoration:none;display:inline-block">Abrir rota</a></p>`);
    await sendEmail({ tipo: TIPO, to: prof.email, subject, html, destinatarioUserId: r.vendedor_id, referenciaId: r.id, referenciaTipo: "rota" });
    enviados++;
  }

  return new Response(JSON.stringify({ enviados }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
