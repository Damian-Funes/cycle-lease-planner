import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ArrowLeft, RefreshCw, Loader2, Search, CheckCircle2, X } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import { toast } from "sonner";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

type Lead = any;

export default function Leads() {
  const navigate = useNavigate();
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [busca, setBusca] = useState("");
  const [statusFiltro, setStatusFiltro] = useState<string>("novo");
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [convertLead, setConvertLead] = useState<Lead | null>(null);
  const [pipelineSel, setPipelineSel] = useState<string>("");
  const [converting, setConverting] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("leads_rd" as any)
      .select("*")
      .order("recebido_em", { ascending: false })
      .limit(500);
    setLeads((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => {
    load();
    supabase.from("pipelines").select("id, nome").eq("ativo", true).order("ordem")
      .then(({ data }) => setPipelines(data || []));
  }, []);

  const filtrados = useMemo(() => {
    const q = busca.toLowerCase();
    return leads.filter((l) => {
      if (statusFiltro !== "todos" && l.status !== statusFiltro) return false;
      if (!q) return true;
      return [l.nome, l.email, l.empresa, l.telefone].some((v) => v?.toLowerCase().includes(q));
    });
  }, [leads, busca, statusFiltro]);

  const sincronizar = async () => {
    setSyncing(true);
    try {
      const { data, error } = await supabase.functions.invoke("rd-sync-leads", {
        body: { origem: "manual" },
      });
      if (error) throw error;
      toast.success(`Sincronizado: ${data?.novos ?? 0} novos, ${data?.atualizados ?? 0} atualizados`);
      await load();
    } catch (e: any) {
      toast.error("Falha ao sincronizar", { description: e.message });
    } finally {
      setSyncing(false);
    }
  };

  const descartar = async (lead: Lead) => {
    if (!confirm(`Descartar lead "${lead.nome || lead.email}"?`)) return;
    await supabase.from("leads_rd" as any).update({ status: "descartado" }).eq("id", lead.id);
    toast.success("Lead descartado");
    load();
  };

  const converter = async () => {
    if (!convertLead || !pipelineSel) return;
    setConverting(true);
    try {
      const { data, error } = await supabase.functions.invoke("rd-convert-lead", {
        body: { lead_id: convertLead.id, pipeline_id: pipelineSel },
      });
      if (error) throw error;
      if (!data?.ok) throw new Error(data?.error || "Erro desconhecido");
      toast.success("Lead convertido em oportunidade");
      setConvertLead(null);
      setPipelineSel("");
      load();
    } catch (e: any) {
      toast.error("Falha ao converter", { description: e.message });
    } finally {
      setConverting(false);
    }
  };

  const statusBadge = (s: string) => {
    const map: Record<string, { label: string; cls: string }> = {
      novo: { label: "Novo", cls: "bg-emerald-100 text-emerald-700" },
      convertido: { label: "Convertido", cls: "bg-blue-100 text-blue-700" },
      descartado: { label: "Descartado", cls: "bg-gray-200 text-gray-600" },
    };
    const m = map[s] || { label: s, cls: "bg-gray-100" };
    return <Badge className={m.cls + " border-0"}>{m.label}</Badge>;
  };

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            <ArrowLeft className="h-4 w-4 mr-1" /> Início
          </Button>
          <h1 className="font-semibold text-lg">Leads (RD Station)</h1>
          <div className="ml-auto flex items-center gap-2">
            <Button onClick={sincronizar} disabled={syncing} variant="outline" size="sm">
              {syncing ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <RefreshCw className="h-4 w-4 mr-1" />}
              Sincronizar agora
            </Button>
            <AppHeader />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap gap-2 items-center">
          <div className="relative flex-1 min-w-[240px]">
            <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar por nome, email, empresa..." value={busca} onChange={(e) => setBusca(e.target.value)} />
          </div>
          <Select value={statusFiltro} onValueChange={setStatusFiltro}>
            <SelectTrigger className="w-[180px]"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="novo">Novos</SelectItem>
              <SelectItem value="convertido">Convertidos</SelectItem>
              <SelectItem value="descartado">Descartados</SelectItem>
              <SelectItem value="todos">Todos</SelectItem>
            </SelectContent>
          </Select>
          <div className="text-sm text-muted-foreground">{filtrados.length} lead(s)</div>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : filtrados.length === 0 ? (
          <Card className="p-12 text-center text-muted-foreground">
            Nenhum lead {statusFiltro !== "todos" ? `com status "${statusFiltro}"` : ""}.
            <div className="mt-2 text-xs">Clique em "Sincronizar agora" para buscar do RD Station.</div>
          </Card>
        ) : (
          <div className="space-y-2">
            {filtrados.map((l) => (
              <Card key={l.id} className="p-4 flex flex-wrap items-center gap-4">
                <div className="flex-1 min-w-[200px]">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{l.nome || l.email || "(sem nome)"}</span>
                    {statusBadge(l.status)}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {l.empresa && <span>{l.empresa} · </span>}
                    {l.email && <span>{l.email} · </span>}
                    {l.telefone && <span>{l.telefone}</span>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-1">
                    {l.cidade && `${l.cidade}${l.estado ? "/" + l.estado : ""} · `}
                    {l.conversion_identifier && <span className="italic">{l.conversion_identifier} · </span>}
                    {l.utm_source && <span>UTM: {l.utm_source} · </span>}
                    {format(new Date(l.recebido_em), "dd/MM/yyyy HH:mm", { locale: ptBR })}
                  </div>
                </div>
                {l.status === "novo" && (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => setConvertLead(l)}>
                      <CheckCircle2 className="h-4 w-4 mr-1" /> Converter
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => descartar(l)}>
                      <X className="h-4 w-4 mr-1" /> Descartar
                    </Button>
                  </div>
                )}
                {l.status === "convertido" && l.oportunidade_id && (
                  <Button size="sm" variant="outline" onClick={() => navigate(`/crm/deal/${l.oportunidade_id}`)}>
                    Ver oportunidade
                  </Button>
                )}
              </Card>
            ))}
          </div>
        )}
      </main>

      <Dialog open={!!convertLead} onOpenChange={(o) => !o && setConvertLead(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Converter lead em oportunidade</DialogTitle></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="text-sm">
              <div><strong>{convertLead?.nome || convertLead?.email}</strong></div>
              {convertLead?.empresa && <div className="text-muted-foreground">{convertLead.empresa}</div>}
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Funil de destino</label>
              <Select value={pipelineSel} onValueChange={setPipelineSel}>
                <SelectTrigger><SelectValue placeholder="Escolha um funil" /></SelectTrigger>
                <SelectContent>
                  {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <p className="text-xs text-muted-foreground">
              Será criada uma Organização (com responsável atribuído pela regra de estado), uma Pessoa de contato e uma Oportunidade na 1ª etapa do funil.
            </p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConvertLead(null)}>Cancelar</Button>
            <Button onClick={converter} disabled={!pipelineSel || converting}>
              {converting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}Converter
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
