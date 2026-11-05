import { useEffect, useRef, useState } from "react";
import { loadGoogleMaps, geocodeAddress } from "@/lib/maps";
import { siglaDoTexto } from "@/lib/cidadeGeo";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

export interface CidadeSugestao { placeId: string; descricao: string; cidade: string; estado: string }
export type CidadeEscolhida = { nome: string; estado: string; lat: number; lng: number };

/** Sugestões de cidades BR (Places AutocompleteSuggestion), debounce 250 ms, session token por interação. */
export function useCidadeAutocomplete(query: string, ativo: boolean) {
  const [sugestoes, setSugestoes] = useState<CidadeSugestao[]>([]);
  const [carregando, setCarregando] = useState(false);
  const tokenRef = useRef<any>(null);

  useEffect(() => {
    if (!ativo) { setSugestoes([]); return; }
    const q = query.trim();
    if (q.length < 2) { setSugestoes([]); return; }
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        setCarregando(true);
        const g = await loadGoogleMaps();
        const { AutocompleteSuggestion, AutocompleteSessionToken } = await g.maps.importLibrary("places");
        if (!tokenRef.current) tokenRef.current = new AutocompleteSessionToken();
        const { suggestions } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q, sessionToken: tokenRef.current, language: "pt-BR", region: "br",
          includedRegionCodes: ["br"], includedPrimaryTypes: ["locality", "administrative_area_level_2"],
        });
        if (cancelado) return;
        setSugestoes((suggestions ?? []).map((s: any) => {
          const p = s.placePrediction;
          if (!p) return null;
          const principal = p.mainText?.text ?? "";
          const sec = p.secondaryText?.text ?? "";
          return { placeId: p.placeId, descricao: `${principal}${sec ? `, ${sec}` : ""}`, cidade: principal, estado: siglaDoTexto(sec) };
        }).filter(Boolean) as CidadeSugestao[]);
      } catch (e) { console.warn(e); }
      finally { if (!cancelado) setCarregando(false); }
    }, 250);
    return () => { cancelado = true; clearTimeout(t); };
  }, [query, ativo]);

  /** Encerra a sessão de autocomplete (após escolha ou ao fechar). */
  function encerrar() { tokenRef.current = null; setSugestoes([]); }
  return { sugestoes, carregando, encerrar };
}

/** Coordenadas da sugestão escolhida. */
export async function resolverCidade(s: CidadeSugestao): Promise<CidadeEscolhida | null> {
  const c = await geocodeAddress(s.descricao);
  return c ? { nome: s.cidade, estado: s.estado, ...c } : null;
}

/** Campo de cidade com autocompletar; texto livre continua permitido. */
export default function CidadeAutocomplete({ id, value, onChange, onEscolher }: {
  id?: string; value: string; onChange: (v: string) => void; onEscolher: (c: CidadeEscolhida) => void;
}) {
  const [digitando, setDigitando] = useState(false);
  const { sugestoes, carregando, encerrar } = useCidadeAutocomplete(value, digitando);

  async function escolher(s: CidadeSugestao) {
    setDigitando(false); encerrar(); onChange(s.cidade);
    const c = await resolverCidade(s);
    if (c) onEscolher(c); else onEscolher({ nome: s.cidade, estado: s.estado, lat: NaN, lng: NaN });
  }

  return (
    <div className="relative">
      <Input id={id} value={value} autoComplete="off" placeholder="Buscar cidade..."
        onChange={(e) => { setDigitando(true); onChange(e.target.value); }}
        onBlur={() => setTimeout(() => setDigitando(false), 200)} />
      {carregando && <Loader2 className="w-4 h-4 absolute right-2.5 top-2.5 animate-spin text-muted-foreground" />}
      {digitando && sugestoes.length > 0 && (
        <div className="absolute z-50 mt-1 w-full border rounded-md divide-y bg-popover shadow-md">
          {sugestoes.map((s) => (
            <button key={s.placeId} type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => escolher(s)}
              className="w-full text-left px-3 py-2 hover:bg-accent flex items-center gap-2 text-sm">
              <MapPin className="w-3.5 h-3.5 text-muted-foreground" />{s.descricao}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
