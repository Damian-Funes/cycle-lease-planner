import { supabase } from "@/integrations/supabase/client";
import {
  classificarMotivo, coordenadaValida, distanciaAoTrajeto, ordenarSugestoes,
  type MotivoSugestao, type Ponto,
} from "./rotaNavegacao";

export interface SugestaoCaminho {
  id: string;
  nome: string;
  cidade: string | null;
  estado: string | null;
  lat: number;
  lng: number;
  aproximada: boolean;
  distanciaKm: number;
  posicaoKm: number;
  motivo: MotivoSugestao;
  oportunidadeId: string | null;
}

export type ClienteMapa = Omit<SugestaoCaminho, "distanciaKm" | "posicaoKm">;

/** Todas as organizações visíveis (RLS) com coordenada, já classificadas. Buscar uma vez por tela. */
export async function buscarClientesMapa(vendedorId: string): Promise<ClienteMapa[]> {
  const sb = supabase as any;
  const { data: orgs, error } = await sb
    .from("organizacoes")
    .select("id, nome, nome_fantasia, cidade, estado, endereco, latitude, longitude, responsavel_id")
    .not("latitude", "is", null).not("longitude", "is", null)
    .limit(5000);
  if (error) throw error;
  const validas = (orgs ?? []).filter((o: any) => coordenadaValida(o.latitude, o.longitude));
  if (!validas.length) return [];

  const [opps, atvs] = await Promise.all([
    sb.from("oportunidades").select("id, organizacao_id, titulo, valor_estimado, proxima_atividade_em")
      .eq("status", "aberta").eq("responsavel_id", vendedorId).not("organizacao_id", "is", null).limit(5000),
    sb.from("atividades").select("organizacao_id, data_conclusao, data_atividade")
      .eq("concluida", true).not("organizacao_id", "is", null).order("data_atividade", { ascending: false }).limit(10000),
  ]);
  if (opps.error) throw opps.error;

  const dealPorOrg = new Map<string, any>();
  for (const d of opps.data ?? []) {
    const atual = dealPorOrg.get(d.organizacao_id);
    if (!atual || Number(d.valor_estimado) > Number(atual.valor_estimado)) dealPorOrg.set(d.organizacao_id, d);
  }
  const numeroPorOpp = new Map<string, string>();
  const oppIds = [...dealPorOrg.values()].map((d) => d.id);
  if (oppIds.length) {
    const { data: orcs } = await sb.from("orcamentos").select("oportunidade_id, numero_orcamento, created_at")
      .in("oportunidade_id", oppIds).order("created_at", { ascending: false });
    for (const o of orcs ?? []) if (o.numero_orcamento && !numeroPorOpp.has(o.oportunidade_id)) numeroPorOpp.set(o.oportunidade_id, o.numero_orcamento);
  }
  const ultimoContato = new Map<string, string>();
  for (const a of atvs.data ?? []) {
    const dt = a.data_conclusao || a.data_atividade;
    const prev = ultimoContato.get(a.organizacao_id);
    if (dt && (!prev || dt > prev)) ultimoContato.set(a.organizacao_id, dt);
  }

  return validas.map((o: any) => {
    const deal = dealPorOrg.get(o.id);
    return {
      id: o.id,
      nome: o.nome_fantasia || o.nome,
      cidade: o.cidade, estado: o.estado,
      lat: Number(o.latitude), lng: Number(o.longitude),
      aproximada: !o.endereco,
      oportunidadeId: deal?.id ?? null,
      motivo: classificarMotivo({
        deal: deal ? { titulo: deal.titulo, valor: Number(deal.valor_estimado), proximaAtividadeEm: deal.proxima_atividade_em, numeroOrcamento: numeroPorOpp.get(deal.id) } : null,
        carteiraDoVendedor: o.responsavel_id === vendedorId,
        ultimoContato: ultimoContato.get(o.id) ?? null,
      }),
    } as ClienteMapa;
  });
}

/** Distância de cada cliente ao trajeto (null se não há trajeto), excluindo paradas. */
export function medirClientes(clientes: ClienteMapa[], caminho: Ponto[], excluirIds: string[]): (ClienteMapa & { distanciaKm: number | null; posicaoKm: number })[] {
  const excluir = new Set(excluirIds);
  const temCaminho = caminho.length >= 2;
  return clientes.filter((c) => !excluir.has(c.id)).map((c) => {
    if (!temCaminho) return { ...c, distanciaKm: null, posicaoKm: 0 };
    const d = distanciaAoTrajeto({ lat: c.lat, lng: c.lng }, caminho);
    return { ...c, distanciaKm: d.km, posicaoKm: d.posicaoKm };
  });
}

/** Clientes a até `raioKm` do trajeto, ordenados por prioridade e posição na viagem. */
export function filtrarNoCaminho(medidos: ReturnType<typeof medirClientes>, raioKm: number): SugestaoCaminho[] {
  return ordenarSugestoes(medidos.filter((c) => c.distanciaKm != null && c.distanciaKm <= raioKm) as SugestaoCaminho[]);
}
