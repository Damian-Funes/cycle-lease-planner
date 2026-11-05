// Pedágio estimado de uma viagem comercial (carro/caminhonete 2 eixos) via QualP.
// Consulta UMA vez por trajeto: se a assinatura não mudou, devolve o valor já salvo (sem gastar crédito).
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const QUALP_URL = "https://api.qualp.com.br/rotas/v4";
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// Mesmas bases de src/lib/maps.ts (getOrigemVendedor)
const MARINGA = { lat: -23.4253, lng: -51.9386 };
type VB = { id: string; vendedor_id: string | null; ativo: boolean | null; base_lat: number | null; base_lng: number | null };
const baseDe = (v?: VB) => v && v.base_lat != null && v.base_lng != null ? { lat: Number(v.base_lat), lng: Number(v.base_lng) } : null;

type Parada = { dia: string | null; ordem: number; tipo: string; latitude: number | null; longitude: number | null };
const valida = (p: Parada) => p.latitude != null && p.longitude != null && !(Number(p.latitude) === 0 && Number(p.longitude) === 0)
  && Math.abs(Number(p.latitude)) <= 90 && Math.abs(Number(p.longitude)) <= 180;

// Igual a assinaturaTrajeto em src/lib/viagem.ts
function pontosEAssinatura(base: { lat: number; lng: number }, paradas: Parada[], inicio: string) {
  const ord = paradas.filter((p) => valida(p) && p.tipo !== "pernoite").sort((a, b) => a.ordem - b.ordem);
  const pts = [base, ...ord.map((p) => ({ lat: Number(p.latitude), lng: Number(p.longitude) })), base];
  return { pts, assinatura: pts.map((p) => `${p.lat.toFixed(5)},${p.lng.toFixed(5)}`).join("|") };
}

async function consultarQualp(locations: string[], tipo: string) {
  const body = {
    locations,
    config: {
      route: { type_route: "efficient", calculate_return: false, alternative_routes: "0", optimized_route: false, optimized_route_destination: "last", avoid_locations: false, avoid_locations_key: "" },
      vehicle: { type: tipo, axis: 2, top_speed: "" },
      tolls: { retroactive_date: "" },
    },
    show: { tolls: true, freight_table: false, polyline: false },
  };
  const resp = await fetch(`${QUALP_URL}?json=${encodeURIComponent(JSON.stringify(body))}`, {
    headers: { Accept: "application/json", "Content-Type": "application/json", "Access-Token": Deno.env.get("QUALP_TOKEN") ?? "" },
  });
  const txt = await resp.text();
  if (!resp.ok) throw new Error(`QualP ${resp.status}: ${txt.slice(0, 300)}`);
  return JSON.parse(txt);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const parsed = z.object({ rota_id: z.string().uuid() }).safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "rota_id inválido" }, 400);
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Faça login." }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const userClient = createClient(url, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u, error: ue } = await userClient.auth.getUser(auth.slice(7));
    if (ue || !u?.user) return json({ error: "Sessão inválida." }, 401);

    const admin = createClient(url, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: rota } = await admin.from("rotas").select("id, vendedor_id, veiculo_id, data_inicio, data_rota, pedagio_assinatura, custo_pedagio_est, custo_combustivel_est, custo_hospedagem_est, custo_alimentacao_est").eq("id", parsed.data.rota_id).maybeSingle();
    if (!rota) return json({ error: "Rota não encontrada." }, 404);
    const { data: papel } = await admin.from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (rota.vendedor_id !== u.user.id && !papel) return json({ error: "Sem permissão para esta rota." }, 403);

    const { data: paradas } = await admin.from("rota_paradas").select("dia, ordem, tipo, latitude, longitude").eq("rota_id", rota.id);
    const { data: veics } = await admin.from("veiculos").select("id, vendedor_id, ativo, base_lat, base_lng").or(`vendedor_id.eq.${rota.vendedor_id}${rota.veiculo_id ? `,id.eq.${rota.veiculo_id}` : ""}`);
    const lista = (veics ?? []) as VB[];
    const base = baseDe(lista.find((v) => v.id === rota.veiculo_id))
      ?? lista.filter((v) => v.vendedor_id === rota.vendedor_id).sort((a, b) => Number(b.ativo !== false) - Number(a.ativo !== false)).map(baseDe).find(Boolean)
      ?? MARINGA;
    const { pts, assinatura } = pontosEAssinatura(base, (paradas ?? []) as Parada[], rota.data_inicio ?? rota.data_rota);
    if (pts.length < 3) return json({ error: "Rota sem paradas com coordenada." }, 400);

    if (rota.pedagio_assinatura === assinatura && rota.custo_pedagio_est != null) {
      return json({ valor: Number(rota.custo_pedagio_est), reaproveitado: true });
    }
    if (pts.length > 25) return json({ error: "Paradas demais para consultar o pedágio de uma vez." }, 400);

    const locations = pts.map((p) => `${p.lat},${p.lng}`);
    let q: any; let tipo = "car";
    try { q = await consultarQualp(locations, tipo); }
    catch { tipo = "auto"; q = await consultarQualp(locations, tipo); }

    const pracas = Array.isArray(q?.pedagios) ? q.pedagios : [];
    const tarifaDe = (p: any) => {
      const t = p?.tarifa ?? {};
      const v = t["2"] ?? t[2] ?? Object.values(t)[0] ?? 0;
      return Number(v || 0);
    };
    const valor = Math.round(pracas.reduce((a: number, p: any) => a + tarifaDe(p), 0) * 100) / 100;
    const detalhe = {
      veiculo: tipo, eixos: 2, distancia_km: Number(q?.distancia?.valor ?? 0), id_transacao: q?.id_transacao ?? null,
      pracas: pracas.map((p: any) => ({ nome: p?.nome ?? p?.praca ?? null, rodovia: p?.rodovia ?? null, uf: p?.uf ?? null, valor: tarifaDe(p) })),
    };
    const total = Math.round(((Number(rota.custo_combustivel_est ?? 0)) + Number(rota.custo_hospedagem_est ?? 0) + Number(rota.custo_alimentacao_est ?? 0) + valor) * 100) / 100;
    const { error: we } = await admin.from("rotas").update({
      custo_pedagio_est: valor, pedagio_assinatura: assinatura, pedagio_consultado_em: new Date().toISOString(), pedagio_detalhe: detalhe, custo_total_est: total,
    }).eq("id", rota.id);
    if (we) return json({ error: we.message }, 500);
    return json({ valor, reaproveitado: false, pracas: detalhe.pracas.length });
  } catch (e) {
    console.error("[pedagio-viagem]", e);
    return json({ error: (e as Error)?.message ?? "Falha ao consultar pedágio." }, 502);
  }
});
