// Sugere hotéis perto de um ponto (Google Places API New, via gateway). Só para usuários logados.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { z } from "npm:zod@3";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_maps";
const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "Faça login." }, 401);
    const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, { global: { headers: { Authorization: auth } } });
    const { data: u } = await sb.auth.getUser(auth.slice(7));
    if (!u?.user) return json({ error: "Sessão inválida." }, 401);

    const parsed = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).safeParse(await req.json().catch(() => ({})));
    if (!parsed.success) return json({ error: "Coordenada inválida." }, 400);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const MAPS_KEY = Deno.env.get("GOOGLE_MAPS_API_KEY_1") ?? Deno.env.get("GOOGLE_MAPS_API_KEY");
    if (!LOVABLE_API_KEY || !MAPS_KEY) return json({ error: "Busca de hotéis indisponível.", indisponivel: true }, 200);

    const r = await fetch(`${GATEWAY_URL}/places/v1/places:searchNearby`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`, "X-Connection-Api-Key": MAPS_KEY, "Content-Type": "application/json",
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress,places.location,places.rating,places.addressComponents",
      },
      body: JSON.stringify({
        includedTypes: ["lodging"], maxResultCount: 10, rankPreference: "DISTANCE", languageCode: "pt-BR",
        locationRestriction: { circle: { center: { latitude: parsed.data.lat, longitude: parsed.data.lng }, radius: 15000 } },
      }),
    });
    if (!r.ok) {
      const t = await r.text();
      console.error(`[hoteis-proximos] ${r.status}: ${t}`);
      return json({ error: "Busca de hotéis indisponível.", indisponivel: true, status: r.status }, 200);
    }
    const d = await r.json();
    const hoteis = (d?.places ?? []).map((p: any) => {
      const comp = (tipo: string) => (p.addressComponents ?? []).find((c: any) => c.types?.includes(tipo));
      return {
        id: p.id, nome: p.displayName?.text ?? "", endereco: p.formattedAddress ?? "",
        lat: p.location?.latitude, lng: p.location?.longitude, nota: p.rating ?? null,
        cidade: comp("administrative_area_level_2")?.longText ?? null, uf: comp("administrative_area_level_1")?.shortText ?? null,
      };
    });
    return json({ hoteis });
  } catch (e) {
    console.error("[hoteis-proximos]", e);
    return json({ error: "Busca de hotéis indisponível.", indisponivel: true }, 200);
  }
});
