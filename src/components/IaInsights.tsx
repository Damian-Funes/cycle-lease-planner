import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Sparkles } from "lucide-react";

function AiBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
      <Sparkles className="w-3 h-3" /> extraído por IA
    </span>
  );
}

export function InformacoesImportantes({ texto }: { texto?: string | null }) {
  const itens = (texto ?? "")
    .split("\n")
    .map((l) => l.replace(/^[•\-\*]\s*/, "").trim())
    .filter(Boolean);

  return (
    <div className="rounded-xl border border-border bg-primary/[0.02] p-4">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-sm font-medium">Informações importantes</span>
        <AiBadge />
      </div>
      {itens.length === 0 ? (
        <div className="text-sm text-muted-foreground">Nenhuma informação capturada ainda.</div>
      ) : (
        <ul className="space-y-1 text-sm">
          {itens.map((item, i) => (
            <li key={i} className="flex gap-2">
              <span className="text-muted-foreground">•</span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface PerfilRow {
  tom: string | null;
  canal_preferido: string | null;
  estilo_comunicacao: string | null;
  velocidade_decisao: string | null;
  sensibilidade_preco: string | null;
  confianca: string | null;
  resumo: string | null;
  interesses_comerciais: any;
  idiomas_observados: any;
  gerado_em: string | null;
}

export function PerfilComportamental({ pessoaId }: { pessoaId?: string | null }) {
  const { data: perfil } = useQuery({
    queryKey: ["pessoa-perfil", pessoaId],
    queryFn: async () => {
      const { data } = await (supabase as any)
        .from("vw_pessoa_perfil_atual")
        .select("*")
        .eq("pessoa_id", pessoaId)
        .maybeSingle();
      return (data ?? null) as PerfilRow | null;
    },
    enabled: !!pessoaId,
  });

  if (!perfil) return null;

  const chips = ([
    ["Canal", perfil.canal_preferido],
    ["Tom", perfil.tom],
    ["Estilo", perfil.estilo_comunicacao],
    ["Decisão", perfil.velocidade_decisao],
    ["Sensível a preço", perfil.sensibilidade_preco],
  ] as const).filter(([, v]) => v && v !== "nao_observado");

  const interesses = Array.isArray(perfil.interesses_comerciais) ? perfil.interesses_comerciais : [];

  return (
    <div className="rounded-xl border border-border bg-primary/[0.02] p-4">
      <div className="mb-3 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium">Perfil comportamental</span>
        <AiBadge />
        {perfil.confianca && (
          <span className="text-xs text-muted-foreground">confiança: {perfil.confianca}</span>
        )}
      </div>

      {perfil.resumo && <p className="mb-3 text-sm text-muted-foreground">{perfil.resumo}</p>}

      {chips.length > 0 && (
        <div className="mb-3 flex flex-wrap gap-2">
          {chips.map(([label, val]) => (
            <span key={label} className="rounded-lg bg-muted px-2 py-1 text-xs">
              {label}: <strong>{String(val)}</strong>
            </span>
          ))}
        </div>
      )}

      {interesses.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {interesses.map((it: any, i: number) => (
            <span key={i} className="rounded-full border border-border px-2 py-0.5 text-xs">
              {String(it)}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
