import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { listMinhasRotas, listRotasEquipe, criarRota, deletarRota } from "@/lib/rotas";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ArrowLeft, Plus, MapPin, Trash2, Route, Compass, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

export default function Rotas() {
  const navigate = useNavigate();
  const { user, isAdmin } = useAuth();
  const qc = useQueryClient();
  const [novoOpen, setNovoOpen] = useState(false);
  const [data, setData] = useState(format(new Date(), "yyyy-MM-dd"));
  const [obs, setObs] = useState("");

  const [filtroVendedor, setFiltroVendedor] = useState<string>("todos");
  const [inicio, setInicio] = useState("");
  const [fim, setFim] = useState("");

  const { data: minhas = [] } = useQuery({
    queryKey: ["rotas-minhas", user?.id],
    enabled: !!user,
    queryFn: () => listMinhasRotas(user!.id),
  });

  const { data: equipe = [] } = useQuery({
    queryKey: ["rotas-equipe", filtroVendedor, inicio, fim],
    enabled: isAdmin,
    queryFn: () => listRotasEquipe({
      vendedorId: filtroVendedor !== "todos" ? filtroVendedor : undefined,
      inicio: inicio || undefined,
      fim: fim || undefined,
    }),
  });

  const { data: profiles = [] } = useQuery({
    queryKey: ["profiles-lite-rotas"],
    enabled: isAdmin,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("user_id, nome, email").eq("status", "approved");
      return (data ?? []) as { user_id: string; nome: string | null; email: string }[];
    },
  });

  const profileMap = new Map(profiles.map((p) => [p.user_id, p.nome || p.email]));

  const criar = useMutation({
    mutationFn: async () => {
      if (!user) throw new Error("Não autenticado");
      const r = await criarRota({ vendedor_id: user.id, data_rota: data, observacoes: obs || null });
      return r;
    },
    onSuccess: (r) => {
      toast.success("Rota criada");
      qc.invalidateQueries({ queryKey: ["rotas-minhas"] });
      setNovoOpen(false);
      navigate(`/rotas/${r.id}`);
    },
    onError: (e: any) => toast.error("Erro", { description: e?.message }),
  });

  const apagar = useMutation({
    mutationFn: (id: string) => deletarRota(id),
    onSuccess: () => {
      toast.success("Rota removida");
      qc.invalidateQueries({ queryKey: ["rotas-minhas"] });
      qc.invalidateQueries({ queryKey: ["rotas-equipe"] });
    },
  });

  function RotaCard({ r, mostrarVendedor }: { r: any; mostrarVendedor?: boolean }) {
    return (
      <Card className="p-4 hover:shadow-md transition-shadow cursor-pointer" onClick={() => navigate(`/rotas/${r.id}`)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <Route className="w-4 h-4 text-primary" />
              <div className="font-semibold capitalize">
                {format(parseISO(r.data_rota), "EEE, dd MMM yyyy", { locale: ptBR })}
              </div>
              <Badge variant={r.status === "realizada" ? "default" : "secondary"}>{r.status}</Badge>
            </div>
            {mostrarVendedor && (
              <div className="text-xs text-muted-foreground">
                Vendedor: {profileMap.get(r.vendedor_id) ?? r.vendedor_id.slice(0, 8)}
              </div>
            )}
            {r.observacoes && <div className="text-sm text-muted-foreground line-clamp-1 mt-1">{r.observacoes}</div>}
            {r.km_total_estimado != null && (
              <div className="text-xs text-muted-foreground mt-1">{Number(r.km_total_estimado).toFixed(1)} km estimados</div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={(e) => { e.stopPropagation(); if (confirm("Apagar rota?")) apagar.mutate(r.id); }}
          >
            <Trash2 className="w-4 h-4 text-destructive" />
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-4 h-4" /></Button>
            <h1 className="font-semibold">Rotas Comerciais</h1>
          </div>
          <div className="flex items-center gap-2">
            {isAdmin && (
              <Button variant="outline" onClick={() => geocodificar.mutate()} disabled={geocodificar.isPending}>
                {geocodificar.isPending ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Compass className="w-4 h-4 mr-1" />}
                Atualizar coordenadas
              </Button>
            )}
            <Button onClick={() => setNovoOpen(true)}><Plus className="w-4 h-4 mr-1" /> Nova Rota</Button>
            <AppHeader />
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6">
        <Tabs defaultValue="minhas">
          <TabsList>
            <TabsTrigger value="minhas">Minhas Rotas</TabsTrigger>
            {isAdmin && <TabsTrigger value="equipe">Rotas da Equipe</TabsTrigger>}
          </TabsList>

          <TabsContent value="minhas" className="mt-4 space-y-3">
            {minhas.length === 0 && (
              <Card className="p-8 text-center text-muted-foreground">
                <MapPin className="w-8 h-8 mx-auto mb-2 opacity-40" />
                Nenhuma rota planejada. Crie sua primeira rota.
              </Card>
            )}
            {minhas.map((r: any) => <RotaCard key={r.id} r={r} />)}
          </TabsContent>

          {isAdmin && (
            <TabsContent value="equipe" className="mt-4 space-y-3">
              <Card className="p-3 grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Vendedor</Label>
                  <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="todos">Todos</SelectItem>
                      {profiles.map((p) => <SelectItem key={p.user_id} value={p.user_id}>{p.nome || p.email}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">De</Label>
                  <Input type="date" value={inicio} onChange={(e) => setInicio(e.target.value)} />
                </div>
                <div>
                  <Label className="text-xs">Até</Label>
                  <Input type="date" value={fim} onChange={(e) => setFim(e.target.value)} />
                </div>
              </Card>
              {equipe.length === 0 && (
                <Card className="p-8 text-center text-muted-foreground">Nenhuma rota encontrada.</Card>
              )}
              {equipe.map((r: any) => <RotaCard key={r.id} r={r} mostrarVendedor />)}
            </TabsContent>
          )}
        </Tabs>
      </main>

      <Dialog open={novoOpen} onOpenChange={setNovoOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nova Rota</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Data da rota</Label>
              <Input type="date" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
            <div>
              <Label>Observações</Label>
              <Input value={obs} onChange={(e) => setObs(e.target.value)} placeholder="Opcional" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNovoOpen(false)}>Cancelar</Button>
            <Button onClick={() => criar.mutate()} disabled={criar.isPending}>Criar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
