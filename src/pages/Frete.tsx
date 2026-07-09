import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ArrowLeft, Loader2, Plus, Trash2, Truck } from "lucide-react";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";
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

const PRECO_COMBUSTIVEL = 7.25;
const CONSUMO = 2.5;

function getRotaPrincipal(api: any) {
  return api?.rotas?.[0] ?? api;
}

function extractValorRotasBrasil(api: any): number {
  const rota = getRotaPrincipal(api);
  const tabela = rota?.tabelaFrete ?? {};
  const frete = Number(
    tabela.geral ?? tabela.granelSolido ?? tabela.granelLiquido ?? 0,
  );
  const pedagio = Number(rota?.valorPedagio ?? 0);
  const distancia = Number(rota?.distancia ?? 0);
  const combustivelApi = Number(rota?.valorCombustivel);
  const combustivelCalculado = distancia > 0 ? (distancia / CONSUMO) * PRECO_COMBUSTIVEL : 0;
  const combustivel = Number.isFinite(combustivelApi) && combustivelApi > 0
    ? combustivelApi
    : combustivelCalculado;
  const total =
    (Number.isFinite(frete) ? frete : 0) +
    (Number.isFinite(pedagio) ? pedagio : 0) +
    (Number.isFinite(combustivel) ? combustivel : 0);
  return total > 0 ? total : 0;
}

type Ponto = { endereco: string; lat?: number; lng?: number };

export default function Frete() {
  const navigate = useNavigate();
  const [origem, setOrigem] = useState<Ponto>({ endereco: "Av. Marcelo Messias Busiquia, 197" });
  const [destino, setDestino] = useState<Ponto>({ endereco: "" });
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
    setApiRaw(null);
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

      setApiRaw(data);
      const rota = getRotaPrincipal(data);
      if (Number(rota?.distancia ?? 0) <= 0) {
        toast.error("A Rotas Brasil não conseguiu traçar essa rota. Tente usar endereços mais específicos, principalmente nas paradas intermediárias.");
        return;
      }

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
      const valorFinal = somaComSeguro;
      const acrescimoLucro = 0;

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
          <Button variant="ghost" size="icon" onClick={() => navigate(-1)} aria-label="Voltar">
            <ArrowLeft className="w-5 h-5" />
          </Button>
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
              Combustível fixo em R$ {PRECO_COMBUSTIVEL.toFixed(2).replace('.', ',')}/L e consumo {CONSUMO.toString().replace('.', ',')} km/L. Peça para alterar se precisar.
            </p>

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
              <Linha label="Quantidade de viagens" value={String(resultado.quantidadeViagens)} />

              <div className="mt-4 p-4 rounded-lg bg-primary/10 border border-primary/30 flex items-center justify-between">
                <span className="font-semibold text-primary">VALOR FINAL DO FRETE</span>
                <span className="text-2xl font-bold text-primary">{brl(resultado.valorFinal)}</span>
              </div>
            </CardContent>
          </Card>
        )}

        {apiRaw !== null && (
          <Card>
            <CardHeader>
              <CardTitle>Retorno cru da API Rotas Brasil</CardTitle>
            </CardHeader>
            <CardContent>
              <pre className="max-h-96 overflow-auto rounded-md bg-muted p-4 text-xs font-mono">
                {JSON.stringify(apiRaw, null, 2)}
              </pre>
            </CardContent>
          </Card>
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
