import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { ArrowLeft, Loader2 } from "lucide-react";
import AppHeader from "@/components/AppHeader";

function formatBR(n: number | null | undefined) {
  if (n === null || n === undefined || isNaN(Number(n))) return "";
  return Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function parseBR(s: string): number {
  if (!s) return 0;
  const clean = s.replace(/\./g, "").replace(",", ".").replace(/[^\d.-]/g, "");
  const n = parseFloat(clean);
  return isNaN(n) ? 0 : n;
}

function maskCurrencyDigits(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (!digits) return "";
  const n = parseInt(digits, 10) / 100;
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const CurrencyInput = ({
  value, onChange, suffix,
}: { value: string; onChange: (v: string) => void; suffix: string }) => (
  <div className="flex items-stretch rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring">
    <span className="px-3 flex items-center bg-muted text-muted-foreground text-sm">R$</span>
    <Input
      className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
      value={value}
      inputMode="numeric"
      onChange={(e) => onChange(maskCurrencyDigits(e.target.value))}
      placeholder="0,00"
    />
    <span className="px-3 flex items-center bg-muted text-muted-foreground text-xs whitespace-nowrap">
      {suffix}
    </span>
  </div>
);

interface ConfigRow {
  id: string;
  valor_dia_colaborador: number;
  valor_km: number;
  diaria_hospedagem: number;
  diaria_alimentacao: number;
  cidade_origem: string;
  margem_percentual: number;
}

function maskPercent(raw: string): string {
  let s = raw.replace(/[^\d,]/g, "");
  const firstComma = s.indexOf(",");
  if (firstComma !== -1) {
    s = s.slice(0, firstComma + 1) + s.slice(firstComma + 1).replace(/,/g, "");
    const [int, dec = ""] = s.split(",");
    s = int + "," + dec.slice(0, 2);
  }
  const [intPart, decPart] = s.split(",");
  let intNum = parseInt(intPart || "0", 10);
  if (isNaN(intNum)) intNum = 0;
  if (intNum > 999) intNum = 999;
  return decPart !== undefined ? `${intNum},${decPart}` : String(intNum);
}

export default function ConfiguracoesMontagem() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [id, setId] = useState<string | null>(null);
  const [valorDia, setValorDia] = useState("");
  const [valorKm, setValorKm] = useState("");
  const [diariaHosp, setDiariaHosp] = useState("");
  const [diariaAlim, setDiariaAlim] = useState("");
  const [cidade, setCidade] = useState("Maringá");
  const [margem, setMargem] = useState("107");

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("config_montagem" as any)
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) {
        toast.error("Erro ao carregar configurações");
      } else if (data) {
        const r = data as unknown as ConfigRow;
        setId(r.id);
        setValorDia(formatBR(r.valor_dia_colaborador));
        setValorKm(formatBR(r.valor_km));
        setDiariaHosp(formatBR(r.diaria_hospedagem));
        setDiariaAlim(formatBR(r.diaria_alimentacao));
        setCidade(r.cidade_origem || "Maringá");
        setMargem(formatBR(r.margem_percentual ?? 107));
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!id) {
      toast.error("Nenhuma configuração para atualizar");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("config_montagem" as any)
      .update({
        valor_dia_colaborador: parseBR(valorDia),
        valor_km: parseBR(valorKm),
        diaria_hospedagem: parseBR(diariaHosp),
        diaria_alimentacao: parseBR(diariaAlim),
        cidade_origem: cidade,
        margem_percentual: Math.min(999, Math.max(0, parseBR(margem))),
        updated_at: new Date().toISOString(),
        updated_by: user?.id ?? null,
      })
      .eq("id", id);
    setSaving(false);
    if (error) toast.error("Erro ao salvar: " + error.message);
    else toast.success("Configurações salvas");
  };




  return (
    <div className="min-h-screen bg-muted/20">
      <header className="bg-background border-b">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="gap-2">
            <ArrowLeft className="w-4 h-4" /> Voltar
          </Button>
          <AppHeader />
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-8">
        <h1 className="text-2xl font-bold mb-1">Configurações de Montagem</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Parâmetros usados nos cálculos de custo de montagem.
        </p>

        {loading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <Card className="p-6 space-y-5">
            <div className="space-y-2">
              <Label>Valor por dia trabalhado</Label>
              <CurrencyInput value={valorDia} onChange={setValorDia} suffix="por colaborador" />
            </div>

            <div className="space-y-2">
              <Label>Valor por km rodado</Label>
              <CurrencyInput value={valorKm} onChange={setValorKm} suffix="por km" />
            </div>

            <div className="space-y-2">
              <Label>Diária de hospedagem</Label>
              <CurrencyInput value={diariaHosp} onChange={setDiariaHosp} suffix="por colaborador/dia" />
            </div>

            <div className="space-y-2">
              <Label>Diária de alimentação</Label>
              <CurrencyInput value={diariaAlim} onChange={setDiariaAlim} suffix="por colaborador/dia" />
            </div>

            <div className="space-y-2">
              <Label>Cidade de origem da equipe</Label>
              <Input value={cidade} onChange={(e) => setCidade(e.target.value)} placeholder="Maringá" />
            </div>

            <div className="space-y-2">
              <Label>Margem comercial (markup)</Label>
              <p className="text-xs text-muted-foreground">
                Markup aplicado sobre o custo total da montagem. Exemplo: 107% significa que o preço final ao cliente = custo × 2,07
              </p>
              <div className="flex items-stretch rounded-md border border-input overflow-hidden focus-within:ring-2 focus-within:ring-ring">
                <Input
                  className="border-0 rounded-none focus-visible:ring-0 focus-visible:ring-offset-0"
                  value={margem}
                  inputMode="decimal"
                  onChange={(e) => setMargem(maskPercent(e.target.value))}
                  placeholder="107"
                />
                <span className="px-3 flex items-center bg-muted text-muted-foreground text-sm">%</span>
              </div>
            </div>

            <div className="pt-2 flex justify-end">
              <Button onClick={handleSave} disabled={saving} className="gap-2">
                {saving && <Loader2 className="w-4 h-4 animate-spin" />}
                Salvar alterações
              </Button>
            </div>
          </Card>
        )}
      </main>
    </div>
  );
}
