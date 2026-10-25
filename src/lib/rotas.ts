import { supabase } from "@/integrations/supabase/client";
import { type StatusRota, hojeRota } from './rotasFluxo';

// UUID confirmado do tipo "Visita"
export const TIPO_VISITA_ID = "54328293-d880-4b51-bf3a-167bfb773105";

export interface Rota {
  id: string;
  vendedor_id: string;
  data_rota: string;
  status: StatusRota;
  enviada_em: string | null;
  aprovada_em: string | null;
  aprovada_por: string | null;
  motivo_reprovacao: string | null;
  prestacao_concluida_em: string | null;
  observacoes: string | null;
  km_total_estimado: number | null;
  created_at: string;
  updated_at: string;
}

export interface RotaParada {
  id: string;
  rota_id: string;
  ordem: number;
  organizacao_id: string | null;
  oportunidade_id: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number | null;
  longitude: number | null;
  tipo: string;
  observacoes: string | null;
  atividade_id: string | null;
  concluida: boolean;
  objetivo: string | null;
  resultado: string | null;
  visitada: boolean | null;
  motivo_nao_visita: string | null;
  informada_em: string | null;
  organizacao?: { nome: string; nome_fantasia: string | null } | null;
}

export async function listMinhasRotas(userId: string) {
  const { data, error } = await (supabase as any)
    .from("rotas")
    .select("*")
    .eq("vendedor_id", userId)
    .order("data_rota", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Rota[];
}

export async function listRotasEquipe(filters: { vendedorId?: string; inicio?: string; fim?: string }) {
  let q = (supabase as any).from("rotas").select("*").order("data_rota", { ascending: false });
  if (filters.vendedorId) q = q.eq("vendedor_id", filters.vendedorId);
  if (filters.inicio) q = q.gte("data_rota", filters.inicio);
  if (filters.fim) q = q.lte("data_rota", filters.fim);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Rota[];
}

export async function getRota(id: string) {
  const { data, error } = await (supabase as any).from("rotas").select("*").eq("id", id).maybeSingle();
  if (error) throw error;
  return data as Rota | null;
}

export async function getParadas(rotaId: string) {
  const { data, error } = await (supabase as any)
    .from("rota_paradas")
    .select("*, organizacao:organizacoes(nome,nome_fantasia)")
    .eq("rota_id", rotaId)
    .order("ordem", { ascending: true });
  if (error) throw error;
  return (data ?? []) as RotaParada[];
}

export async function criarRota(payload: { vendedor_id: string; data_rota: string; observacoes?: string | null }) {
  const { data, error } = await (supabase as any)
    .from("rotas")
    .insert({ ...payload, status: "rascunho" })
    .select("*")
    .single();
  if (error) throw error;
  return data as Rota;
}

export async function atualizarRota(id: string, patch: Partial<Rota>) {
  const { error } = await (supabase as any).from("rotas").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deletarRota(id: string) {
  const { error } = await (supabase as any).from("rotas").delete().eq("id", id);
  if (error) throw error;
}

export async function adicionarParada(parada: Omit<RotaParada, "id" | "objetivo" | "resultado" | "visitada" | "motivo_nao_visita" | "informada_em"> & Partial<Pick<RotaParada, "id" | "objetivo">>) {
  const { data, error } = await (supabase as any).from("rota_paradas").insert(parada).select("*").single();
  if (error) throw error;
  return data as RotaParada;
}

export async function removerParada(id: string) {
  // remove atividade vinculada se existir
  const { data: p } = await (supabase as any).from("rota_paradas").select("atividade_id").eq("id", id).maybeSingle();
  const atvId = p?.atividade_id as string | undefined;
  const { error } = await (supabase as any).from("rota_paradas").delete().eq("id", id);
  if (error) throw error;
  if (atvId) {
    await (supabase as any).from("atividades").delete().eq("id", atvId);
  }
}

export async function reordenarParadas(updates: { id: string; ordem: number }[]) {
  // Atualiza em série para respeitar RLS
  for (const u of updates) {
    const { error } = await supabase.from("rota_paradas").update({ ordem: u.ordem }).eq("id", u.id);
    if (error) throw error;
  }
}

export async function atualizarParada(id: string, patch: Partial<Pick<RotaParada, 'objetivo' | 'visitada' | 'resultado' | 'motivo_nao_visita' | 'organizacao_id'>>) {
  const { error } = await supabase.from('rota_paradas').update(patch).eq('id', id);
  if (error) throw error;
}

export async function pendenciasRotas(vendedorId?: string) {
  let q = supabase.from('rotas').select('*').eq('status', 'aprovada').lt('data_rota', hojeRota()).order('data_rota');
  if (vendedorId) q = q.eq('vendedor_id', vendedorId);
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as Rota[];
}

export type RotaEquipe = Rota & { vendedor: { nome: string | null; email: string } | null; paradas: RotaParada[] };
export async function rotasAprovacoes(aba: 'aguardando' | 'pendentes' | 'concluidas', mes: string) {
  let q = supabase.from('rotas').select('*, vendedor:profiles!rotas_vendedor_id_fkey(nome,email), paradas:rota_paradas(*, organizacao:organizacoes(nome,nome_fantasia))').order('data_rota');
  if (aba === 'aguardando') q = q.eq('status', 'aguardando_aprovacao');
  if (aba === 'pendentes') q = q.eq('status', 'aprovada').lt('data_rota', hojeRota());
  if (aba === 'concluidas') {
    const [ano, numeroMes] = mes.split('-').map(Number);
    const fim = new Date(Date.UTC(ano, numeroMes, 1)).toISOString();
    q = q.eq('status', 'concluida').gte('prestacao_concluida_em', `${mes}-01T00:00:00-03:00`).lt('prestacao_concluida_em', fim.replace('T00:00:00.000Z', 'T03:00:00.000Z'));
  }
  const rows: RotaEquipe[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await q.range(offset, offset + 499);
    if (error) throw error;
    rows.push(...(data ?? []) as unknown as RotaEquipe[]);
    if ((data?.length ?? 0) < 500) break;
  }
  return rows.map(r => ({ ...r, paradas: r.paradas.sort((a,b) => a.ordem-b.ordem) }));
}

export async function criarAtividadeVisita(opts: {
  organizacaoId: string;
  organizacaoNome: string;
  responsavelId: string;
  dataAtividade: string;
}) {
  const { data, error } = await (supabase as any)
    .from("atividades")
    .insert({
      tipo_id: TIPO_VISITA_ID,
      organizacao_id: opts.organizacaoId,
      responsavel_id: opts.responsavelId,
      titulo: `Visita planejada — ${opts.organizacaoNome}`,
      data_atividade: opts.dataAtividade,
      data_inicio: opts.dataAtividade,
      evento_automatico: true,
      concluida: false,
      tipo: "evento_automatico",
    })
    .select("id")
    .single();
  if (error) throw error;
  return data.id as string;
}

export interface OrganizacaoProxima {
  id: string;
  nome: string;
  nome_fantasia: string | null;
  cidade: string | null;
  estado: string | null;
  latitude: number;
  longitude: number;
  ultima_visita_dias: number | null;
  oportunidade_titulo: string | null;
  oportunidade_valor: number | null;
  oportunidade_id: string | null;
}

export async function buscarOrganizacoesProximas(
  centro: { lat: number; lng: number; estado?: string },
  raioKm: number
): Promise<OrganizacaoProxima[]> {
  let q = (supabase as any)
    .from("organizacoes")
    .select("id, nome, nome_fantasia, cidade, estado, latitude, longitude")
    .not("latitude", "is", null)
    .not("longitude", "is", null);
  // NÃO filtrar por estado — proximidade é puramente geográfica (cidades fronteiriças
  // podem estar em UFs diferentes e ainda assim a poucos km de distância).
  const { data, error } = await q.limit(2000);
  if (error) throw error;

  const { distanceKm } = await import("./maps");
  const dentro = (data ?? []).filter((o: any) => {
    const d = distanceKm(centro, { lat: Number(o.latitude), lng: Number(o.longitude) });
    return d <= raioKm;
  });
  if (dentro.length === 0) return [];

  const ids = dentro.map((o: any) => o.id);

  // Última visita (tipo Visita, concluída)
  const { data: atvs } = await (supabase as any)
    .from("atividades")
    .select("organizacao_id, data_atividade")
    .in("organizacao_id", ids)
    .eq("tipo_id", TIPO_VISITA_ID)
    .eq("concluida", true)
    .order("data_atividade", { ascending: false });

  const ultimaPorOrg = new Map<string, string>();
  for (const a of atvs ?? []) {
    if (!ultimaPorOrg.has(a.organizacao_id)) ultimaPorOrg.set(a.organizacao_id, a.data_atividade);
  }

  // Oportunidade ativa
  const { data: opps } = await (supabase as any)
    .from("oportunidades")
    .select("id, organizacao_id, titulo, valor_estimado, status")
    .in("organizacao_id", ids)
    .not("status", "in", "(perdida,ganha,fechado,fechada)");

  const oppPorOrg = new Map<string, any>();
  for (const o of opps ?? []) {
    if (!oppPorOrg.has(o.organizacao_id)) oppPorOrg.set(o.organizacao_id, o);
  }

  const hoje = Date.now();
  return dentro.map((o: any) => {
    const ultima = ultimaPorOrg.get(o.id);
    const dias = ultima ? Math.floor((hoje - new Date(ultima).getTime()) / (1000 * 60 * 60 * 24)) : null;
    const opp = oppPorOrg.get(o.id);
    return {
      id: o.id,
      nome: o.nome,
      nome_fantasia: o.nome_fantasia,
      cidade: o.cidade,
      estado: o.estado,
      latitude: Number(o.latitude),
      longitude: Number(o.longitude),
      ultima_visita_dias: dias,
      oportunidade_titulo: opp?.titulo ?? null,
      oportunidade_valor: opp?.valor_estimado ?? null,
      oportunidade_id: opp?.id ?? null,
    };
  });
}

export function semaforoVisita(dias: number | null): "verde" | "amarelo" | "vermelho" {
  if (dias == null) return "vermelho";
  if (dias < 60) return "verde";
  if (dias <= 180) return "amarelo";
  return "vermelho";
}
