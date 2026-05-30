import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

const GMAPS_GATEWAY = 'https://connector-gateway.lovable.dev/google_maps';

function toRotasBrasilNumber(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  return value.toFixed(2);
}

async function geocodeGoogle(address: string): Promise<{ lat: number; lng: number } | null> {
  const lovKey = Deno.env.get('LOVABLE_API_KEY');
  const gmapsKey = Deno.env.get('GOOGLE_MAPS_API_KEY');
  if (!lovKey || !gmapsKey) return null;
  try {
    const r = await fetch(
      `${GMAPS_GATEWAY}/maps/api/geocode/json?address=${encodeURIComponent(address)}&region=br&language=pt-BR`,
      { headers: { Authorization: `Bearer ${lovKey}`, 'X-Connection-Api-Key': gmapsKey } },
    );
    const j = await r.json();
    const loc = j?.results?.[0]?.geometry?.location;
    if (loc && Number.isFinite(loc.lat) && Number.isFinite(loc.lng)) {
      return { lat: loc.lat, lng: loc.lng };
    }
  } catch (_) { /* ignore */ }
  return null;
}

async function geocodeNominatim(address: string): Promise<{ lat: number; lng: number } | null> {
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=br&q=${encodeURIComponent(address)}`;
    const r = await fetch(url, { headers: { 'User-Agent': 'crmls-frete/1.0 (contato@crmls.com.br)', 'Accept-Language': 'pt-BR' } });
    if (!r.ok) return null;
    const j = await r.json();
    const first = Array.isArray(j) ? j[0] : null;
    const lat = Number(first?.lat), lng = Number(first?.lon);
    if (Number.isFinite(lat) && Number.isFinite(lng)) return { lat, lng };
  } catch (_) { /* ignore */ }
  return null;
}

async function geocode(address: string): Promise<{ lat: number; lng: number } | null> {
  return (await geocodeGoogle(address)) ?? (await geocodeNominatim(address));
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json();
    const eixo = body.eixo ?? 2;
    const precoCombustivel = Number(body.precoCombustivel) || 0;
    const consumo = Number(body.consumo) || 0;

    // Aceita o novo formato { pontos: [{endereco, lat?, lng?}] } ou o antigo {origem, destino, paradas}
    let pontos: Array<{ endereco: string; lat?: number; lng?: number }> = [];
    if (Array.isArray(body.pontos)) {
      pontos = body.pontos;
    } else {
      const arr = [body.origem, ...(body.paradas ?? []), body.destino].filter(Boolean);
      pontos = arr.map((e: string) => ({ endereco: String(e) }));
    }

    pontos = pontos.filter((p) => p && (p.endereco || (p.lat && p.lng)));
    if (pontos.length < 2) {
      return new Response(JSON.stringify({ error: 'Informe ao menos origem e destino' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Geocodifica quem não tem coords
    for (const p of pontos) {
      if (typeof p.lat !== 'number' || typeof p.lng !== 'number') {
        const g = await geocode(p.endereco);
        if (!g) {
          return new Response(JSON.stringify({
            error: `Não foi possível geocodificar: "${p.endereco}". Selecione um endereço da lista de sugestões.`,
          }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        p.lat = g.lat; p.lng = g.lng;
      }
    }

    const token = Deno.env.get('ROTAS_BRASIL_TOKEN');
    if (!token) {
      return new Response(JSON.stringify({ error: 'ROTAS_BRASIL_TOKEN não configurado' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Rotas Brasil /coordenadas/: pontos = "lng,lat;lng,lat;..."
    const pontosStr = pontos
      .map((p) => `${(p.lng as number).toFixed(6)},${(p.lat as number).toFixed(6)}`)
      .join(';');

    const url = new URL('http://rotasbrasil.com.br/apiRotas/coordenadas/');
    url.searchParams.set('pontos', pontosStr);
    url.searchParams.set('veiculo', 'caminhao');
    url.searchParams.set('eixo', String(eixo));
    url.searchParams.set('paradas', 'true');
    url.searchParams.set('tabela', 'a');
    const precoCombustivelFormatado = toRotasBrasilNumber(precoCombustivel);
    const consumoFormatado = toRotasBrasilNumber(consumo);
    if (precoCombustivelFormatado) url.searchParams.set('combustivel', precoCombustivelFormatado);
    if (consumoFormatado) url.searchParams.set('consumo', consumoFormatado);
    url.searchParams.set('token', token);

    const resp = await fetch(url.toString(), { method: 'GET' });
    const text = await resp.text();
    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!resp.ok) {
      return new Response(JSON.stringify({ error: 'Erro na API Rotas Brasil', status: resp.status, data }), {
        status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Se a API devolveu um envelope de erro com 200, propaga
    if ((data as any)?.erro) {
      return new Response(JSON.stringify({
        error: (data as any).erro?.mensagem || 'Erro Rotas Brasil',
        data,
        pontosEnviados: pontosStr,
      }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200,
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
