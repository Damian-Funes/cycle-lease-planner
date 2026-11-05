import { useEffect, useState } from "react";
import { geocodeAddress } from "@/lib/maps";
import { buscarMunicipios, indexarMunicipios, type MunicipioIndexado } from "@/lib/municipios";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

export interface CidadeSugestao { placeId: string; descricao: string; consulta: string; cidade: string; estado: string }
export type CidadeEscolhida = { nome: string; estado: string; lat: number; lng: number };

// Lista oficial IBGE carregada sob demanda (fica fora do bundle principal) e indexada uma vez.
let indicePromise: Promise<MunicipioIndexado[]> | null = null;
function carregarIndice() {
  if (!indicePromise) {
    indicePromise = import("@/data/municipios.json")
      .then((m) => indexarMunicipios(m.default))
      .catch((e) => { indicePromise = null; throw e; });
  }
  return indicePromise;
}

/** Sugestões de municípios (IBGE, busca local), debounce 150 ms, máx. 8. */
export function useCidadeAutocomplete(query: string, ativo: boolean, ufPreferida?: string | null) {
  const [sugestoes, setSugestoes] = useState<CidadeSugestao[]>([]);
  const [carregando, setCarregando] = useState(false);

  useEffect(() => {
    if (!ativo) { setSugestoes([]); return; }
    const q = query.trim();
    if (q.length < 2) { setSugestoes([]); return; }
    let cancelado = false;
    const t = setTimeout(async () => {
      try {
        setCarregando(true);
        const idx = await carregarIndice();
        if (cancelado) return;
        setSugestoes(buscarMunicipios(idx, q, ufPreferida).map((m) => ({
          placeId: `${m.n}|${m.uf}`, descricao: `${m.n} - ${m.uf}`, consulta: `${m.n}, ${m.uf}, Brasil`, cidade: m.n, estado: m.uf,
        })));
      } catch (e) { console.error("[cidades] falha ao carregar lista de municípios", e); }
      finally { if (!cancelado) setCarregando(false); }
    }, 150);
    return () => { cancelado = true; clearTimeout(t); };
  }, [query, ativo, ufPreferida]);

  function encerrar() { setSugestoes([]); }
  return { sugestoes, carregando, encerrar };
}

/** Coordenadas da cidade escolhida (null se o geocoder falhar). */
export async function resolverCidade(s: CidadeSugestao): Promise<CidadeEscolhida | null> {
  const c = await geocodeAddress(s.consulta);
  return c ? { nome: s.cidade, estado: s.estado, ...c } : null;
}

/** Campo de cidade com autocompletar; texto livre continua permitido. Cidade/UF saem na hora; coordenada depois. */
export default function CidadeAutocomplete({ id, value, onChange, onEscolher, onCoordenada, ufPreferida }: {
  id?: string; value: string; onChange: (v: string) => void;
  onEscolher: (c: { nome: string; estado: string }) => void;
  onCoordenada?: (c: CidadeEscolhida | null) => void;
  ufPreferida?: string | null;
}) {
  const [digitando, setDigitando] = useState(false);
  const { sugestoes, carregando, encerrar } = useCidadeAutocomplete(value, digitando, ufPreferida);

  async function escolher(s: CidadeSugestao) {
    setDigitando(false); encerrar();
    onEscolher({ nome: s.cidade, estado: s.estado });
    const c = await resolverCidade(s);
    onCoordenada?.(c);
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
