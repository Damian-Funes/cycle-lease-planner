import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { listVeiculos, getViagemParametros, type Veiculo } from "@/lib/rotas";
import { parseValorBR } from "@/lib/viagem";
import AppHeader from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, Plus, Save } from "lucide-react";
import { toast } from "sonner";

type Linha = Omit<Veiculo, "consumo_km_l" | "base_lat" | "base_lng"> & { consumo: string; lat: string; lng: string; novo?: boolean };
const coord = (s: string) => (s.trim() === "" ? null : Number(s.trim().replace(",", ".")));
const fmt = (n: number | null | undefined) => (n == null ? "" : String(n).replace(".", ","));

export default function ConfiguracoesViagens() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: veiculos } = useQuery({ queryKey: ["veiculos"], queryFn: listVeiculos });
  const { data: parametros } = useQuery({ queryKey: ["viagem-parametros"], queryFn: getViagemParametros });
  const { data: vendedores = [] } = useQuery({
    queryKey: ["profiles-lite-viagens"],
    queryFn: async () => (await supabase.from("profiles").select("user_id, nome, email").eq("status", "approved").order("nome")).data ?? [],
  });
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [diesel, setDiesel] = useState("");
  const [gasolina, setGasolina] = useState("");
  const [salvando, setSalvando] = useState(false);

  useEffect(() => { if (veiculos) setLinhas(veiculos.map((v) => ({ ...v, consumo: fmt(v.consumo_km_l), lat: fmt(v.base_lat), lng: fmt(v.base_lng) }))); }, [veiculos]);
  useEffect(() => { if (parametros) { setDiesel(fmt(parametros.preco_diesel)); setGasolina(fmt(parametros.preco_gasolina)); } }, [parametros]);

  const upd = (id: string, v: Partial<Linha>) => setLinhas((ls) => ls.map((l) => (l.id === id ? { ...l, ...v } : l)));

  async function salvar() {
    const d = parseValorBR(diesel); const g = parseValorBR(gasolina);
    if (!(d > 0) || !(g > 0)) { toast.error("Informe o preço do diesel e da gasolina"); return; }
    for (const l of linhas) {
      if (!l.modelo.trim()) { toast.error("Informe o modelo de todos os veículos"); return; }
      if (!(parseValorBR(l.consumo) > 0)) { toast.error(`Consumo inválido em ${l.modelo}`); return; }
      const la = coord(l.lat), ln = coord(l.lng);
      if ((la == null) !== (ln == null) || (la != null && !(Math.abs(la) <= 90 && Math.abs(ln!) <= 180))) { toast.error(`Base de saída inválida em ${l.modelo} (informe latitude e longitude)`); return; }
    }
    setSalvando(true);
    try {
      const p = await (supabase as any).from("viagem_parametros").update({ preco_diesel: d, preco_gasolina: g }).eq("id", "padrao");
      if (p.error) throw p.error;
      for (const l of linhas) {
        const row = { modelo: l.modelo.trim(), combustivel: l.combustivel, consumo_km_l: parseValorBR(l.consumo), placa: l.placa?.trim() || null, vendedor_id: l.vendedor_id || null, ativo: l.ativo, base_nome: l.base_nome?.trim() || null, base_lat: coord(l.lat), base_lng: coord(l.lng) };
        const r = l.novo ? await (supabase as any).from("veiculos").insert(row) : await (supabase as any).from("veiculos").update(row).eq("id", l.id);
        if (r.error) throw r.error;
      }
      await qc.invalidateQueries({ queryKey: ["veiculos"] });
      await qc.invalidateQueries({ queryKey: ["viagem-parametros"] });
      toast.success("Configurações de viagem salvas");
    } catch (e) { toast.error((e as Error).message); } finally { setSalvando(false); }
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b"><div className="max-w-5xl mx-auto px-4 py-3 flex justify-between"><Button variant="ghost" onClick={() => navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2" />Voltar</Button><AppHeader /></div></header>
      <main className="max-w-5xl mx-auto px-4 py-8 space-y-6">
        <div className="flex items-center justify-between gap-3">
          <h1 className="text-2xl font-bold">Configurações de Viagens</h1>
          <Button onClick={salvar} disabled={salvando}><Save className="w-4 h-4 mr-1" />Salvar</Button>
        </div>
        <Card className="p-4 space-y-3">
          <h2 className="font-semibold">Preço do combustível</h2>
          <div className="grid grid-cols-2 gap-3 max-w-md">
            <div><Label htmlFor="preco-diesel">Diesel (R$/L)</Label><Input id="preco-diesel" inputMode="decimal" value={diesel} onChange={(e) => setDiesel(e.target.value)} /></div>
            <div><Label htmlFor="preco-gasolina">Gasolina (R$/L)</Label><Input id="preco-gasolina" inputMode="decimal" value={gasolina} onChange={(e) => setGasolina(e.target.value)} /></div>
          </div>
        </Card>
        <Card className="p-4 space-y-3">
          <div className="flex items-center justify-between"><h2 className="font-semibold">Veículos</h2>
            <Button size="sm" variant="outline" onClick={() => setLinhas((ls) => [...ls, { id: crypto.randomUUID(), modelo: "", combustivel: "diesel", consumo: "", placa: null, vendedor_id: null, ativo: true, base_nome: null, lat: "", lng: "", novo: true }])}><Plus className="w-4 h-4 mr-1" />Adicionar veículo</Button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="text-left border-b"><th className="p-2">Modelo</th><th>Combustível</th><th>Consumo (km/L)</th><th>Placa</th><th>Vendedor</th><th>Base de saída (cidade · lat · lng)</th><th>Ativo</th></tr></thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className="border-b">
                    <td className="p-2"><Input aria-label="Modelo" value={l.modelo} onChange={(e) => upd(l.id, { modelo: e.target.value })} /></td>
                    <td><select aria-label="Combustível" className="h-10 rounded-md border border-input bg-background px-2" value={l.combustivel} onChange={(e) => upd(l.id, { combustivel: e.target.value as Linha["combustivel"] })}><option value="diesel">Diesel</option><option value="gasolina">Gasolina</option></select></td>
                    <td><Input aria-label="Consumo" inputMode="decimal" className="w-24" value={l.consumo} onChange={(e) => upd(l.id, { consumo: e.target.value })} /></td>
                    <td><Input aria-label="Placa" className="w-28" value={l.placa ?? ""} onChange={(e) => upd(l.id, { placa: e.target.value })} /></td>
                    <td><select aria-label="Vendedor" className="h-10 rounded-md border border-input bg-background px-2 max-w-48" value={l.vendedor_id ?? ""} onChange={(e) => upd(l.id, { vendedor_id: e.target.value || null })}>
                      <option value="">—</option>{vendedores.map((v: any) => <option key={v.user_id} value={v.user_id}>{v.nome || v.email}</option>)}
                    </select></td>
                    <td><div className="flex gap-1"><Input aria-label="Base de saída" placeholder="Maringá - PR" className="w-32" value={l.base_nome ?? ""} onChange={(e) => upd(l.id, { base_nome: e.target.value })} /><Input aria-label="Latitude da base" inputMode="decimal" placeholder="-23,4253" className="w-24" value={l.lat} onChange={(e) => upd(l.id, { lat: e.target.value })} /><Input aria-label="Longitude da base" inputMode="decimal" placeholder="-51,9386" className="w-24" value={l.lng} onChange={(e) => upd(l.id, { lng: e.target.value })} /></div></td>
                    <td><Switch aria-label="Ativo" checked={l.ativo} onCheckedChange={(c) => upd(l.id, { ativo: c })} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      </main>
    </div>
  );
}
