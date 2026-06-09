// Diário 9h BRT — alerta de oportunidades paradas há 15/20/25/30/40/50 dias.
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { adminClient, sendEmail, htmlWrap } from "../_shared/send-email.ts";

const TIPO = "deals_parados";
const MARCOS = [15, 20, 25, 30, 40, 50];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const { data: opps } = await adminClient
    .from("oportunidades")
    .select("id, titulo, valor_estimado, responsavel_id, ultima_atividade_em, created_at, status, organizacoes(nome)")
    .in("status", ["aberta", "em_andamento", "ativa"]);

  let enviados = 0;
  for (const o of (opps as any[]) || []) {
    if (!o.responsavel_id) continue;
    const ref = o.ultima_atividade_em || o.created_at;
    if