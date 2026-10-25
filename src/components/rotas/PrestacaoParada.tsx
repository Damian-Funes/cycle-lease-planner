import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { atualizarParada, type RotaParada } from '@/lib/rotas';
import { paradaInformada } from '@/lib/rotasFluxo';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import ConcluirAtividadeDialog, { type AtividadeConcluir } from '@/components/ConcluirAtividadeDialog';
import NovaAtividadeQuickForm from '@/components/NovaAtividadeQuickForm';
import { useAtividadeListas } from '@/components/atividade/AtividadeCampos';
import { Check, X } from 'lucide-react';
import { toast } from 'sonner';

export default function PrestacaoParada({ parada, onSaved }: { parada: RotaParada; onSaved: () => void }) {
  const qc = useQueryClient();
  const [visitada, setVisitada] = useState(parada.visitada);
  const [texto, setTexto] = useState(parada.visitada === false ? parada.motivo_nao_visita ?? '' : parada.resultado ?? '');
  const [atividade, setAtividade] = useState<AtividadeConcluir | null>(null);
  const [saving, setSaving] = useState(false);
  const [orgId, setOrgId] = useState(parada.organizacao_id ?? '');
  const [proximo, setProximo] = useState(false);
  const { orgs } = useAtividadeListas();
  const erro = (e: unknown) => toast.error((e as { message?: string })?.message ?? 'Não foi possível registrar a parada.');
  async function gravar(sim: boolean, resultado: string) {
    await atualizarParada(parada.id, { visitada: sim, resultado: sim ? resultado.trim() : null, motivo_nao_visita: sim ? null : resultado.trim() });
    setVisitada(sim); setTexto(resultado); onSaved();
  }
  async function visitar() {
    if (!parada.atividade_id) { setVisitada(true); setTexto(parada.resultado ?? ''); return; }
    setSaving(true);
    try {
      const { data, error } = await supabase.from('atividades').select('id,tipo_id,tipo,evento_automatico,oportunidade_id,organizacao_id,pessoa_id,responsavel_id').eq('id', parada.atividade_id).single();
      if (error) throw error;
      setAtividade(data);
    } catch (e) { erro(e); } finally { setSaving(false); }
  }
  async function salvar() {
    if (visitada === null || !texto.trim()) { toast.error(visitada ? 'Informe o resultado da visita.' : 'Informe o motivo da não visita.'); return; }
    setSaving(true);
    try { await gravar(visitada, texto); toast.success('Parada informada'); }
    catch (e) { erro(e); } finally { setSaving(false); }
  }
  return <div className="border-t pt-3 mt-3 space-y-3">
    {paradaInformada(parada) && <p className="text-xs text-primary flex gap-1 items-center"><Check className="w-3 h-3" /> Prestação registrada</p>}
    <div className="flex gap-2">
      <Button size="sm" variant={visitada === true ? 'default' : 'outline'} disabled={saving} onClick={visitar}><Check className="w-4 h-4 mr-1" />Visitei</Button>
      <Button size="sm" variant={visitada === false ? 'destructive' : 'outline'} disabled={saving} onClick={() => { setVisitada(false); setTexto(parada.motivo_nao_visita ?? ''); }}><X className="w-4 h-4 mr-1" />Não visitei</Button>
    </div>
    {visitada !== null && <>
      <Label>{visitada ? 'Resultado da visita' : 'Motivo da não visita'} *</Label>
      <Textarea value={texto} onChange={e => setTexto(e.target.value)} disabled={visitada && Boolean(parada.atividade_id)} />
      {visitada && parada.atividade_id ? <Button size="sm" variant="outline" onClick={visitar}>Registrar resultado e próximo passo</Button> : <Button size="sm" onClick={salvar} disabled={saving}>Salvar prestação da parada</Button>}
    </>}
    {visitada && !parada.atividade_id && <div className="space-y-2">
      <Label>Organização para o próximo passo</Label>
      <Select value={orgId} onValueChange={v => { setOrgId(v); setProximo(false); }}><SelectTrigger><SelectValue placeholder="Selecionar organização" /></SelectTrigger><SelectContent>{orgs.map(o => <SelectItem key={o.id} value={o.id}>{o.nome_fantasia || o.nome}</SelectItem>)}</SelectContent></Select>
      {orgId && <Button variant="outline" size="sm" onClick={() => setProximo(true)}>Agendar próximo passo</Button>}
      {proximo && orgId && <NovaAtividadeQuickForm key={orgId} organizacaoId={orgId} onClose={() => setProximo(false)} onSaved={() => setProximo(false)} />}
    </div>}
    <ConcluirAtividadeDialog atividade={atividade} resultadoObrigatorio onClose={() => setAtividade(null)} onResultado={r => gravar(true, r)} onDone={() => { setAtividade(null); qc.invalidateQueries({ queryKey: ['atividades'] }); onSaved(); }} />
  </div>;
}