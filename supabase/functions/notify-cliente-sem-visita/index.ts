// Segunda 8h BRT — clientes sem visita há +90 dias.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sendEmail, htmlWrap } from "../_shared/send-email.ts";

const TIPO = "cliente_sem_visita";
const TIPO_VISITA = "54328293-d880-4b51-bf3a-167bfb773105";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const limite = new Date(Date.now() - 90 * 86400000).toISOString();

  // Para cada org com responsavel: data da última visita concluída
  const { data: orgs } = await adminClient
    .from("organizacoes")
    .select("id, nome, responsavel_id")
    .not("responsavel_id", "is", null);

  const grupos = new Map<string, any[]>();
  for (const o of orgs || []) {
    const { data: ult } = await adminClient
      .from("atividades")
      .select("data_atividade")
      .eq("organizacao_id", o.id)
      .eq("tipo_id", TIPO_VISITA)
      .eq("concluida", true)
      .order("data_atividade", { ascending: false })
      .limit(1);
    const ultima = ult && ult[0]?.data_atividade;
    if (ultima && ultima >= limite) continue; // visitada recentemente
    if (!grupos.has(o.responsavel_id!)) grupos.set(o.responsavel_id!, []);
    grupos.get(o.responsavel_id!)!.push({ ...o, ultima });
  }

  let enviados = 0;
  for (const [uid, lista] of grupos) {
    const { data: pref } = await adminClient.from("email_notification_preferences").select("cliente_sem_visita").eq("user_id", uid).maybeSingle();
    if (pref && pref.cliente_sem_visita === false) continue;
    const { data: prof } = await adminClient.from("profiles").select("nome, email").eq("user_id", uid).maybeSingle();
    if (!prof?.email) continue;

    const linhas = lista.slice(0, 60).map((o) => `<li><strong>${o.nome}</strong> — ${o.ultima ? `última visita em ${new Date(o.ultima).toLocaleDateString("pt-BR")}` : "nunca visitada"}</li>`).join("");
    const subject = `${lista.length} cliente${lista.length > 1 ? "s" : ""} sem visita há mais de 90 dias`;
    const html = htmlWrap(subject, `<p>Olá ${prof.nome || ""},</p><ul>${linhas}</ul>`);
    await sendEmail({ tipo: TIPO, to: prof.email, subject, html, destinatarioUserId: uid });
    enviados++;
  }

  return new Response(JSON.stringify({ enviados }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
});
