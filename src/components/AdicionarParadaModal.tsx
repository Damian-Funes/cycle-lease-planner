import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Search, Plus } from "lucide-react";
import { geocodeAddress, distanceKm } from "@/lib/maps";
import { filtrarOrganizacoes } from "@/lib/buscaOrganizacao";
import { supabase } from "@/integrations/supabase/client";
import { buscarOrganizacoesProximas, semaforoVisita, type OrganizacaoProxima } from "@/lib/rotas";
import { toast } from "sonner";
import { useCidadeAutocomplete, type CidadeSugestao } from "@/components/CidadeAutocomplete";
import { Label } from '@/components/ui/label';

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectOrganizacao: (org: OrganizacaoProxima, cidade: { nome: string; estado: string; lat: number; lng: number }) => Promise<void> | void;
  onAddProspeccao: (cidade: { nome: string; estado: string; lat: number; lng: number }) => Promise<void> | void;
  onObjetivo?: (objetivo: string) => void;
}


export default function AdicionarParadaModal({ open, onOpenChange, onSelectOrganizacao, onAddProspeccao, onObjetivo }: Props) {
  const [objetivo, setObjetivo] = useState('');
  const [query, setQuery] = useState("");
  const [cidadeSel, setCidadeSel] = useState<{ nome: string; estado: string; lat: number; lng: number } | null>(null);
  const [orgs, setOrgs] = useState<OrganizacaoProxima[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const [nomeFiltro, setNomeFiltro] = useState("");
  const [todas, setTodas] = useState<OrganizacaoProxima[] | null>(null);
  const { sugestoes, carregando: loadingSugest, encerrar } = useCidadeAutocomplete(query, open && !cidadeSel);

  useEffect(() => {
    if (!open) {
      setObjetivo('');
      setQuery(""); setCidadeSel(null); setOrgs([]); setNomeFiltro("");
      encerrar();
    }
  }, [open]);

  // Carrega (uma vez por abertura) as organizações visíveis ao usuário para a busca fora do raio.
  useEffect(() => {
    if (!open || todas || !nomeFiltro.trim()) return;
    (async () => {
      const { data, error } = await (supabase as any)
        .from("organizacoes")
        .select("id, nome, nome_fantasia, cidade, estado, cnpj, latitude, longitude, descartada_em")
        .limit(5000);
      if (error) { toast.error("Erro ao buscar organizações", { description: error.message }); return; }
      setTodas(((data ?? []) as any[]).filter((o) => !o.descartada_em).map((o) => ({
        ...o, ultima_visita_dias: null, oportunidade_titulo: null, oportunidade_valor: null, oportunidade_id: null,
      })));
    })();
  }, [open, nomeFiltro, todas]);
  useEffect(() => { if (!open) setTodas(null); }, [open]);

  const termo = nomeFiltro.trim();
  const orgsFiltradas = useMemo(() => (termo ? filtrarOrganizacoes(orgs, termo) : orgs), [orgs, termo]);
  const foraDoRaio = useMemo(() => {
    if (!termo || !todas) return [];
    const noRaio = new Set(orgs.map((o) => o.id));
    return filtrarOrganizacoes(todas.filter((o) => !noRaio.has(o.id)), termo).slice(0, 10).map((o) => ({
      ...o,
      distancia: cidadeSel && o.latitude != null && o.longitude != null
        ? distanceKm(cidadeSel, { lat: Number(o.latitude), lng: Number(o.longitude) }) : null,
    }));
  }, [todas, orgs, termo, cidadeSel]);
  const semObjetivo = Boolean(onObjetivo && !objetivo.trim());

  function Nomes({ o }: { o: { nome: string; nome_fantasia: string | null } }) {
    const fant = o.nome_fantasia?.trim();
    const dif = fant && fant.toLowerCase() !== o.nome.trim().toLowerCase();
    return (
      <>
        <div className="font-medium text-sm truncate">{fant || o.nome}</div>
        {dif && <div className="text-[11px] text-muted-foreground truncate">{o.nome}</div>}
      </>
    );
  }

  async function selecionarCidade(s: CidadeSugestao) {
    try {
      setLoadingOrgs(true);
      setQuery(s.descricao);
      encerrar();
      const coords = await geocodeAddress(s.consulta);
      if (!coords) { toast.error("Não foi possível localizar a cidade"); return; }
      const cidade = { nome: s.cidade, estado: s.estado, ...coords };
      setCidadeSel(cidade);
      const lista = await buscarOrganizacoesProximas({ ...coords, estado: s.estado || undefined }, 100);
      setOrgs(lista);
    } catch (e: any) {
      toast.error("Erro", { description: e?.message });
    } finally {
      setLoadingOrgs(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Adicionar parada</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          {onObjetivo && <div className="space-y-1"><Label htmlFor="objetivo-nova-parada">Objetivo *</Label><Input id="objetivo-nova-parada" value={objetivo} onChange={e => { setObjetivo(e.target.value); onObjetivo(e.target.value); }} placeholder="Ex.: apresentar LSB150" /></div>}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              placeholder="Buscar cidade..."
              onChange={(e) => { setQuery(e.target.value); setCidadeSel(null); setOrgs([]); }}
              className="pl-8"
              autoFocus
            />
            {(loadingSugest || loadingOrgs) && (
              <Loader2 className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />
            )}
          </div>

          {sugestoes.length > 0 && !cidadeSel && (
            <div className="border rounded-md divide-y">
              {sugestoes.map((s) => (
                <button
                  key={s.placeId}
                  className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-sm"
                  onClick={() => selecionarCidade(s)}
                >
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground" />
                  {s.descricao}
                </button>
              ))}
            </div>
          )}

          {cidadeSel && (
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {orgs.length === 0 && !loadingOrgs
                  ? "Nenhuma organização cadastrada num raio de 100 km."
                  : termo
                    ? `${orgsFiltradas.length} de ${orgs.length} no raio de 100 km`
                    : `${orgs.length} organização(ões) num raio de 100 km`}
              </div>
              <Button size="sm" variant="outline" disabled={semObjetivo} onClick={() => onAddProspeccao(cidadeSel)}>
                <Plus className="w-3.5 h-3.5 mr-1" /> Prospecção (sem org)
              </Button>
            </div>
          )}

          <div className="relative">
            <Search className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input value={nomeFiltro} onChange={(e) => setNomeFiltro(e.target.value)} placeholder="Filtrar empresas por nome..." className="pl-8" />
          </div>

          {cidadeSel && (
            <div className="space-y-2">
              {orgsFiltradas.map((o) => {
                const cor = semaforoVisita(o.ultima_visita_dias);
                const corClass =
                  cor === "verde" ? "bg-emerald-500" : cor === "amarelo" ? "bg-amber-500" : "bg-red-500";
                const label = o.ultima_visita_dias == null ? "Nunca visitada" : `${o.ultima_visita_dias} dias atrás`;
                return (
                  <div key={o.id} className="border rounded-md p-3 flex items-center gap-3">
                    <span className={`w-3 h-3 rounded-full ${corClass}`} title={label} />
                    <div className="flex-1 min-w-0">
                      <Nomes o={o} />
                      <div className="text-xs text-muted-foreground truncate">
                        {[o.cidade, o.estado].filter(Boolean).join(" / ")} · {label}
                      </div>
                      {o.oportunidade_titulo && (
                        <Badge variant="secondary" className="mt-1 text-[10px]">
                          {o.oportunidade_titulo}
                          {o.oportunidade_valor
                            ? ` · ${o.oportunidade_valor.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })}`
                            : ""}
                        </Badge>
                      )}
                    </div>
                    <Button size="sm" disabled={semObjetivo} onClick={() => onSelectOrganizacao(o, cidadeSel)}>
                      <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {termo && (
            <div className="space-y-2">
              <div className="text-sm font-medium text-muted-foreground pt-1">Fora do raio</div>
              {!todas ? (
                <div className="text-xs text-muted-foreground flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Buscando…</div>
              ) : foraDoRaio.length === 0 ? (
                <div className="text-xs text-muted-foreground">Nenhuma outra organização com esse nome.</div>
              ) : foraDoRaio.map((o) => (
                <div key={o.id} className="border rounded-md p-3 flex items-center gap-3">
                  <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <div className="flex-1 min-w-0">
                    <Nomes o={o} />
                    <div className="text-xs text-muted-foreground truncate">
                      {[o.cidade, o.estado].filter(Boolean).join(" / ") || "Sem cidade"}
                      {o.distancia != null && ` · ${Math.round(o.distancia).toLocaleString("pt-BR")} km de ${cidadeSel?.nome}`}
                    </div>
                  </div>
                  <Button size="sm" disabled={semObjetivo}
                    onClick={() => onSelectOrganizacao(o, cidadeSel ?? { nome: o.cidade ?? "", estado: o.estado ?? "", lat: Number(o.latitude ?? 0), lng: Number(o.longitude ?? 0) })}>
                    <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
                  </Button>
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
