import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { atualizarRota, rotasAprovacoes, type RotaEquipe } from '@/lib/rotas';
import { diaRota, hojeRota, resumoMensal } from '@/lib/rotasFluxo';
import AppHeader from '@/components/AppHeader';
import RotaMapa from '@/components/rotas/RotaMapa';
import RotaStatus from '@/components/rotas/RotaStatus';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { ArrowLeft, Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function RotasAprovacoes() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [aba, setAba] = useState<'aguardando' | 'pendentes' | 'concluidas'>('aguardando');
  const [mes, setMes] = useState(hojeRota().slice(0, 7));
  const [reprovar, setReprovar] = useState<RotaEquipe | null>(null);
  const [motivo, setMotivo] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const { data: rotas = [], isLoading, error } = useQuery({ queryKey: ['rotas-aprovacoes', aba, mes], queryFn: () => rotasAprovacoes(aba, mes), refetchInterval: 30000 });
  async function decidir(r: RotaEquipe, aprovar: boolean) {
    if (!aprovar && !motivo.trim()) { toast.error('Informe o motivo da reprovação.'); return; }
    setBusy(r.id);
    try {
      await atualizarRota(r.id, { status: aprovar ? 'aprovada' : 'reprovada', motivo_reprovacao: aprovar ? null : motivo.trim() });
      toast.success(aprovar ? 'Rota aprovada' : 'Rota reprovada');
      setReprovar(null); setMotivo('');
      qc.invalidateQueries({ queryKey: ['rotas-aprovacoes'] }); qc.invalidateQueries({ queryKey: ['rotas-aprovacoes-contagem'] }); qc.invalidateQueries({ queryKey: ['rotas-pendencias'] });
    } catch (e) { toast.error((e as { message?: string })?.message || 'Não foi possível atualizar a rota.'); }
    finally { setBusy(null); }
  }
  const vendedores = new Map(rotas.map(r => [r.vendedor_id, r.vendedor?.nome || r.vendedor?.email || 'Vendedor']));
  return <div className="min-h-screen bg-muted/20">
    <header className="border-b bg-background"><div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between gap-3"><div className="flex items-center gap-2"><Button variant="ghost" size="icon" aria-label="Voltar para rotas" onClick={() => navigate('/rotas')}><ArrowLeft className="h-4 w-4" /></Button><h1 className="font-semibold">Autorizações de viagem</h1></div><AppHeader /></div></header>
    <main className="max-w-7xl mx-auto px-4 py-6 space-y-5">
      <Tabs value={aba} onValueChange={v => setAba(v as typeof aba)}><TabsList className="h-auto flex-wrap"><TabsTrigger value="aguardando">Aguardando</TabsTrigger><TabsTrigger value="pendentes">Prestação pendente</TabsTrigger><TabsTrigger value="concluidas">Concluídas no mês</TabsTrigger></TabsList></Tabs>
      {aba === 'concluidas' && <><div className="max-w-56"><Label htmlFor="mes-rotas">Mês de conclusão</Label><Input id="mes-rotas" type="month" value={mes} onChange={e => { if (e.target.value) setMes(e.target.value); }} /></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-left"><th className="p-3">Vendedor</th><th>Rotas</th><th>Dias em campo</th><th>Visitadas</th><th>Não visitadas</th></tr></thead><tbody>{resumoMensal(rotas).map(g => <tr key={g.vendedor_id} className="border-b"><td className="p-3">{vendedores.get(g.vendedor_id)}</td><td>{g.rotas}</td><td>{g.dias}</td><td>{g.visitadas}</td><td>{g.naoVisitadas}</td></tr>)}</tbody></table></div></>}
      {isLoading && <p className="text-muted-foreground">Carregando rotas...</p>}
      {error && <p className="text-destructive">{(error as { message?: string }).message}</p>}
      {!isLoading && !error && !rotas.length && <p className="text-muted-foreground">Nenhuma rota neste período.</p>}
      {rotas.map(r => <Card key={r.id} className="overflow-hidden"><div className="grid lg:grid-cols-2"><div className="p-4 space-y-3"><div className="flex flex-wrap gap-2 items-center"><h2 className="font-semibold">{vendedores.get(r.vendedor_id)} · {diaRota(r.data_rota)}</h2><RotaStatus status={r.status} /></div><p className="text-sm text-muted-foreground">{r.km_total_estimado === null ? 'Km não calculado' : `${r.km_total_estimado.toLocaleString('pt-BR')} km estimados`}</p><ol className="space-y-2 list-decimal pl-5">{r.paradas.map(p => <li key={p.id} className="text-sm"><span className="font-medium">{p.organizacao?.nome_fantasia || p.organizacao?.nome || p.cidade} {p.estado && ` / ${p.estado}`}</span><p className="text-muted-foreground">{p.objetivo}</p>{aba === 'concluidas' && <p>{p.visitada ? `Visitada: ${p.resultado}` : `Não visitada: ${p.motivo_nao_visita}`}</p>}</li>)}</ol><div className="flex flex-wrap gap-2">{aba === 'aguardando' && <><Button disabled={busy !== null} onClick={() => decidir(r, true)}><Check className="w-4 h-4 mr-1" />Aprovar</Button><Button variant="destructive" disabled={busy !== null} onClick={() => { setReprovar(r); setMotivo(''); }}><X className="w-4 h-4 mr-1" />Reprovar</Button></>}<Button variant="outline" onClick={() => navigate(`/rotas/${r.id}`)}>Abrir rota</Button></div></div><RotaMapa vendedorId={r.vendedor_id} paradas={r.paradas} /></div></Card>)}
    </main>
    <Dialog open={Boolean(reprovar)} onOpenChange={o => { if (!o) setReprovar(null); }}><DialogContent><DialogHeader><DialogTitle>Reprovar viagem</DialogTitle></DialogHeader><Label htmlFor="motivo-reprovacao">Motivo obrigatório</Label><Textarea id="motivo-reprovacao" value={motivo} onChange={e => setMotivo(e.target.value)} /><DialogFooter><Button variant="outline" onClick={() => setReprovar(null)}>Cancelar</Button><Button variant="destructive" disabled={busy !== null || !motivo.trim()} onClick={() => reprovar && decidir(reprovar, false)}>Reprovar</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}