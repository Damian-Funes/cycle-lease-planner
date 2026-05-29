import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Loader2, Plus, Trash2, Calculator } from "lucide-react";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const ORIGEM_PADRAO =
  "LS do Brasil - Av. Marcelo Messias Busiquia, 197 - Parque Industrial II, 87065-006 - Maringá, PR";
const PRECO_COMBUSTIVEL = 7.25;
const CONSUMO = 2.5;

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Ponto = { endereco: string; lat?: number; lng?: number };

type Resultado = {
  custoPorViagem: number;
  quantidadeViagens: number;
  custoViagens: number;
  comissao: number;
  subtotal: number;
  acrescimoSeguro: number;
  valorFinal: number;
};

function getRotaPrincipal(api: any) {
  return api?.rotas?.[0] ?? api;
}

function extractValorRotasBrasil(api: any): number {
  const rota = getRotaPrincipal(api);
  const tabela = rota?.tabelaFrete ?? {};
  const frete = Number(tabela.geral ?? tabela.granelSolido ?? tabela.granelLiquido ?? 0);
  const pedagio = Number(rota?.valorPedagio ?? 0);
  const distancia = Number(rota?.distancia ?? 0);
  const combustivelApi = Number(rota?.valorCombustivel);
  const combustivelCalculado = distancia > 0 ? (distancia / CONSUMO) * PRECO_COMBUSTIVEL : 0;
  const combustivel =
    Number.isFinite(combustivelApi) && combustivelApi > 0 ? combustivelApi : combustivelCalculado;
  const total =
    (Number.isFinite(frete) ? frete : 0) +
    (Number.isFinite(pedagio) ? pedagio : 0) +
    (Number.isFinite(combustivel) ? combustivel : 0);
  return total > 0 ? total : 0;
}

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onConfirm: (valor: number) => void;
  destinoInicial?: string;
}

export default function FreteCalculatorModal({ open, onOpenChange, onConfirm, destinoInicial }: Props) {
  const [origem, setOrigem] = useState<Ponto>({ endereco: ORIGEM_PADRAO });
  const [destino, setDestino] = useState<Ponto>({ endereco: destinoInicial || "" });
  const [paradas, setParadas] = useState<Ponto[]>([]);
  const [viagens, setViagens] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);

  const addParada = () => setParadas((p) => [...p, { endereco: "" }]);
  const updParada = (i: number, endereco: string, coords?: { lat: number; lng: number }) =>
    setParadas((p) => p.map((x, idx) => (idx === i ? { endereco, lat: coords?.lat, lng: coords?.lng } : x)));
  const rmParada = (i: number) => setParadas((p) => p.filter((_, idx) => idx !== i));

  async function calcular() {
    if (!origem.endereco.trim() || !destino.endereco.trim()) {
      toast.error("Informe origem e destino.");
      return;
    }
    if (!viagens || viagens < 1) {
      toast.error("Quantidade de viagens deve ser ≥ 1.");
      return;
    }
    setLoading(true);
    setResultado(null);
    try {
      const pontos = [origem, ...paradas.filter((p) => p.endereco.trim()), destino].map((p) => ({
        endereco: p.endereco.trim(),
        lat: p.lat,
        lng: p.lng,
      }));
      const { data, error } = await supabase.functions.invoke("rotas-brasil-frete", {
        body: { pontos, eixo: 6, precoCombustivel: PRECO_COMBUSTIVEL, consumo: CONSUMO },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      const rota = getRotaPrincipal(data);
      if (Number(rota?.distancia ?? 0) <= 0) {
        toast.error("A Rotas Brasil não conseguiu traçar essa rota. Use endereços mais específicos.");
        return;
      }

      const valorViagem = extractValorRotasBrasil(data);
      if (!valorViagem) {
        toast.error("Não foi possível extrair o valor da viagem.");
        return;
      }

      const custoPorViagem = valorViagem + 1500; // comissão embutida (não exibida)
      const custoViagens = custoPorViagem * viagens;
      const comissao = 0;
      const subtotal = custoViagens;
      const valorFinal = subtotal * 1.5;
      const acrescimoSeguro = valorFinal - subtotal;

      setResultado({
        custoPorViagem,
        quantidadeViagens: viagens,
        custoViagens,
        comissao,
        subtotal,
        acrescimoSeguro,
        valorFinal,
      });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao calcular frete.");
    } finally {
      setLoading(false);
    }
  }

  function aplicar() {
    if (!resultado) return;
    onConfirm(resultado.valorFinal);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Calculator className="w-5 h-5 text-primary" /> Calcular frete
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Origem</Label>
            <AddressAutocomplete
              value={origem.endereco}
              onChange={(endereco, coords) => setOrigem({ endereco, lat: coords?.lat, lng: coords?.lng })}
              placeholder="Origem"
            />
          </div>
          <div>
            <Label>Destino</Label>
            <AddressAutocomplete
              value={destino.endereco}
              onChange={(endereco, coords) => setDestino({ endereco, lat: coords?.lat, lng: coords?.lng })}
              placeholder="Ex: Curitiba, PR"
            />
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Paradas intermediárias (opcional)</Label>
              <Button type="button" variant="outline" size="sm" onClick={addParada}>
                <Plus className="w-4 h-4 mr-1" /> Adicionar
              </Button>
            </div>
            {paradas.map((p, i) => (
              <div key={i} className="flex gap-2">
                <div className="flex-1">
                  <AddressAutocomplete
                    value={p.endereco}
                    onChange={(v, coords) => updParada(i, v, coords)}
                    placeholder={`Parada ${i + 1}`}
                  />
                </div>
                <Button type="button" variant="ghost" size="icon" onClick={() => rmParada(i)}>
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
          </div>

          <div>
            <Label>Quantidade de viagens</Label>
            <Input
              type="number"
              min={1}
              value={viagens}
              onChange={(e) => setViagens(Math.max(1, Number(e.target.value) || 1))}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Combustível R$ {PRECO_COMBUSTIVEL.toFixed(2).replace(".", ",")}/L · Consumo{" "}
            {CONSUMO.toString().replace(".", ",")} km/L · Caminhão 6 eixos.
          </p>

          <Button onClick={calcular} disabled={loading} className="w-full">
            {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Calcular
          </Button>

          {resultado && (
            <div className="rounded-lg border p-4 space-y-2 bg-muted/30">
              <Linha label="Custo por viagem" value={brl(resultado.custoPorViagem)} />
              <Linha label="Quantidade de viagens" value={String(resultado.quantidadeViagens)} />
              <Linha label="Subtotal" value={brl(resultado.subtotal)} bold />
              <Linha label="Acréscimo 50% (seguro)" value={brl(resultado.acrescimoSeguro)} />
              <div className="mt-3 p-3 rounded-md bg-primary/10 border border-primary/30 flex items-center justify-between">
                <span className="font-semibold text-primary">VALOR FINAL</span>
                <span className="text-xl font-bold text-primary">{brl(resultado.valorFinal)}</span>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={aplicar} disabled={!resultado}>
            Aplicar ao orçamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Linha({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between text-sm ${bold ? "font-semibold" : ""}`}>
      <span>{label}</span>
      <span>{value}</span>
    </div>
  );
}
