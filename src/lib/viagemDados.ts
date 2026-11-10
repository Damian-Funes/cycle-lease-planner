import { supabase } from "@/integrations/supabase/client";
import { dimensoesReduzidas, type CategoriaGasto } from "./viagemDiario";
import type { RotaParada, Rota } from "./rotas";
import type { TipoNoite } from "./viagem";

const db = supabase as any;
export const BUCKET_VIAGENS = "viagens";

export interface Informativo {
  id: string; rota_id: string; parada_id: string | null; organizacao_id: string | null; autor_id: string;
  texto: string; registrado_em: string; latitude: number | null; longitude: number | null; fotos: string[];
}
export interface Gasto {
  id: string; rota_id: string; categoria: CategoriaGasto; valor: number; data: string;
  descricao: string | null; arquivo_path: string | null; autor_id: string; created_at: string;
}

/** Comprime imagem no navegador (lado maior 1600 px, JPEG 0,8). PDFs e não-imagens passam direto. */
export async function comprimirImagem(file: File, max = 1600, qualidade = 0.8): Promise<Blob> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bmp = await createImageBitmap(file);
    const { w, h } = dimensoesReduzidas(bmp.width, bmp.height, max);
    const canvas = document.createElement("canvas");
    canvas.width = w; canvas.height = h;
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, w, h);
    bmp.close?.();
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", qualidade));
    return blob && blob.size < file.size ? blob : file;
  } catch { return file; }
}

async function enviarArquivo(rotaId: string, pasta: "diario" | "notas", file: File) {
  const blob = await comprimirImagem(file);
  const ext = blob.type === "image/jpeg" ? "jpg" : (file.name.split(".").pop() || "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
  const path = `${rotaId}/${pasta}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET_VIAGENS).upload(path, blob, { contentType: blob.type || file.type, upsert: false });
  if (error) throw new Error(`Falha ao enviar arquivo: ${error.message}`);
  return path;
}

export async function urlsAssinadas(paths: string[], segundos = 3600): Promise<Record<string, string>> {
  if (!paths.length) return {};
  const { data, error } = await supabase.storage.from(BUCKET_VIAGENS).createSignedUrls(paths, segundos);
  if (error) throw error;
  return Object.fromEntries((data ?? []).filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl]));
}

export async function listDiario(rotaId: string) {
  const { data, error } = await db.from("rota_diario").select("*").eq("rota_id", rotaId).order("registrado_em", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Informativo[];
}

export async function criarInformativo(i: { rotaId: string; texto: string; parada?: RotaParada | null; fotos: File[]; posicao?: { lat: number; lng: number } | null }) {
  const fotos: string[] = [];
  for (const f of i.fotos) fotos.push(await enviarArquivo(i.rotaId, "diario", f));
  const { data: u } = await supabase.auth.getUser();
  const { error } = await db.from("rota_diario").insert({
    rota_id: i.rotaId, texto: i.texto.trim(), autor_id: u.user?.id,
    parada_id: i.parada?.id ?? null, organizacao_id: i.parada?.organizacao_id ?? null,
    latitude: i.posicao?.lat ?? null, longitude: i.posicao?.lng ?? null, fotos,
  });
  if (error) throw new Error(error.message.includes("row-level") ? "O diário só aceita informativos durante a viagem aprovada (até 1 dia depois do fim)." : error.message);
}

export async function excluirInformativo(id: string) {
  const { error } = await db.from("rota_diario").delete().eq("id", id);
  if (error) throw error;
}

export async function listGastos(rotaId: string) {
  const { data, error } = await db.from("rota_gastos").select("*").eq("rota_id", rotaId).order("data").order("created_at");
  if (error) throw error;
  return (data ?? []).map((g: any) => ({ ...g, valor: Number(g.valor) })) as Gasto[];
}

export async function salvarGasto(g: { id?: string; rotaId: string; categoria: CategoriaGasto; valor: number; data: string; descricao?: string | null; arquivo?: File | null; arquivo_path?: string | null }) {
  const arquivo_path = g.arquivo ? await enviarArquivo(g.rotaId, "notas", g.arquivo) : g.arquivo_path ?? null;
  const row = { rota_id: g.rotaId, categoria: g.categoria, valor: g.valor, data: g.data, descricao: g.descricao?.trim() || null, arquivo_path };
  const { data: u } = await supabase.auth.getUser();
  const r = g.id ? await db.from("rota_gastos").update(row).eq("id", g.id).select("id").single() : await db.from("rota_gastos").insert({ ...row, autor_id: u.user?.id }).select("id").single();
  if (r.error) throw new Error(r.error.message.includes("row-level") ? "Gastos só podem ser lançados até a conclusão da prestação de contas." : r.error.message);
  return r.data.id as string;
}

export interface Pernoite {
  id: string; rota_id: string; noite: string; tipo: TipoNoite; cidade: string | null; estado: string | null;
  latitude: number | null; longitude: number | null; hotel_nome: string | null; gasto_id: string | null; observacao: string | null; created_at: string;
}

export async function listPernoites(rotaId: string) {
  const { data, error } = await db.from("rota_pernoites").select("*").eq("rota_id", rotaId).order("noite");
  if (error) throw error;
  return (data ?? []) as Pernoite[];
}

const erroPernoite = (m: string) => m.includes("row-level") ? "Onde dormiu só pode ser registrado até a conclusão da prestação de contas." : m.includes("rota_pernoites_rota_id_noite_key") ? "Essa noite já foi registrada." : m;

/** Registra (ou corrige) onde dormiu. Hotel cria/atualiza o gasto de hotel com a nota. */
export async function salvarNoite(n: {
  rotaId: string; noite: string; tipo: TipoNoite; cidade?: string | null; estado?: string | null;
  latitude?: number | null; longitude?: number | null; hotel_nome?: string | null; observacao?: string | null;
  valor?: number | null; arquivo?: File | null; existente?: Pernoite | null; arquivoAtual?: string | null;
}) {
  let gasto_id: string | null = null;
  if (n.tipo === "hotel") {
    gasto_id = await salvarGasto({
      id: n.existente?.gasto_id ?? undefined, rotaId: n.rotaId, categoria: "hotel", valor: Number(n.valor), data: n.noite,
      descricao: `Hotel ${n.hotel_nome?.trim() ?? ""} — ${n.cidade ?? ""}/${n.estado ?? ""}`, arquivo: n.arquivo ?? null, arquivo_path: n.arquivoAtual ?? null,
    });
  }
  const { data: u } = await supabase.auth.getUser();
  const row = {
    rota_id: n.rotaId, noite: n.noite, tipo: n.tipo,
    cidade: n.cidade?.trim() || null, estado: n.estado?.trim().toUpperCase() || null,
    latitude: n.latitude ?? null, longitude: n.longitude ?? null,
    hotel_nome: n.tipo === "hotel" ? n.hotel_nome?.trim() || null : null,
    observacao: n.observacao?.trim() || null, gasto_id,
  };
  const r = n.existente ? await db.from("rota_pernoites").update(row).eq("id", n.existente.id) : await db.from("rota_pernoites").insert({ ...row, autor_id: u.user?.id });
  if (r.error) throw new Error(erroPernoite(r.error.message));
  // trocou de hotel para outro tipo: o gasto antigo deixa de pertencer à noite
  if (n.existente?.gasto_id && n.tipo !== "hotel") await excluirGasto(n.existente.gasto_id).catch(() => {});
}

export type MotivoSemVisita = "deslocamento" | "folga" | "outro";
export const MOTIVOS_SEM_VISITA: [MotivoSemVisita, string][] = [["deslocamento", "Só deslocamento"], ["folga", "Folga"], ["outro", "Outro motivo"]];
export interface DiaSemVisita { id: string; dia: string; motivo: MotivoSemVisita; observacao: string | null }

export async function listDiasSemVisita(rotaId: string) {
  const { data, error } = await db.from("rota_dias_sem_visita").select("id,dia,motivo,observacao").eq("rota_id", rotaId).order("dia");
  if (error) throw error;
  return (data ?? []) as DiaSemVisita[];
}

/** Marca um dia anterior como sem visita; o banco recusa hoje, dia fora da viagem e dia com visita. */
export async function marcarDiaSemVisita(rotaId: string, dia: string, motivo: MotivoSemVisita, observacao: string) {
  const { data: u } = await supabase.auth.getUser();
  const { error } = await db.from("rota_dias_sem_visita").insert({ rota_id: rotaId, dia, motivo, observacao: observacao.trim() || null, autor_id: u.user?.id });
  if (error) throw new Error(error.message.includes("rota_dias_sem_visita_rota_id_dia_key") ? "Esse dia já foi marcado." : error.message.includes("row-level") ? "Esta viagem não aceita mais registros." : error.message);
}

/** "Voltei para a base": registra todas as noites restantes de uma vez. */
export async function voltarParaBase(rotaId: string, noites: string[], observacao: string) {
  if (!noites.length) return;
  const { data: u } = await supabase.auth.getUser();
  const { error } = await db.from("rota_pernoites").insert(noites.map((noite) => ({ rota_id: rotaId, noite, tipo: "voltou_base", observacao: observacao.trim(), autor_id: u.user?.id })));
  if (error) throw new Error(erroPernoite(error.message));
}

export async function excluirGasto(id: string) {
  const { error } = await db.from("rota_gastos").delete().eq("id", id);
  if (error) throw error;
}

export type ViagemAndamento = Rota & { paradas: RotaParada[]; pernoites: Pernoite[]; gastos: { categoria: string; valor: number }[]; vendedor: { nome: string | null; email: string } | null; ultimo: Informativo | null };

/** Aprovadas cujo período inclui hoje (RLS limita ao dono ou admin). */
export async function viagensEmAndamento(hoje: string, vendedorId?: string) {
  let q = db.from("rotas").select("*, paradas:rota_paradas(*, organizacao:organizacoes(nome,nome_fantasia)), pernoites:rota_pernoites(*), gastos:rota_gastos(categoria,valor)")
    .eq("status", "aprovada").lte("data_inicio", hoje).gte("data_fim", hoje).order("data_inicio");
  if (vendedorId) q = q.eq("vendedor_id", vendedorId);
  const { data, error } = await q;
  if (error) throw error;
  const rotas = (data ?? []) as (Rota & { paradas: RotaParada[]; pernoites: Pernoite[]; gastos: { categoria: string; valor: number }[] })[];
  if (!rotas.length) return [] as ViagemAndamento[];
  const ids = rotas.map((r) => r.id);
  const vend = [...new Set(rotas.map((r) => r.vendedor_id))];
  const [{ data: diario }, { data: perfis }] = await Promise.all([
    db.from("rota_diario").select("*").in("rota_id", ids).order("registrado_em", { ascending: false }),
    supabase.from("profiles").select("user_id, nome, email").in("user_id", vend),
  ]);
  return rotas.map((r) => ({
    ...r,
    vendedor: (perfis ?? []).find((p: any) => p.user_id === r.vendedor_id) ?? null,
    ultimo: ((diario ?? []) as Informativo[]).find((d) => d.rota_id === r.id) ?? null,
  }));
}

export function posicaoAtual(): Promise<{ lat: number; lng: number } | null> {
  if (!("geolocation" in navigator)) return Promise.resolve(null);
  return new Promise((res) => navigator.geolocation.getCurrentPosition(
    (p) => res({ lat: p.coords.latitude, lng: p.coords.longitude }), () => res(null), { timeout: 8000, maximumAge: 120000 }));
}
