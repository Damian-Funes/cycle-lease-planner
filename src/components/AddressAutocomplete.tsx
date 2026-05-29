import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Loader2, MapPin } from "lucide-react";

type Suggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

type Props = {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
};

let googleLoaderPromise: Promise<void> | null = null;
function loadGoogleMaps(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject();
  if ((window as any).google?.maps?.importLibrary) return Promise.resolve();
  if (googleLoaderPromise) return googleLoaderPromise;

  const key = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY;
  const channel = import.meta.env.VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID;
  if (!key) return Promise.reject(new Error("Google Maps key indisponível"));

  googleLoaderPromise = new Promise<void>((resolve, reject) => {
    (window as any).__gmapsInit = () => resolve();
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${key}&loading=async&libraries=places&callback=__gmapsInit${channel ? `&channel=${channel}` : ""}`;
    s.async = true;
    s.onerror = () => reject(new Error("Falha ao carregar Google Maps"));
    document.head.appendChild(s);
  });
  return googleLoaderPromise;
}

export default function AddressAutocomplete({ value, onChange, placeholder, autoFocus }: Props) {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const skipFetchRef = useRef(false);
  const sessionTokenRef = useRef<any>(null);

  useEffect(() => { setQuery(value); }, [value]);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  useEffect(() => {
    if (skipFetchRef.current) { skipFetchRef.current = false; return; }
    const q = query.trim();
    if (q.length < 3) { setSuggestions([]); setOpen(false); return; }

    let cancelled = false;
    const t = setTimeout(async () => {
      try {
        setLoading(true);
        await loadGoogleMaps();
        const { AutocompleteSuggestion, AutocompleteSessionToken } =
          await (window as any).google.maps.importLibrary("places");

        if (!sessionTokenRef.current) sessionTokenRef.current = new AutocompleteSessionToken();

        const { suggestions: list } = await AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: q,
          sessionToken: sessionTokenRef.current,
          language: "pt-BR",
          region: "br",
          includedRegionCodes: ["br"],
        });

        if (cancelled) return;
        const mapped: Suggestion[] = (list ?? [])
          .map((s: any) => {
            const p = s.placePrediction;
            if (!p) return null;
            return {
              placeId: p.placeId,
              primary: p.mainText?.text ?? p.text?.text ?? "",
              secondary: p.secondaryText?.text ?? "",
            };
          })
          .filter(Boolean) as Suggestion[];
        setSuggestions(mapped);
        setOpen(mapped.length > 0);
      } catch (e) {
        // silencioso
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => { cancelled = true; clearTimeout(t); };
  }, [query]);

  async function selectSuggestion(s: Suggestion) {
    try {
      setLoading(true);
      const { Place } = await (window as any).google.maps.importLibrary("places");
      const place = new Place({ id: s.placeId, requestedLanguage: "pt-BR" });
      await place.fetchFields({ fields: ["formattedAddress"] });
      const full = place.formattedAddress || `${s.primary}, ${s.secondary}`.trim();
      skipFetchRef.current = true;
      setQuery(full);
      onChange(full);
      setOpen(false);
      sessionTokenRef.current = null; // encerra a sessão (cobrança)
    } catch {
      const fallback = `${s.primary}, ${s.secondary}`.trim();
      skipFetchRef.current = true;
      setQuery(fallback);
      onChange(fallback);
      setOpen(false);
    } finally {
      setLoading(false);
    }
  }

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
        <div className="absolute z-50 mt-1 w-full bg-popover border rounded-md shadow-lg max-h-80 overflow-auto">
          {suggestions.map((s) => (
            <button
              type="button"
              key={s.placeId}
              className="w-full text-left px-3 py-2 text-sm hover:bg-accent flex items-start gap-2"
              onClick={() => selectSuggestion(s)}
            >
              <MapPin className="w-3.5 h-3.5 mt-0.5 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="font-medium truncate">{s.primary}</div>
                {s.secondary && <div className="text-xs text-muted-foreground truncate">{s.secondary}</div>}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
