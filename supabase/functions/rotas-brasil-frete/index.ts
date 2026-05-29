import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { origem, destino, paradas = [], eixo = 2 } = await req.json();

    if (!origem || !destino) {
      return new Response(
        JSON.stringify({ error: 'origem e destino são obrigatórios' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = Deno.env.get('ROTAS_BRASIL_TOKEN');
    if (!token) {
      return new Response(
        JSON.stringify({ error: 'ROTAS_BRASIL_TOKEN não configurado' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const pontosArr = [origem, ...(Array.isArray(paradas) ? paradas : []), destino]
      .map((p: string) => String(p).trim())
      .filter(Boolean);

    const url = new URL('http://rotasbrasil.com.br/apiRotas/enderecos/');
    url.searchParams.set('pontos', pontosArr.join(';'));
    url.searchParams.set('veiculo', 'caminhao');
    url.searchParams.set('eixo', String(eixo));
    url.searchParams.set('paradas', 'true');
    url.searchParams.set('tabela', 'a');
    url.searchParams.set('token', token);

    const resp = await fetch(url.toString(), { method: 'GET' });
    const text = await resp.text();

    let data: unknown;
    try { data = JSON.parse(text); } catch { data = { raw: text }; }

    if (!resp.ok) {
      return new Response(
        JSON.stringify({ error: 'Erro na API Rotas Brasil', status: resp.status, data }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 200,
    });
  } catch (e) {
    return new Response(
      JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
