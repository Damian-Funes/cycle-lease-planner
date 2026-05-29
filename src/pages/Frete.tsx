import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import AddressAutocomplete from "@/components/AddressAutocomplete";

const brl = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type Resultado = {
  custoPorViagem: number;
  quantidadeViagens: number;
  custoViagens: number;
  comissao: number;
  subtotal: number;
  acrescimoSeguro: number;
  somaComSeguro: number;
  acrescimoLucro: number;
  valorFinal: number;
};

function extractValorRotasBrasil(api: any): number {
  const rota = api?.rotas?.[0] ?? api;
  const tabela = rota?.tabelaFrete ?? {};
  const frete = Number(
    tabela.geral ?? tabela.granelSolido ?? tabela.granelLiquido ?? 0,
  );
  const pedagio = Number(rota?.valorPedagio ?? 0);
  const combustivel = Number(rota?.valorCombustivel);
  const total =
    (Number.isFinite(frete) ? frete : 0) +
    (Number.isFinite(pedagio) ? pedagio : 0) +
    (Number.isFinite(combustivel) ? combustivel : 0);
  return total > 0 ? total : 0;
}

type Ponto = { endereco: string; lat?: number; lng?: number };

export default function Frete() {
  const [origem, setOrigem] = useState<Ponto>({ endereco: "Av. Marcelo Messias Busiquia, 197" });
  const [destino, setDestino] = useState<Ponto>({ endereco: "" });
  const [paradas, setParadas] = useState<Ponto[]>([]);
  const [viagens, setViagens] = useState<number>(1);
  // Valores fixos (combinados com o usuário). Para alterar, edite aqui.
  const PRECO_COMBUSTIVEL = 7.25; // R$/L
  const CONSUMO = 2.5; // km/L
  const [loading, setLoading] = useState(false);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [apiRaw, setApiRaw] = useState<any>(null);

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
    setApiRaw(null);
    try {
      const pontos = [origem, ...paradas.filter((p) => p.endereco.trim()), destino].map((p) => ({
        endereco: p.endereco.trim(),
        lat: p.lat,
        lng: p.lng,
      }));
      const { data, error } = await supabase.functions.invoke("rotas-brasil-frete", {
        body: { pontos, eixo: 2, precoCombustivel: PRECO_COMBUSTIVEL, consumo: CONSUMO },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);

      setApiRaw(data);
      const valorViagem = extractValorRotasBrasil(data);
      if (!valorViagem) {
        toast.error("Não foi possível extrair o valor da viagem do retorno da API.");
        return;
      }

      const custoViagens = valorViagem * viagens;
      const comissao = 1500 * viagens;
      const subtotal = custoViagens + comissao;
      const somaComSeguro = subtotal * 1.5;
      const acrescimoSeguro = somaComSeguro - subtotal;
      const valorFinal = somaComSeguro * 1.2;
      const acrescimoLucro = valorFinal - somaComSeguro;

      setResultado({
        custoPorViagem: valorViagem,
        quantidadeViagens: viagens,
        custoViagens,
        comissao,
        subtotal,
        acrescimoSeguro,
        somaComSeguro,
        acrescimoLucro,
        valorFinal,
      });
    } catch (e: any) {
      toast.error(e?.message || "Falha ao calcular frete.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-muted/30 py-8 px-4">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center gap-2">
          <Truck className="text-primary" />
          <h1 className="text-2xl font-bold">Calculadora de Frete</h1>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Dados da rota</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <Label>Origem</Label>
                <AddressAutocomplete
                  value={origem.endereco}
                  onChange={(endereco, coords) => setOrigem({ endereco, lat: coords?.lat, lng: coords?.lng })}
                  placeholder="Ex: Av. Marcelo Messias Busiquia, 197"
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

            <div className="grid sm:grid-cols-3 gap-4">
              <div>
                <Label>Quantidade de viagens</Label>
                <Input
                  type="number"
                  min={1}
                  value={viagens}
                  onChange={(e) => setViagens(Math.max(1, Number(e.target.value) || 1))}
                />
              </div>
              <div>
                <Label>Preço combustível (R$/L)</Label>
                <Input
                  type="number"
                  step="0.01"
                  min={0}
                  value={precoCombustivel}
                  onChange={(e) => setPrecoCombustivel(Number(e.target.value) || 0)}
                />
              </div>
              <div>
                <Label>Consumo (km/L)</Label>
                <Input
                  type="number"
                  step="0.1"
                  min={0}
                  value={consumo}
                  onChange={(e) => setConsumo(Number(e.target.value) || 0)}
                />
              </div>
            </div>

            <Button onClick={calcular} disabled={loading} className="w-full">
              {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Calcular frete
            </Button>
            <p className="text-xs text-muted-foreground">
              Cada consulta consome 1 crédito da sua conta no Rotas Brasil.
            </p>
          </CardContent>
        </Card>

        {resultado && (
          <Card>
            <CardHeader>
              <CardTitle>Resultado</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <Linha label="Custo por viagem (Rotas Brasil)" value={brl(resultado.custoPorViagem)} />
              <Linha label="Quantidade de viagens" value={String(resultado.quantidadeViagens)} />
              <Linha label="Custo total das viagens" value={brl(resultado.custoViagens)} />
              <Linha label="Comissão do motorista (R$ 1.500 × viagens)" value={brl(resultado.comissao)} />
              <Linha label="Subtotal" value={brl(resultado.subtotal)} bold />
              <Linha label="Acréscimo 50% (seguro + margem)" value={brl(resultado.acrescimoSeguro)} />
              <Linha label="Acréscimo 20% (lucro empresa)" value={brl(resultado.acrescimoLucro)} />
              <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
                <span className="font-semibold text-primary">VALOR FINAL DO FRETE</span>
                <span className="text-2xl font-bold text-primary">{brl(resultado.valorFinal)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {apiRaw && (
          <details className="text-xs">
            <summary className="cursor-pointer text-muted-foreground">Ver retorno bruto da API</summary>
            <pre className="mt-2 p-3 bg-muted rounded overflow-auto max-h-72">{JSON.stringify(apiRaw, null, 2)}</pre>
          </details>
        )}
      </div>
    </div>
  );
}

function Linha({ label, value, bold }: { label: string; value: string; bold?: boolean }) {
  return (
    <div className={`flex items-center justify-between py-1 ${bold ? "font-semibold" : ""}`}>
      <span className="text-sm">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}
