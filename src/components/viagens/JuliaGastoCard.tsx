import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';

type Bloco = { qtd: number; segundos: number; creditos: number | null; sem_duracao?: number };
type Config = { max_recusadas_dia: number; max_minutos_recusadas_dia: number; reais_por_credito: number | null; reais_por_minuto: number | null };
type Resumo = {
  config: Config;
  recusadas: Record<'hoje' | 'd7' | 'd30', Bloco>;
  ligacoes: (Bloco & { periodo: 'hoje' | 'd7' | 'd30'; grupo: string })[];
  top_numeros: { numero: string; qtd: number; segundos: number; ultima: string }[];
};
const PERIODOS = [['hoje', 'Hoje'], ['d7', '7 dias'], ['d30', '30 dias']] as const;
const min = (s: number) => (s / 60).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const brl = (v: number) => v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
// Tabelas/funções novas só entram nos tipos gerados após a SQL.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

function custo(b: Bloco | undefined, c: Config) {
  if (!b) return '—';
  if (b.creditos != null && c.reais_por_credito != null) return brl(b.creditos * c.reais_por_credito);
  if (c.reais_por_minuto != null) return `${brl((b.segundos / 60) * c.reais_por_minuto)} (estimado)`;
  return 'defina o preço';
}
const somar = (xs: Bloco[]): Bloco => ({ qtd: xs.reduce((a, x) => a + x.qtd, 0), segundos: xs.reduce((a, x) => a + x.segundos, 0), creditos: xs.every(x => x.creditos != null) && xs.length ? xs.reduce((a, x) => a + (x.creditos ?? 0), 0) : null });

export default function JuliaGastoCard() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['julia-gasto'], retry: false, refetchInterval: 120000, queryFn: async () => { const r = await sb.rpc('fn_julia_gasto_resumo'); if (r.error) throw r.error; return r.data as Resumo; } });
  const [cfg, setCfg] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (q.data?.config) { const c = q.data.config; setCfg({ max_recusadas_dia: String(c.max_recusadas_dia), max_minutos_recusadas_dia: String(c.max_minutos_recusadas_dia), reais_por_credito: c.reais_por_credito == null ? '' : String(c.reais_por_credito).replace('.', ','), reais_por_minuto: c.reais_por_minuto == null ? '' : String(c.reais_por_minuto).replace('.', ',') }); } }, [q.data]);

  if (q.isPending) return <Card className="p-4"><p role="status" className="text-sm text-muted-foreground">Carregando gasto da Júlia…</p></Card>;
  if (q.error || !q.data) return <Card className="p-4 space-y-1"><h2 className="font-semibold">Gasto da Júlia</h2><p className="text-sm text-muted-foreground">O painel de gasto ainda não foi ativado no banco.</p></Card>;
  const d = q.data; const c = d.config;
  const grupos = (p: string, f: (g: string) => boolean) => somar(d.ligacoes.filter(l => l.periodo === p && f(l.grupo)));
  const salvar = async () => {
    const n = (v: string) => v.trim() === '' ? null : Number(v.replace(/\./g, '').replace(',', '.'));
    const novo = { max_recusadas_dia: n(cfg.max_recusadas_dia), max_minutos_recusadas_dia: n(cfg.max_minutos_recusadas_dia), reais_por_credito: n(cfg.reais_por_credito), reais_por_minuto: n(cfg.reais_por_minuto) };
    if (!novo.max_recusadas_dia || novo.max_recusadas_dia < 1 || !novo.max_minutos_recusadas_dia || novo.max_minutos_recusadas_dia <= 0 || [novo.reais_por_credito, novo.reais_por_minuto].some(v => v != null && (!Number.isFinite(v) || v < 0))) { toast.error('Valores inválidos'); return; }
    setBusy(true);
    try { const r = await sb.from('julia_gasto_config').update({ ...novo, updated_at: new Date().toISOString() }).eq('id', 1); if (r.error) throw r.error; toast.success('Limites salvos'); qc.invalidateQueries({ queryKey: ['julia-gasto'] }); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  };
  return <Card className="p-4 space-y-4">
    <h2 className="font-semibold">Gasto da Júlia</h2>
    <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-left text-muted-foreground"><th className="py-1">Ligações</th>{PERIODOS.map(([, t]) => <th key={t}>{t}</th>)}</tr></thead><tbody>
      <tr className="border-t"><td className="py-1">Recusadas (números de fora)</td>{PERIODOS.map(([k]) => { const b = d.recusadas?.[k]; return <td key={k}>{b?.qtd ?? 0} · {min(b?.segundos ?? 0)} min · {custo(b, c)}{b?.sem_duracao ? ` · ${b.sem_duracao} sem duração` : ''}</td>; })}</tr>
      <tr className="border-t"><td className="py-1">Vendedores (entrada e saída)</td>{PERIODOS.map(([k]) => { const b = grupos(k, g => g === 'vendedor'); return <td key={k}>{b.qtd} · {min(b.segundos)} min · {custo(b, c)}</td>; })}</tr>
      <tr className="border-t"><td className="py-1">Admin/teste</td>{PERIODOS.map(([k]) => { const b = grupos(k, g => g !== 'vendedor'); return <td key={k}>{b.qtd} · {min(b.segundos)} min · {custo(b, c)}</td>; })}</tr>
      <tr className="border-t font-medium"><td className="py-1">Total</td>{PERIODOS.map(([k]) => { const b = somar([grupos(k, () => true), d.recusadas?.[k] ?? { qtd: 0, segundos: 0, creditos: null }]); return <td key={k}>{min(b.segundos)} min · {custo(b, c)}</td>; })}</tr>
    </tbody></table></div>
    <div><h3 className="font-medium text-sm mb-1">Números de fora que mais ligam (30 dias)</h3>
      {d.top_numeros.length ? <ul className="text-sm space-y-0.5">{d.top_numeros.map((t, i) => <li key={i}>{t.numero} — {t.qtd} ligações · {min(t.segundos)} min · última {new Date(t.ultima).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })}</li>)}</ul> : <p className="text-sm text-muted-foreground">Nenhuma ligação recusada.</p>}
    </div>
    <div className="border-t pt-3 grid sm:grid-cols-4 gap-2">
      <Label>Alerta: recusadas/dia<Input inputMode="numeric" value={cfg.max_recusadas_dia ?? ''} onChange={e => setCfg({ ...cfg, max_recusadas_dia: e.target.value })} /></Label>
      <Label>Alerta: minutos/dia<Input inputMode="decimal" value={cfg.max_minutos_recusadas_dia ?? ''} onChange={e => setCfg({ ...cfg, max_minutos_recusadas_dia: e.target.value })} /></Label>
      <Label>R$ por crédito<Input inputMode="decimal" placeholder="ex.: 0,0012" value={cfg.reais_por_credito ?? ''} onChange={e => setCfg({ ...cfg, reais_por_credito: e.target.value })} /></Label>
      <Label>R$ por minuto<Input inputMode="decimal" placeholder="ex.: 0,60" value={cfg.reais_por_minuto ?? ''} onChange={e => setCfg({ ...cfg, reais_por_minuto: e.target.value })} /></Label>
    </div>
    <Button variant="outline" disabled={busy} onClick={salvar}>Salvar limites e preços</Button>
  </Card>;
}
