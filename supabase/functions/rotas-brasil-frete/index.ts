// supabase/functions/rotas-brasil-frete/index.ts

const QUALP_URL = "https://api.qualp.com.br/rotas/v4";
const QUALP_TOKEN = Deno.env.get("QUALP_TOKEN")!;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const round2 = (n: number) => Math.round(n * 100) / 100;

const json = (obj: unknown) =>
  new Response(JSON.stringify(obj), { headers: { ...cors, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const {
      pontos,
      eixo = 6,
      precoCombustivel = 7.25,
      consumo = 2.5,
      tabela = "A",       // tabela ANTT (A = lotação, igual ao RotaBrasil)
      usarTag = false,    // false = tarifa dinheiro; true = tarifa com desconto de tag
    } = await req.json();

    if (!Array.isArray(pontos) || pontos.length < 2)
      return json({ error: "Informe pelo menos origem e destino." });

    const eixoKey = String(eixo);
    const tabelaKey = String(tabela).toUpperCase();

    // origem -> paradas -> destino, em "lat,lng" quando houver coordenada, senão endereço
    const locations = pontos
      .map((p: any) =>
        p?.lat != null && p?.lng != null ? `${p.lat},${p.lng}` : String(p?.endereco ?? "").trim()
      )
      .filter(Boolean);

    const body = {
      locations,
      config: {
        route: {
          type_route: "efficient",
          calculate_return: false,
          alternative_routes: "0",
          optimized_route: false,
          optimized_route_destination: "last",
          avoid_locations: false,
          avoid_locations_key: "",
        },
        vehicle: { type: "truck", axis: Number(eixo), top_speed: "" },
        freight_table: { category: "all", freight_load: "all", axis: "all" },
        tolls: { retroactive_date: "" },
      },
      show: {
        tolls: true,
        freight_table: true,
        polyline: false,
      },
    };

    const url = `${QUALP_URL}?json=${encodeURIComponent(JSON.stringify(body))}`;
    const resp = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "Access-Token": QUALP_TOKEN,
      },
    });

    const rawText = await resp.text();
    if (!resp.ok) return json({ error: `Qualp ${resp.status}: ${rawText}` });

    let q: any;
    try { q = JSON.parse(rawText); } catch { q = rawText; }


    // ---- Tradução Qualp -> formato antigo (RotaBrasil) que o front já lê ----
    const distancia = Number(q?.distancia?.valor ?? 0);

    const pedagios = Array.isArray(q?.pedagios) ? q.pedagios : [];
    const campo = usarTag ? "tarifa_tag" : "tarifa";
    const valorPedagio = pedagios.reduce((acc: number, p: any) => {
      const t = p?.[campo]?.[eixoKey] ?? p?.tarifa?.[eixoKey] ?? 0;
      return acc + Number(t || 0);
    }, 0);

    const linha = q?.tabela_frete?.dados?.[tabelaKey]?.[eixoKey] ?? {};
    const tabelaFrete = {
      geral: Number(linha?.geral ?? 0),
      granelSolido: Number(linha?.granel_solido ?? 0),
      granelLiquido: Number(linha?.granel_liquido ?? 0),
    };

    const valorCombustivel = consumo > 0 ? (distancia / consumo) * precoCombustivel : 0;

    return json({
      rotas: [
        {
          via: q?.tabela_frete?.antt_resolucao?.nome ?? "",
          distancia,
          duracao: q?.duracao?.texto ?? "",
          veiculo: "caminhao",
          eixos: eixoKey,
          valorPedagio: round2(valorPedagio),
          valorCombustivel: round2(valorCombustivel),
          tabelaFrete,
          pedagios, // detalhe praça a praça, se quiser exibir depois
        },
      ],
      _fonte: "qualp",
      _id_transacao: q?.id_transacao ?? null,
      _tabela_frete_raw: q?.tabela_frete ?? null,
    });
  } catch (e) {
    return json({ error: (e as Error)?.message ?? "Falha ao calcular frete." });
  }
});
