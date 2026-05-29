import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

type Suggestion = {
  label: string;
  lat: number;
  lon: number;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

function formatFeature(f: any): Suggestion | null {
  const p = f?.properties;
  if (!p) return null;
  const parts = [
    p.name,
    p.street ? `${p.street}${p.housenumber ? ", " + p.housenumber : ""}` : null,
    p.district,
    p.city || p.town || p.village || p.county,
    p.state,
    p.country,
  ].filter(Boolean);
  // remove duplicados consecutivos
  const dedup: string[] = [];
  for (const part of parts) if (dedup[dedup.length - 1] !== part) dedup.push(part);
  const label = dedup.join(", ");
  const [lon, lat] = f.geometry?.coordinates ?? [];
  return { label, lat, lon };
}

export default function AddressAutocomplete({ value, onChange, placeholder, autoFocus }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const skipFetchRef = useRef(false);

  useEffect(() => { setQuery(value); }, [value]);

  // Fecha ao clicar fora
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // Debounced fetch
  useEffect(() => {
    if (skipFetchRef.current) { skipFetchRef.current = false; return; }
    const q = query.trim();
    if (q.length < 3) { setSuggestions([]); return; }
    const ctrl = new AbortController();
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        const url = `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=6&lang=pt&osm_tag=place&osm_tag=highway&osm_tag=building`;
        // O Photon ignora osm_tag inválido; mantemos para priorizar resultados úteis
        const r = await fetch(url, { signal: ctrl.signal });
        const json = await r.json();
        const feats = (json?.features ?? [])
          .map(formatFeature)
          .filter(Boolean) as Suggestion[];
        // prioriza BR
        feats.sort((a, b) => {
          const ab = /Brasil|Brazil/i.test(a.label) ? 0 : 1;
          const bb = /Brasil|Brazil/i.test(b.label) ? 0 : 1;
          return ab - bb;
        });
        setSuggestions(feats);
        setOpen(feats.length > 0);
      } catch {
        // silencioso
      } finally {
        setLoading(false);
      }
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  return (
    <div ref={wrapRef} className="relative">
      <div className="relative">
        <MapPin className="w-4 h-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          autoFocus={autoFocus}
          value={query}
          placeholder={placeholder}
          onChange={(e) => { setQuery(e.target.value); onChange(e.target.value); }}
          onFocus={() => suggestions.length && setOpen(true)}
          className="pl-8"
        />
        {loading && <Loader2 className="w-4 h-4 absolute right-2.5 top-1/2 -translate-y-1/2 animate-spin text-muted-foreground" />}
      </div>
      {open && suggestions.length > 0 && (
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-72 overflow-auto">
          {suggestions.map((s, i) => (
            <button
              type="button"
              key={i}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2"
              onClick={() => {
                skipFetchRef.current = true;
                setQuery(s.label);
                onChange(s.label);
                setOpen(false);
              }}
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <span>{s.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
