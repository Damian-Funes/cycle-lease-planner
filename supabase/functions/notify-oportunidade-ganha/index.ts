// Disparo imediato quando uma oportunidade vira "ganha".
// Body: { oportunidade_id: string }
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sendEmail, htmlWrap } from "../_shared/send-email.ts";

const TIPO = "oportunidade_ganha";

function brl(v: number | null) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v || 0);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { oportunidade_id } = await req.json();
    if (!oportunidade_id) return new Response(JSON.stringify({ error: "id ausente" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // dedup
    const { data: jaTem } = await adminClient.from("email_notifications_log").select("id").eq("tipo", TIPO).eq("referencia_id", oportunidade_id).limit(1);
    if (jaTem && jaTem.length) return new Response(JSON.stringify({ skipped: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const { data: o } = await adminClient
      .from("oportunidades")
      .select("id, titulo, valor_estimado, responsavel_id, organizacoes(nome)")
      .eq("id", oportunidade_id)
      .maybeSingle();
    if (!o) return new Response(JSON.stringify({ error: "não encontrada" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const cliente = (o as any).organizacoes?.nome || "—";
    const subject = `🎉 Parabéns! Oportunidade fechada — ${cliente}`;
    const baseHtml = (saud: string) => htmlWrap(
      subject,
      `<p>${saud}</p><p>A oportunidade <strong>${o.titulo}</strong> foi marcada como <strong>ganha</strong>.</p>
       <ul><li>Cliente: ${cliente}</li><li>Valor: ${brl(o.valor_estimado)}</li></ul>`
    );

    let enviados = 0;
    // Responsável
    if (o.responsavel_id) {
      const { data: pref } = await adminClient.from("email_notification_preferences").select("oportunidade_ganha").eq("user_id", o.responsavel_id).maybeSingle();
      const { data: prof } = await adminClient.from("profiles").select("nome, email").eq("user_id", o.responsavel_id).maybeSingle();
      if (prof?.email && !(pref && pref.oportunidade_ganha === false)) {
        await sendEmail({ tipo: TIPO, to: prof.email, subject, html: baseHtml(`Parabéns ${prof.nome || ""}!`), destinatarioUserId: o.responsavel_id, referenciaId: o.id, referenciaTipo: "oportunidade" });
        enviados++;
      }
    }

    // Cópia admin + gerente_comercial
    const { data: gestores } = await adminClient.from("user_roles").select("user_id").in("role", ["admin", "gerente_comercial"]);
    for (const g of gestores || []) {
      if (g.user_id === o.responsavel_id) continue;
      const { data: prof } = await adminClient.from("profiles").select("nome, email, status").eq("user_id", g.user_id).maybeSingle();
      if (!prof?.email || prof.status !== "approved") continue;
      await sendEmail({ tipo: TIPO, to: prof.email, subject: `[Cópia] ${subject}`, html: baseHtml(`Olá ${prof.nome || ""},`), destinatarioUserId: g.user_id, referenciaId: o.id, referenciaTipo: "oportunidade" });
      enviados++;
    }

    return new Response(JSON.stringify({ enviados }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e) }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
