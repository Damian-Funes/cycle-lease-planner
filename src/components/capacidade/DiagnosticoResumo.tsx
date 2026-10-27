import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useDiagnosticos } from '@/hooks/useCapacidade';
import { numeroCapacidade as n, fraseCrescimento, type ResultadoCapacidade } from '@/lib/capacidade';
import { Plus, Pencil } from 'lucide-react';
export default function DiagnosticoResumo(v:{oportunidadeId?:string;organizacaoId?:string}) {
  const navigate=useNavigate(); const q=useDiagnosticos(v); const d=q.data?.[0];
  const r=d?.resultado as unknown as ResultadoCapacidade | undefined;
  const m=r?.modelos?.find(m=>m.id===r.recomendado_id);
  const p=new URLSearchParams(); if(v.oportunidadeId)p.set('oportunidade',v.oportunidadeId); if(v.organizacaoId)p.set('organizacao',v.organizacaoId);
  return <div className="space-y-4 py-4">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="font-semibold">Diagnóstico técnico</h3><Button onClick={()=>navigate(`/diagnostico?${p}`)}><Plus className="w-4 h-4 mr-2"/>Novo diagnóstico</Button></div>
    {q.isLoading?<p>Carregando diagnóstico…</p>:q.isError?<p className="text-destructive">Não foi possível carregar o diagnóstico.</p>:d&&r?<>
      <p className="text-sm text-muted-foreground">Último diagnóstico · {new Date(d.updated_at).toLocaleString('pt-BR')}</p>
      <div className="grid sm:grid-cols-3 gap-4 border-y py-4"><div><div className="text-sm text-muted-foreground">Capacidade necessária</div><strong>{n(r.capacidade_necessaria_sacos_h)} sacos/h</strong></div><div><div className="text-sm text-muted-foreground">Modelo recomendado</div><strong>{m?.modelo??'Nenhum modelo atende à folga'}</strong></div><div><div className="text-sm text-muted-foreground">Dias / janela</div><strong>{m?n(m.dias):'—'} / {n(d.janela_dias)} dias</strong></div></div>
      {fraseCrescimento(r)&&<p className="text-sm font-medium border-l-4 border-primary pl-3">{fraseCrescimento(r)}</p>}
      <Button variant="outline" onClick={()=>navigate(`/diagnostico?id=${d.id}`)}><Pencil className="w-4 h-4 mr-2"/>Abrir / editar</Button>
    </>:<p className="text-sm text-muted-foreground">Nenhum diagnóstico salvo.</p>}
  </div>;
}