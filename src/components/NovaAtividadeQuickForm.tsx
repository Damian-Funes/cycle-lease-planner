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

interface TipoAtividade { id: string; nome: string; icone: string | null; cor: string | null; }
interface Pessoa { id: string; nome: string; }

interface Props {
  oportunidadeId?: string;
  organizacaoId?: string;
  pessoaId?: string;
  pessoasDisponiveis?: Pessoa[];
  onSaved?: () => void;
  onClose?: () => void;
}

export default function NovaAtividadeQuickForm({
  oportunidadeId, organizacaoId, pessoaId, pessoasDisponiveis = [], onSaved, onClose,
}: Props) {
  const [tipos, setTipos] = useState<TipoAtividade[]>([]);
  const [tipoId, setTipoId] = useState<string>("");
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState(() => {
    const d = new Date(); d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
    return d.toISOString().slice(0, 16);
  });
  const [duracao, setDuracao] = useState("30");
  const [duracaoCustom, setDuracaoCustom] = useState("");
  const [descricao, setDescricao] = useState("");
  const [pessoaSel, setPessoaSel] = useState<string>(pessoaId || "");
  const [concluida, setConcluida] = useState(false);
  const [resultado, setResultado] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [saving, setSaving] = useState(false);
  const [criarMeet, setCriarMeet] = useState(false);
  const [tipoTocadoManualmente, setTipoTocadoManualmente] = useState(false);
  const { isConnected, syncAtividade } = useGoogleIntegration();

  const handleTipoChange = (v: string) => {
    setTipoTocadoManualmente(true);
    setTipoId(v);
  };

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

  useEffect(() => {
    supabase.from("tipos_atividade" as any).select("*").eq("ativo", true).order("ordem").then(({ data }) => {
      const arr = (data as any) || [];
      setTipos(arr);
      if (arr.length && !tipoId) setTipoId(arr[0].id);
    });
  }, []);

  const reset = () => {
    setTitulo(""); setDescricao(""); setResultado(""); setConcluida(false);
    setDuracao("30"); setDuracaoCustom(""); setCriarMeet(false);
  };

  const salvar = async () => {
    if (!titulo.trim()) { toast.error("Informe o título"); return; }
    if (!tipoId) { toast.error("Selecione o tipo"); return; }
    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const dur = duracao === "custom" ? parseInt(duracaoCustom || "0", 10) : parseInt(duracao, 10);
    const payload: any = {
      tipo_id: tipoId,
      titulo: titulo.trim(),
      descricao: descricao.trim() || null,
      data_inicio: new Date(data).toISOString(),
      duracao_minutos: dur || 30,
      concluida,
      data_conclusao: concluida ? new Date().toISOString() : null,
      resultado: concluida ? (resultado.trim() || null) : null,
      oportunidade_id: oportunidadeId || null,
      organizacao_id: organizacaoId || null,
      pessoa_id: pessoaSel || pessoaId || null,
      responsavel_id: auth.user?.id,
      tipo: tipos.find(t => t.id === tipoId)?.nome.toLowerCase() || "nota",
      data_atividade: new Date(data).toISOString(),
      criar_meet: criarMeet && isConnected,
    };
    const { data: inserted, error } = await (supabase as any)
      .from("atividades").insert(payload).select("id").single();
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Atividade criada");

    // Sync com Google (não bloqueia)
    if (inserted?.id && isConnected && (criarMeet || tipos.find(t => t.id === tipoId)?.nome.toLowerCase() === "reunião")) {
      syncAtividade(inserted.id, "create").then((r: any) => {
        if (r?.google_meet_link) toast.success("Reunião criada no Google Meet");
        else if (r?.error) toast.error("Falha ao sincronizar Google", { description: r.error });
      });
    }

    reset();
    onSaved?.();
  };

  const onKey = (e: KeyboardEvent) => {
    if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) { e.preventDefault(); salvar(); }
    if (e.key === "Escape") { e.preventDefault(); onClose?.(); }
  };

  return (
    <div className="border rounded-lg bg-card p-3 space-y-2" onKeyDown={onKey}>
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium">Nova atividade</span>
        {onClose && <Button size="icon" variant="ghost" className="h-7 w-7" onClick={onClose}><X className="h-4 w-4" /></Button>}
      </div>

      <div className="flex gap-2">
        <Select value={tipoId} onValueChange={handleTipoChange}>
          <SelectTrigger className="w-[160px]"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            {tipos.map(t => (
              <SelectItem key={t.id} value={t.id}>
                <span className="inline-flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: t.cor || "#888" }} />
                  {t.nome}
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Input placeholder="Título" value={titulo} onChange={e => setTitulo(e.target.value)} autoFocus />
      </div>

      <div className="flex gap-2">
        <Input type="datetime-local" value={data} onChange={e => setData(e.target.value)} className="flex-1" />
        <Select value={duracao} onValueChange={setDuracao}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="15">15 min</SelectItem>
            <SelectItem value="30">30 min</SelectItem>
            <SelectItem value="60">1 hora</SelectItem>
            <SelectItem value="90">1h30</SelectItem>
            <SelectItem value="custom">Custom</SelectItem>
          </SelectContent>
        </Select>
        {duracao === "custom" && (
          <Input type="number" placeholder="min" value={duracaoCustom} onChange={e => setDuracaoCustom(e.target.value)} className="w-20" />
        )}
      </div>

      <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)} className="text-xs h-7">
        {expanded ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
        Mais opções
      </Button>

      {expanded && (
        <div className="space-y-2 pt-1 border-t">
          <Textarea placeholder="Descrição" rows={2} value={descricao} onChange={e => setDescricao(e.target.value)} />
          {pessoasDisponiveis.length > 0 && (
            <Select value={pessoaSel} onValueChange={setPessoaSel}>
              <SelectTrigger><SelectValue placeholder="Pessoa (opcional)" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">— Nenhuma —</SelectItem>
                {pessoasDisponiveis.map(p => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
              </SelectContent>
            </Select>
          )}
        </div>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Switch id="concluida" checked={concluida} onCheckedChange={setConcluida} />
        <Label htmlFor="concluida" className="text-sm cursor-pointer">Já concluída?</Label>
      </div>
      {concluida && (
        <Textarea placeholder="Resultado" rows={2} value={resultado} onChange={e => setResultado(e.target.value)} />
      )}

      {isConnected && (
        <div className="flex items-center gap-2 pt-1">
          <Switch id="criar-meet" checked={criarMeet} onCheckedChange={setCriarMeet} />
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
