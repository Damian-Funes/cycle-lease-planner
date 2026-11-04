import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { MapPin, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { excluirInformativo, urlsAssinadas, type Informativo } from "@/lib/viagemDados";
import { haQuantoTempo } from "@/lib/viagemDiario";
import type { RotaParada } from "@/lib/rotas";

const dataHora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

export default function DiarioTimeline({ itens, paradas, podeApagar }: { itens: Informativo[]; paradas: RotaParada[]; podeApagar: boolean }) {
  const qc = useQueryClient();
  const paths = itens.flatMap((i) => i.fotos);
  const { data: urls = {} } = useQuery({ queryKey: ["viagens-urls", paths.join("|")], queryFn: () => urlsAssinadas(paths), enabled: paths.length > 0, staleTime: 30 * 60 * 1000 });
  if (!itens.length) return <p className="text-sm text-muted-foreground">Nenhum informativo registrado ainda.</p>;
  return (
    <ol className="relative border-l pl-5 space-y-5">
      {itens.map((i) => {
        const p = paradas.find((x) => x.id === i.parada_id);
        const nome = p ? (p.tipo === "pernoite" ? `Pernoite: ${p.hotel_nome}` : p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade) : null;
        return (
          <li key={i.id} className="relative">
            <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-primary" />
            <div className="text-xs text-muted-foreground flex flex-wrap gap-x-2">
              <span>{dataHora(i.registrado_em)} · {haQuantoTempo(i.registrado_em)}</span>
              {nome && <span>· {nome}</span>}
              {i.latitude != null && <a className="inline-flex items-center gap-0.5 underline" target="_blank" rel="noreferrer" href={`https://www.google.com/maps?q=${i.latitude},${i.longitude}`}><MapPin className="w-3 h-3" />local</a>}
            </div>
            <p className="text-sm whitespace-pre-wrap mt-1">{i.texto}</p>
            {i.fotos.length > 0 && <div className="flex flex-wrap gap-2 mt-2">{i.fotos.map((f) => urls[f]
              ? <a key={f} href={urls[f]} target="_blank" rel="noreferrer"><img src={urls[f]} alt="Foto do informativo" loading="lazy" className="w-24 h-24 object-cover rounded" /></a>
              : <div key={f} className="w-24 h-24 rounded bg-muted" />)}</div>}
            {podeApagar && <Button variant="ghost" size="sm" className="mt-1 text-destructive" onClick={async () => {
              if (!confirm("Apagar este informativo?")) return;
              try { await excluirInformativo(i.id); qc.invalidateQueries({ queryKey: ["rota-diario"] }); } catch (e) { toast.error((e as Error).message); }
            }}><Trash2 className="w-4 h-4 mr-1" />Apagar</Button>}
          </li>
        );
      })}
    </ol>
  );
}
