import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Library, Plus, Star, Archive, ArchiveRestore, Pencil, ArrowLeft, Loader2, Sparkles } from "lucide-react";
import AppHeader from "@/components/AppHeader";
import TipicoFormModal from "@/components/TipicoFormModal";
import { useTipicos, useUpdateTipico } from "@/hooks/useTipicos";
import { Tipico, TipicoTipo, formatSacosAno } from "@/lib/tipicos";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

function formatBRL(v: number) {
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export default function Tipicos() {
  const navigate = useNavigate();
  const { isAdmin } = useAuth();
  const [tipo, setTipo] = useState<TipicoTipo | "todos">("todos");
  const [busca, setBusca] = useState("");
  const [incluirArquivados, setIncluirArquivados] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editando, setEditando] = useState<Tipico | null>(null);

  const { data: tipicos = [], isLoading } = useTipicos({ tipo, busca, incluirArquivados: isAdmin && incluirArquivados });
  const update = useUpdateTipico();

  function handleUsar(t: Tipico) {
    const rota = t.tipo === "aluguel" ? "/smartcycle" : "/orcamento";
    navigate(`${rota}?tipico=${t.id}&novo=1`);
  }

  async function handleArquivar(t: Tipico) {
    try {
      await update.mutateAsync({ id: t.id, patch: { arquivado: !t.arquivado } });
      toast.success(t.arquivado ? "Típico desarquivado" : "Típico arquivado");
    } catch (e: any) {
      toast.error(e.message ?? "Erro");
    }
  }

  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => navigate("/")}><ArrowLeft className="w-4 h-4" /></Button>
            <div className="w-8 h-8 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <Library className="w-4 h-4" />
            </div>
            <div>
              <div className="font-semibold leading-tight">Biblioteca de Típicos</div>
              <div className="text-xs text-muted-foreground leading-tight">Templates pré-configurados</div>
            </div>
          </div>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-6 space-y-4">
        <div className="flex flex-wrap items-end gap-3 justify-between">
          <div className="flex flex-wrap items-end gap-3 flex-1">
            <Input
              placeholder="Buscar por nome, descrição ou código..."
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              className="max-w-sm"
            />
            <Tabs value={tipo} onValueChange={(v) => setTipo(v as any)}>
              <TabsList>
                <TabsTrigger value="todos">Todos</TabsTrigger>
                <TabsTrigger value="orcamento">Orçamento</TabsTrigger>
                <TabsTrigger value="aluguel">Aluguel</TabsTrigger>
              </TabsList>
            </Tabs>
            {isAdmin && (
              <div className="flex items-center gap-2">
                <Switch id="arq" checked={incluirArquivados} onCheckedChange={setIncluirArquivados} />
                <Label htmlFor="arq" className="cursor-pointer text-sm">Mostrar arquivados</Label>
              </div>
            )}
          </div>
          {isAdmin && (
            <Button onClick={() => { setEditando(null); setModalOpen(true); }} className="gap-1">
              <Plus className="w-4 h-4" /> Novo típico
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-primary" /></div>
        ) : tipicos.length === 0 ? (
          <Card><CardContent className="py-12 text-center text-muted-foreground">
            Nenhum típico cadastrado{busca || tipo !== "todos" ? " com esses filtros" : ""}.
          </CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {tipicos.map((t) => (
              <Card key={t.id} className={`relative transition-all hover:shadow-md ${t.arquivado ? "opacity-60" : ""} ${t.destacado ? "border-primary/50 ring-1 ring-primary/20" : ""}`}>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5">
                        {t.destacado && <Sparkles className="w-3.5 h-3.5 text-primary shrink-0" />}
                        <h3 className="font-semibold leading-tight truncate">{t.nome}</h3>
                      </div>
                      {t.descricao && <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.descricao}</p>}
                    </div>
                    <Badge variant={t.tipo === "aluguel" ? "default" : "secondary"} className="shrink-0 text-xs">
                      {t.tipo === "aluguel" ? "Aluguel" : "Orçamento"}
                    </Badge>
                  </div>

                  <div className="text-sm">
                    <div className="text-xs text-muted-foreground">Valor de referência</div>
                    <div className="font-semibold text-primary">{formatBRL(t.valor_referencia)}</div>
                  </div>

                  <div>
                    <div className="text-xs text-muted-foreground mb-1">{t.itens.length} equipamento(s)</div>
                    <div className="flex flex-wrap gap-1">
                      {t.itens.slice(0, 4).map((i, idx) => (
                        <Badge key={`${i.codigo}-${idx}`} variant="outline" className="text-[10px] font-mono">
                          {i.codigo}<span className="ml-1 opacity-60">×{i.quantidade}</span>
                        </Badge>
                      ))}
                      {t.itens.length > 4 && <Badge variant="outline" className="text-[10px]">+{t.itens.length - 4}</Badge>}
                    </div>
                  </div>

                  <div className="flex gap-1.5 pt-1">
                    <Button size="sm" className="flex-1" onClick={() => handleUsar(t)} disabled={t.arquivado}>
                      Usar este típico
                    </Button>
                    {isAdmin && (
                      <>
                        <Button size="sm" variant="outline" onClick={() => { setEditando(t); setModalOpen(true); }}>
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => handleArquivar(t)}>
                          {t.arquivado ? <ArchiveRestore className="w-3.5 h-3.5" /> : <Archive className="w-3.5 h-3.5" />}
                        </Button>
                      </>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </main>

      <TipicoFormModal open={modalOpen} onOpenChange={setModalOpen} tipico={editando} />
    </div>
  );
}
