import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Loader2, MapPin, Search, Plus } from "lucide-react";
import { loadGoogleMaps, geocodeAddress } from "@/lib/maps";
import { buscarOrganizacoesProximas, semaforoVisita, type OrganizacaoProxima } from "@/lib/rotas";
import { toast } from "sonner";

interface CidadeSugestao {
  placeId: string;
  descricao: string;
  cidade: string;
  estado: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSelectOrganizacao: (org: OrganizacaoProxima, cidade: { nome: string; estado: string; lat: number; lng: number }) => Promise<void> | void;
  onAddProspeccao: (cidade: { nome: string; estado: string; lat: number; lng: number }) => Promise<void> | void;
}

const SIGLA_RE = /\b([A-Z]{2})\b/;

export default function AdicionarParadaModal({ open, onOpenChange, onSelectOrganizacao, onAddProspeccao }: Props) {
  const [query, setQuery] = useState("");
  const [sugestoes, setSugestoes] = useState<CidadeSugestao[]>([]);
  const [loadingSugest, setLoadingSugest] = useState(false);
  const [cidadeSel, setCidadeSel] = useState<{ nome: string; estado: string; lat: number; lng: number } | null>(null);
  const [orgs, setOrgs] = useState<OrganizacaoProxima[]>([]);
  const [loadingOrgs, setLoadingOrgs] = useState(false);
  const sessionTokenRef = useRef<any>(null);

  useEffect(() => {
    if (!open) {
      setQuery(""); setSugestoes([]); setCidadeSel(null); setOrgs([]);
      sessionTokenRef.current = null;
    }
  }, [open]);

  useEffect(() => {
    if (cidadeSel) return;
    const q = query.trim();
    if (q.length < 2) { setSugestoes([]); return; }
    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setLoadingSugest(true);
        const g = await loadGoogleMaps();
        const { AutocompleteSuggestion, AutocompleteSessionToken } = await g.maps.importLibrary("places");
        if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: sessionTokenRef.current,
          language: "pt-BR",
          region: "br",
          includedRegionCodes: ["br"],
          includedPrimaryTypes: ["locality", "administrative_area_level_2"],
        });
        if (cancelled) return;
        const mapped: CidadeSugestao[] = (suggestions ?? [])
          .map((s: any) => {
            const p = s.placePrediction;
            if (!p) return null;
            const principal = p.mainText?.text ?? "";
            const sec = p.secondaryText?.text ?? "";
            const m = sec.match(SIGLA_RE);
            return {
              placeId: p.placeId,
              descricao: `${principal}${sec ? `, ${sec}` : ""}`,
              cidade: principal,
              estado: m?.[1] ?? "",
            };
          })
          .filter(Boolean) as CidadeSugestao[];
        setSugestoes(mapped);
      } catch (e) {
        console.warn(e);
      } finally {
        if (!cancelled) setLoadingSugest(false);
      }
    }, 250);
    return () => { cancelled = true; clearTimeout(t); };
  }, [query, cidadeSel]);

  async function selecionarCidade(s: CidadeSugestao) {
    try {
      setLoadingOrgs(true);
      setQuery(s.descricao);
      setSugestoes([]);
      const coords = await geocodeAddress(s.descricao);
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
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  {orgs.length === 0 && !loadingOrgs
                    ? "Nenhuma organização cadastrada num raio de 50 km."
                    : `${orgs.length} organização(ões) num raio de 50 km`}
                </div>
                <Button size="sm" variant="outline" onClick={() => onAddProspeccao(cidadeSel)}>
                  <Plus className="w-3.5 h-3.5 mr-1" /> Prospecção (sem org)
                </Button>
              </div>

              <div className="space-y-2">
                {orgs.map((o) => {
                  const cor = semaforoVisita(o.ultima_visita_dias);
                  const corClass =
                    cor === "verde" ? "bg-emerald-500" : cor === "amarelo" ? "bg-amber-500" : "bg-red-500";
                  const label =
                    o.ultima_visita_dias == null
                      ? "Nunca visitada"
                      : `${o.ultima_visita_dias} dias atrás`;
                  return (
                    <div key={o.id} className="border rounded-md p-3 flex items-center gap-3">
                      <span className={`w-3 h-3 rounded-full ${corClass}`} title={label} />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{o.nome_fantasia || o.nome}</div>
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
                      <Button size="sm" onClick={() => onSelectOrganizacao(o, cidadeSel)}>
                        <Plus className="w-3.5 h-3.5 mr-1" /> Adicionar
                      </Button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
