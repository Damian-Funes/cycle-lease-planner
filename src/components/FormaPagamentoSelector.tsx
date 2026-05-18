import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { Wallet, Check, AlertTriangle, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Forma {
  id: string;
  nome: string;
  descricao_proposta: string;
  ordem: number;
  desconto_padrao_pct: number | null;
}

interface Props {
  formaPagamentoId: string | null | undefined;
  legacyText?: string | null;
  onChange: (id: string | null) => void;
}

export default function FormaPagamentoSelector({ formaPagamentoId, legacyText, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [opcoes, setOpcoes] = useState<Forma[]>([]);
  const [selecionada, setSelecionada] = useState<Forma | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  // Buscar forma selecionada (para mostrar nome/descrição)
  useEffect(() => {
    if (!formaPagamentoId) { setSelecionada(null); return; }
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from("formas_pagamento")
        .select("id, nome, descricao_proposta, ordem, desconto_padrao_pct")
        .eq("id", formaPagamentoId)
        .maybeSingle();
      if (!cancelled && data) setSelecionada(data as Forma);
    })();
    return () => { cancelled = true; };
  }, [formaPagamentoId]);

  const abrirModal = async () => {
    setOpen(true);
    setPending(formaPagamentoId ?? null);
    setLoading(true);
    const { data, error } = await supabase
      .from("formas_pagamento")
      .select("id, nome, descricao_proposta, ordem, desconto_padrao_pct")
      .eq("ativo", true)
      .order("ordem", { ascending: true });
    setLoading(false);
    if (error) toast.error("Erro ao carregar formas: " + error.message);
    else setOpcoes((data || []) as Forma[]);
  };

  const confirmar = () => {
    if (!pending) return;
    onChange(pending);
    setOpen(false);
  };

  const temLegacy = !formaPagamentoId && !!(legacyText && legacyText.trim());

  return (
    <>
      <Card>
        <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base flex items-center gap-2">
            <Wallet className="w-4 h-4 text-primary" /> Forma de Pagamento
          </CardTitle>
          {(selecionada || temLegacy) && (
            <Button variant="outline" size="sm" onClick={abrirModal}>
              Trocar
            </Button>
          )}
        </CardHeader>
        <CardContent>
          {!selecionada && !temLegacy && (
            <Button variant="outline" onClick={abrirModal} className="w-full sm:w-auto">
              Selecionar forma de pagamento
            </Button>
          )}

          {selecionada && (
            <div className="flex gap-2">
              <Check className="w-4 h-4 text-emerald-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium">{selecionada.nome}</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                  {selecionada.descricao_proposta}
                </div>
              </div>
            </div>
          )}

          {!selecionada && temLegacy && (
            <div className="flex gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 mt-0.5 shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-amber-700">Forma legacy (texto livre)</div>
                <div className="text-sm text-muted-foreground whitespace-pre-wrap">{legacyText}</div>
                <div className="text-xs text-muted-foreground mt-2">
                  Clique em "Trocar" para migrar para uma das formas cadastradas.
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Forma de Pagamento</DialogTitle>
          </DialogHeader>

          {loading ? (
            <div className="flex justify-center py-10">
              <Loader2 className="w-6 h-6 animate-spin text-primary" />
            </div>
          ) : opcoes.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Nenhuma forma de pagamento cadastrada.
            </p>
          ) : (
            <div className="space-y-2 max-h-[60vh] overflow-y-auto pr-1">
              {opcoes.map((f) => {
                const ativo = pending === f.id;
                return (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setPending(f.id)}
                    className={cn(
                      "w-full text-left rounded-lg border p-3 transition-colors",
                      "hover:bg-muted/50",
                      ativo ? "border-primary bg-primary/5 ring-1 ring-primary" : "border-border"
                    )}
                  >
                    <div className="flex gap-3">
                      <div className={cn(
                        "mt-1 w-4 h-4 rounded-full border-2 shrink-0 flex items-center justify-center",
                        ativo ? "border-primary" : "border-muted-foreground/40"
                      )}>
                        {ativo && <div className="w-2 h-2 rounded-full bg-primary" />}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium">{f.nome}</div>
                        <div className="text-sm text-muted-foreground whitespace-pre-wrap">
                          {f.descricao_proposta}
                        </div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button onClick={confirmar} disabled={!pending}>Confirmar seleção</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
