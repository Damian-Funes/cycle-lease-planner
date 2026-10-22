import { useEffect, useState, KeyboardEvent } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { ChevronDown, ChevronUp, Loader2, Video, X } from "lucide-react";
import { toast } from "sonner";
import { useGoogleIntegration } from "@/hooks/useGoogleIntegration";
import { dataAtalho, toLocalInput, tituloAutomatico } from "@/lib/atividadeRapida";
import {
  DataComAtalhos, TipoChips, VinculoPicker, Vinculos, inserirAtividade, nomesVinculo, useAtividadeListas,
} from "@/components/atividade/AtividadeCampos";

interface Pessoa { id: string; nome: string; organizacao_id?: string | null; }

interface Props {
  oportunidadeId?: string;
  organizacaoId?: string;
  pessoaId?: string;
  /** @deprecated mantido para compatibilidade */
  pessoasDisponiveis?: Pessoa[];
  onSaved?: () => void;
  onClose?: () => void;
}

export default function NovaAtividadeQuickForm({
  oportunidadeId, organizacaoId, pessoaId, onSaved, onClose,
}: Props) {
  const { tipos, deals, orgs, pessoas } = useAtividadeListas();
  const [tipoId, setTipoId] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(() => toLocalInput(dataAtalho("amanha")));
  const [duracao, setDuracao] = useState("30");
  const [duracaoCustom, setDuracaoCustom] = useState("");
  const [descricao, setDescricao] = useState("");
  const [concluida, setConcluida] = useState(false);
  const [resultado, setResultado] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [criarMeet, setCriarMeet] = useState(false);
  const [vinc, setVinc] = useState<Vinculos>({ dealId: oportunidadeId || "", orgId: organizacaoId || "", pesId: pessoaId || "" });
  const [dataKey, setDataKey] = useState(0);

  const { isConnected, syncAtividade } = useGoogleIntegration();

  useEffect(() => { if (tipos.length && !tipoId) setTipoId(tipos[0].id); }, [tipos, tipoId]);

  // Deal vindo por props → herda org quando listas carregarem
  useEffect(() => {
    if (!vinc.dealId || vinc.orgId) return;
    const d = deals.find((x) => x.id === vinc.dealId);
    if (d?.organizacao_id) setVinc((v) => ({ ...v, orgId: d.organizacao_id! }));
  }, [deals, vinc.dealId, vinc.orgId]);

  const tipoSel = tipos.find((t) => t.id === tipoId);

  const handleCriarMeetChange = (v: boolean) => {
    setCriarMeet(v);
    if (v) {
      const reuniao = tipos.find((t) => {
        const n = t.nome.toLowerCase();
        return n === "reunião" || n === "reuniao";
      });
      if (reuniao && tipoId !== reuniao.id) {
        setTipoId(reuniao.id);
        toast.info("Tipo alterado para Reunião automaticamente", { duration: 2000 });
      }
    }
  };

  const handleConcluida = (v: boolean) => {
    setConcluida(v);
    if (v) { setData(toLocalInput(new Date())); setDataKey((k) => k + 1); }
  };

  const reset = () => {
    setTitulo(""); setDescricao(""); setResultado(""); setConcluida(false);
    setDuracao("30"); setDuracaoCustom(""); setCriarMeet(false);
    setData(toLocalInput(dataAtalho("amanha"))); setDataKey((k) => k + 1);
    setVinc({ dealId: oportunidadeId || "", orgId: organizacaoId || "", pesId: pessoaId || "" });
  };

  const salvar = async () => {
    if (!tipoId) { toast.error("Selecione o tipo"); return; }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const dur = duracao === "custom" ? parseInt(duracaoCustom || "0", 10) : parseInt(duracao, 10);
    const id = await inserirAtividade({
      tipo: tipoSel, titulo, descricao, dataLocal: data, duracao: dur, concluida, resultado,
      vinculos: vinc, responsavelId: auth.user?.id, criarMeet, isConnected,
      deals, orgs, pessoas, syncAtividade,
    });
    setSaving(false);
    if (!id) return;
    toast.success("Atividade criada");
    reset();
    onSaved?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); }
    if (e.key === "Escape") { e.preventDefault(); onClose?.(); }
  };

  const tituloPlaceholder = `Título (opcional) — ${tituloAutomatico(tipoSel?.nome || "Atividade", nomesVinculo(vinc, { deals, orgs, pessoas }))}`;

  return (
    <div className="border rounded-lg bg-card p-3 space-y-2.5" onKeyDown={onKey}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Nova atividade</span>
        {onClose && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>}
      </div>

      <TipoChips tipos={tipos} value={tipoId} onChange={setTipoId} />

      <Input placeholder={tituloPlaceholder} value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />

      <DataComAtalhos key={dataKey} value={data} onChange={setData} ativo={concluida ? null : "amanha"} />

      <VinculoPicker value={vinc} onChange={setVinc} deals={deals} orgs={orgs} pessoas={pessoas} />

      <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-xs h-7">
        {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
        Mais opções
      </Button>

      {expanded && (
        <div className="space-y-2 pt-1 border-t">
          <Textarea placeholder="Descrição" rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} />
          <div className="flex items-center gap-2">
            <Label className="text-xs">Duração</Label>
            <Select value={duracao} onValueChange={setDuracao}>
              <SelectTrigger className="w-[120px] h-8"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="15">15 min</SelectItem>
                <SelectItem value="30">30 min</SelectItem>
                <SelectItem value="60">1 hora</SelectItem>
                <SelectItem value="90">1h30</SelectItem>
                <SelectItem value="custom">Custom</SelectItem>
              </SelectContent>
            </Select>
            {duracao === "custom" && (
              <Input type="number" placeholder="min" value={duracaoCustom} onChange={e => setDuracaoCustom(e.target.value)} className="w-20 h-8" />
            )}
          </div>
          <div className="flex items-center gap-2 pt-1">
            <Switch id="concluida" checked={concluida} onCheckedChange={handleConcluida} />
            <Label htmlFor="concluida" className="text-sm cursor-pointer">Já concluída?</Label>
          </div>
          {concluida && (
            <Textarea placeholder="Resultado" rows={2} value={resultado} onChange={e => setResultado(e.target.value)} />
          )}
        </div>
      )}

      {isConnected && (
        <div className="flex items-center gap-2 pt-1">
          <Switch id="criar-meet" checked={criarMeet} onCheckedChange={handleCriarMeetChange} />
          <Label htmlFor="criar-meet" className="text-sm cursor-pointer flex items-center gap-1">
            <Video className="h-3.5 w-3.5 text-primary" /> Criar reunião Google Meet
          </Label>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <span className="text-xs text-muted-foreground self-center">Ctrl+Enter para salvar · Esc fecha</span>
        <Button size="sm" onClick={salvar} disabled={saving}>
          {saving && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}Salvar
        </Button>
      </div>
    </div>
  );
}
