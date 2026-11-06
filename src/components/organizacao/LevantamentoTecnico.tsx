import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Loader2 } from "lucide-react";
import {
  dataCurta, historicoUnidades, informadoPor, nomesAutores, situacoesAtuais, unidadesOrganizacao, type CampoAtual, type SituacaoAtual,
} from "@/lib/levantamentos";

const INTERESSE: Record<string, string> = { alto: "Alto", medio: "Médio", baixo: "Baixo" };

export default function LevantamentoTecnico({ organizacaoId }: { organizacaoId: string }) {
  const q = useQuery({
    queryKey: ["levantamentos", organizacaoId],
    retry: false,
    queryFn: async () => {
      const unidades = await unidadesOrganizacao(organizacaoId);
      const ids = unidades.length ? unidades.map(u => u.id) : [organizacaoId];
      const [situacoes, historico] = await Promise.all([situacoesAtuais(ids), historicoUnidades(ids)]);
      const nomes = await nomesAutores(historico.map((h) => h.autor_id ?? ""));
      return { unidades, situacoes, historico, nomes };
    },
  });

  if (q.isLoading) return <Card className="p-4 flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="w-4 h-4 animate-spin" /> Carregando levantamentos…</Card>;
  if (q.isError) return <Card className="p-4 text-sm text-destructive" role="alert">Não foi possível carregar o levantamento técnico.</Card>;
  const { unidades, situacoes, historico, nomes } = q.data!;
  const varias = unidades.length > 1;
  const nomeUnidade = (id: string) => unidades.find(u => u.id === id)?.nome ?? "";
  if (!historico.length) return <Card className="p-4 text-sm text-muted-foreground">Nenhuma visita registrada ainda. Os dados aparecem aqui quando uma visita é prestada.</Card>;

  const item = (rotulo: string, campo: CampoAtual | null, fmt?: (v: CampoAtual["valor"]) => string) => (
    <div>
      <p className="text-xs text-muted-foreground">{rotulo}</p>
      <p className="text-sm font-medium">{campo?.valor != null ? (fmt ? fmt(campo.valor) : String(campo.valor)) : "—"}</p>
      {campo && <p className="text-[11px] text-muted-foreground">{informadoPor(campo, nomes)}</p>}
    </div>
  );

  return (
    <div className="space-y-4">
      {unidades.map(u => situacoes.find(x => x.organizacao_id === u.id)).filter((x): x is SituacaoAtual => !!x).map(atual => (
      <Card key={atual.organizacao_id} className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Situação atual{varias ? ` — ${nomeUnidade(atual.organizacao_id)}` : ""}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {item("Sacos por safra", atual?.sacos_safra ?? null, (v) => Number(v).toLocaleString("pt-BR"))}
          {item("Equipamento atual", atual?.equipamento_atual ?? null)}
          {item("Decisores", atual?.decisores ?? null)}
          {item("Interesse", atual?.interesse ?? null, (v) => INTERESSE[String(v)] ?? String(v))}
          {item("Concorrente", atual?.concorrente ?? null)}
          {item("Problema principal", atual?.problema_principal ?? null)}
          <div>
            <p className="text-xs text-muted-foreground">Última visita</p>
            <p className="text-sm font-medium">{atual?.ultima_visita ? dataCurta(atual.ultima_visita.data) : "—"}</p>
            {atual?.ultima_visita?.rota_id && <Link className="text-[11px] text-primary underline" to={`/viagens/${atual.ultima_visita.rota_id}/acompanhar`}>ver viagem</Link>}
          </div>
        </div>
      </Card>
      ))}
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">Histórico de levantamentos</h3>
        <ol className="space-y-3">
          {historico.map((h) => (
            <li key={h.id} className="border-l-2 border-primary/40 pl-3 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                <span className="font-medium text-foreground">{dataCurta(h.data_visita)}</span>
                <span>{h.autor_id ? nomes[h.autor_id] ?? "vendedor" : "sistema"}</span>
                {varias && <Badge variant="secondary">{nomeUnidade(h.organizacao_id)}</Badge>}
                <Badge variant="outline">{h.origem === "manual" ? "Correção" : h.origem === "whatsapp" ? "WhatsApp" : "Visita"}</Badge>
                {h.interesse && <Badge variant="secondary">Interesse {INTERESSE[h.interesse] ?? h.interesse}</Badge>}
                {h.rota_id && <Link className="text-primary underline" to={`/viagens/${h.rota_id}/acompanhar`}>viagem</Link>}
              </div>
              {h.resultado && <p className="text-sm">{h.resultado}</p>}
              <ul className="text-xs text-muted-foreground space-y-0.5">
                {h.contato_nome && <li>Contato: {h.contato_nome}{h.contato_cargo ? ` (${h.contato_cargo})` : ""}</li>}
                {h.sacos_safra != null && <li>Sacos/safra: {Number(h.sacos_safra).toLocaleString("pt-BR")}</li>}
                {h.equipamento_atual && <li>Equipamento: {h.equipamento_atual}</li>}
                {h.decisores && <li>Decisores: {h.decisores}</li>}
                {h.concorrente && <li>Concorrente: {h.concorrente}</li>}
                {h.objecoes?.length ? <li>Objeções: {h.objecoes.join("; ")}</li> : null}
                {h.proximo_passo && <li>Próximo passo: {h.proximo_passo}{h.proximo_passo_data ? ` em ${dataCurta(h.proximo_passo_data)}` : ""}</li>}
              </ul>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}
