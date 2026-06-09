// Diário 8h BRT — cria atividade do dia "Assumir organizações" para cada comercial.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient } from "../_shared/send-email.ts";

const TIPO_ID = "18a81316-9ca6-4e3f-980c-c771b821a730";
const LIMITE = 5;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let force = false;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      force = !!body?.force;
    }
  } catch { /* ignore */ }

  const inicioDia = new Date(); inicioDia.setHours(0, 0, 0, 0);
  const fimDia = new Date(); fimDia.setHours(23, 59, 59, 999);

  if (force) {
    await adminClient
      .from("atividades")
      .delete()
      .eq("tipo_id", TIPO_ID)
      .eq("evento_automatico", true)
      .gte("data_atividade", inicioDia.toISOString())
      .lte("data_atividade", fimDia.toISOString());
  }
  const inicio = inicioDia;
  const fim = fimDia;


  // Órfãs ordenadas das mais antigas
  const { data: orfas } = await adminClient
    .from("organizacoes")
    .select("id, nome")
    .is("responsavel_id", null)
    .order("created_at", { ascending: true });

  if (!orfas?.length) {
    return new Response(JSON.stringify({ criadas: 0, motivo: "sem_orfas" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const total = orfas.length;

  // Comerciais aprovados
  const { data: roles } = await adminClient.from("user_roles").select("user_id").eq("role", "comercial");
  const uids = (roles || []).map((r: any) => r.user_id);
  if (!uids.length) {
    return new Response(JSON.stringify({ criadas: 0, motivo: "sem_comerciais" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: profs } = await adminClient
    .from("profiles")
    .select("user_id, status")
    .in("user_id", uids)
    .eq("status", "approved");

  let criadas = 0;
  let offset = 0;

  for (const p of profs || []) {
    // Evita duplicata: já tem atividade hoje?
    const { data: existente } = await adminClient
      .from("atividades")
      .select("id")
      .eq("tipo_id", TIPO_ID)
      .eq("responsavel_id", p.user_id)
      .gte("data_atividade", inicio.toISOString())
      .lte("data_atividade", fim.toISOString())
      .limit(1)
      .maybeSingle();

    if (existente) continue;

    const lote = orfas.slice(offset, offset + LIMITE);
    if (!lote.length) {
      // ainda assim cria atividade alertando que outros restam
      offset = 0;
    }
    const slice = orfas.slice(offset, offset + LIMITE);
    offset += LIMITE;

    const nomes = slice.map((o: any) => `• ${o.nome}`).join("\n");
    const descricao = `Existem ${total} organizações sem responsável.\n\nSugestão (mais antigas):\n${nomes}\n\nClique no título para abrir a lista filtrada.`;

    const { error } = await adminClient.from("atividades").insert({
      tipo_id: TIPO_ID,
      tipo: "tarefa",
      titulo: `Assumir organizações do dia (${total} pendentes)`,
      descricao,
      data_atividade: new Date().toISOString(),
      data_inicio: new Date().toISOString(),
      responsavel_id: p.user_id,
      concluida: false,
      evento_automatico: true,
    });

    if (!error) criadas++;
    else console.error("Erro ao criar atividade:", error);
  }

  return new Response(JSON.stringify({ criadas, total_orfas: total }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
