import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Check, CalendarClock, X, Undo2, Pencil, Phone, MessageCircle, Building2, User, Briefcase, History, RotateCcw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Drawer, DrawerContent, DrawerHeader, DrawerTitle } from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import type { AcaoAtividade } from "./AcoesAtividade";

export interface AtividadeDetalheDados {
  id: string; titulo: string; descricao: string | null; data_inicio: string; concluida: boolean;
  tipo_id: string | null; responsavel_id: string | null; oportunidade_id: string | null;
  organizacao_id: string | null; pessoa_id: string | null;
}

interface Pessoa { nome: string; cargo: string | null; telefone: string | null; celular: string | null }
interface Reag { id: string; data_anterior: string | null; data_nova: string | null; motivo: string | null; tipo: string | null; autor_id: string | null; created_at: string }

const digitos = (s: string) => s.replace(/\D/g, "");
const waLink = (tel: string) => { const d = digitos(tel); return `https://wa.me/${d.length <= 11 ? "55" + d : d}`; };
const dt = (s: string | null) => (s ? format(new Date(s), "dd/MM HH:mm", { locale: ptBR }) : "—");

export default function AtividadeDetalhe({ atividade, tipoNome, responsavelNome, orgNome, oppTitulo, nomeDe, onClose, onAcao, onEditar, onReabrir }: {
  atividade: AtividadeDetalheDados | null;
  tipoNome?: string | null; responsavelNome?: string | null; orgNome?: string | null; oppTitulo?: string | null;
  nomeDe: (userId: string | null) => string | null;
  onClose: () => void;
  onAcao: (tipo: AcaoAtividade) => void;
  onEditar: () => void;
  onReabrir: () => void;
}) {
  const isMobile = useIsMobile();
  const [pessoa, setPessoa] = useState<Pessoa | null>(null);
  const [reags, setReags] = useState<Reag[] | null>(null);
  const [extra, setExtra] = useState<{ resultado: string | null; motivo_cancelamento: string | null } | null>(null);

  useEffect(() => {
    setPessoa(null); setReags(null); setExtra(null);
    if (!atividade) return;
    let vivo = true;
    const db = supabase as any;
    if (atividade.pessoa_id) db.from("pessoas").select("nome, cargo, telefone, celular").eq("id", atividade.pessoa_id).maybeSingle()
      .then(({ data }: any) => vivo && setPessoa(data ?? null));
    db.from("atividade_reagendamentos").select("id, data_anterior, data_nova, motivo, tipo, autor_id, created_at").eq("atividade_id", atividade.id).order("created_at", { ascending: false })
      .then(({ data, error }: any) => vivo && setReags(error ? null : data ?? []));
    db.from("atividades").select("resultado, motivo_cancelamento").eq("id", atividade.id).maybeSingle()
      .then(({ data }: any) => vivo && setExtra(data ?? null));
    return () => { vivo = false; };
  }, [atividade?.id]);

  if (!atividade) return null;
  const a = atividade;
  const atrasada = !a.concluida && new Date(a.data_inicio) < new Date();
  const tel = pessoa?.celular || pessoa?.telefone || null;
  const grande = isMobile ? "h-14 text-base" : "h-11";

  const acoes = a.concluida ? (
    <div className="space-y-2">
      <div className="rounded-md bg-muted p-3 text-sm"><span className="font-medium">Concluída.</span> {extra?.resultado || extra?.motivo_cancelamento || ""}</div>
      <Button variant="outline" className="w-full" onClick={onReabrir}><RotateCcw className="h-4 w-4 mr-1" />Reabrir</Button>
    </div>
  ) : (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      <Button className={grande} onClick={() => onAcao("feito")}><Check className="h-4 w-4 mr-1" />Feito</Button>
      <Button variant="outline" className={grande} onClick={() => onAcao("nao_fiz")}><Undo2 className="h-4 w-4 mr-1" />Não fiz</Button>
      <Button variant="outline" className={grande} onClick={() => onAcao("reagendar")}><CalendarClock className="h-4 w-4 mr-1" />Reagendar</Button>
      <Button variant="outline" className={`${grande} text-destructive`} onClick={() => onAcao("cancelar")}><X className="h-4 w-4 mr-1" />Cancelar</Button>
    </div>
  );

  const corpo = (
    <div className="space-y-4">
      {acoes}
      <div className="text-sm space-y-1">
        <div className={atrasada ? "text-destructive font-medium" : "text-muted-foreground"}>
          {format(new Date(a.data_inicio), "EEEE, dd/MM 'às' HH:mm", { locale: ptBR })}{atrasada ? " · atrasada" : ""}
        </div>
        <div className="text-muted-foreground">{[tipoNome, responsavelNome].filter(Boolean).join(" · ")}</div>
        {a.descricao && <p className="whitespace-pre-wrap pt-1">{a.descricao}</p>}
      </div>
      <div className="space-y-2 text-sm">
        {a.organizacao_id && orgNome && (
          <Link to={`/organizacoes/${a.organizacao_id}`} className="flex items-center gap-2 hover:underline"><Building2 className="h-4 w-4 text-muted-foreground" />{orgNome}</Link>
        )}
        {a.pessoa_id && pessoa && (
          <div className="flex flex-wrap items-center gap-2">
            <User className="h-4 w-4 text-muted-foreground" />
            <span>{pessoa.nome}{pessoa.cargo ? ` · ${pessoa.cargo}` : ""}</span>
            {tel && <>
              <Button asChild size="sm" variant="outline" className="h-7"><a href={`tel:${digitos(tel)}`}><Phone className="h-3.5 w-3.5 mr-1" />{tel}</a></Button>
              <Button asChild size="sm" variant="outline" className="h-7"><a href={waLink(tel)} target="_blank" rel="noreferrer"><MessageCircle className="h-3.5 w-3.5 mr-1" />WhatsApp</a></Button>
            </>}
          </div>
        )}
        {a.oportunidade_id && (
          <Link to={`/crm/deal/${a.oportunidade_id}`} className="flex items-center gap-2 hover:underline"><Briefcase className="h-4 w-4 text-muted-foreground" />{oppTitulo || "Oportunidade"}</Link>
        )}
      </div>
      {reags && reags.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-semibold flex items-center gap-1 text-muted-foreground"><History className="h-3.5 w-3.5" />Reagendamentos ({reags.length})</div>
          <ul className="text-xs space-y-1">
            {reags.map((r) => (
              <li key={r.id} className="rounded border px-2 py-1">
                <span className="tabular-nums">{dt(r.data_anterior)} → {dt(r.data_nova)}</span>
                {r.motivo && <span> · {r.motivo}</span>}
                <span className="text-muted-foreground"> · {nomeDe(r.autor_id) || "—"}, {dt(r.created_at)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onEditar}><Pencil className="h-4 w-4 mr-1" />Editar</Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open onOpenChange={(o) => !o && onClose()}>
        <DrawerContent className="max-h-[95dvh]">
          <DrawerHeader className="text-left"><DrawerTitle>{a.titulo}</DrawerTitle></DrawerHeader>
          <div className="px-4 pb-6 overflow-y-auto">{corpo}</div>
        </DrawerContent>
      </Drawer>
    );
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{a.titulo}</DialogTitle></DialogHeader>
        {corpo}
      </DialogContent>
    </Dialog>
  );
}
