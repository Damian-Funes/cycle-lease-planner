import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useConfiguracaoCapacidade } from '@/hooks/useCapacidade';
import { useTipicos } from '@/hooks/useTipicos';
import type { ModeloCapacidade, ParametrosCapacidade } from '@/lib/capacidade';
import NumeroInput from '@/components/capacidade/NumeroInput';
import AppHeader from '@/components/AppHeader';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { ArrowLeft, Save } from 'lucide-react';
import { toast } from 'sonner';
export default function ConfiguracoesCapacidade(){
  const navigate=useNavigate(); const qc=useQueryClient(); const config=useConfiguracaoCapacidade(); const tipicos=useTipicos({tipo:'orcamento'});
  const [modelos,setModelos]=useState<ModeloCapacidade[]>([]); const [p,setP]=useState<ParametrosCapacidade|null>(null);const [saving,setSaving]=useState(false);
  useEffect(()=>{if(config.data){setModelos(config.data.modelos);setP(config.data.parametros);}},[config.data]);
  async function salvar(){
    if(!p||saving)return;setSaving(true);
    try{
      // One statement per collection: each upsert is atomic; preserve untouched server fields.
      const m=await supabase.from('capacidade_modelos').upsert(modelos.map(m=>({id:m.id,modelo:m.modelo,kg_batelada:m.kg_batelada,ordem:m.ordem,ativo:m.ativo,tipico_id:m.tipico_id})),{onConflict:'id'});if(m.error)throw m.error;
      const r=await supabase.from('capacidade_parametros').update(p).eq('id','padrao').select('id').single();if(r.error)throw r.error;
      await qc.invalidateQueries({queryKey:['capacidade-config']});toast.success('Configurações salvas');
    }catch(e){toast.error((e as Error).message);void qc.invalidateQueries({queryKey:['capacidade-config']});}finally{setSaving(false);}
  }
  const update=(id:string,v:Partial<ModeloCapacidade>)=>setModelos(ms=>ms.map(m=>m.id===id?{...m,...v}:m));
  const parametro=(label:string,k:keyof ParametrosCapacidade,nullable=false,percent=false)=><NumeroInput label={label} nullable={nullable} value={p?.[k]===null?null:Number(p?.[k]??0)*(percent?100:1)} onChange={v=>setP(old=>old?{...old,[k]:v===null?null:v/(percent?100:1)}:old)}/>;
  return <div className="min-h-screen bg-background"><header className="border-b"><div className="max-w-6xl mx-auto px-4 py-3 flex justify-between"><Button variant="ghost" onClick={()=>navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2"/>Voltar</Button><AppHeader/></div></header><main className="max-w-6xl mx-auto px-4 py-8 space-y-8"><h1 className="text-2xl font-bold">Configurações de Capacidade</h1>
    {config.isError?<p className="text-destructive">{(config.error as Error).message}</p>:!p?<p>Carregando…</p>:<>
    <section><h2 className="text-lg font-semibold mb-4">Modelos LS</h2><div className="space-y-0 divide-y border-y">{modelos.map(m=><div key={m.id} className="py-5 grid md:grid-cols-[140px_1fr_1fr_2fr_80px] gap-4 items-center"><h3 className="font-semibold">{m.modelo}</h3><NumeroInput label="Kg / batelada" value={m.kg_batelada} onChange={v=>update(m.id,{kg_batelada:v??0})}/><NumeroInput label="Ordem" integer value={m.ordem} onChange={v=>update(m.id,{ordem:v??0})}/><div className="space-y-1.5"><Label>Típico vinculado</Label><Select value={m.tipico_id??'nenhum'} onValueChange={v=>update(m.id,{tipico_id:v==='nenhum'?null:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="nenhum">Sem Típico</SelectItem>{tipicos.data?.map(t=><SelectItem key={t.id} value={t.id}>{t.nome}</SelectItem>)}</SelectContent></Select></div><div className="space-y-2"><Label htmlFor={`ativo-${m.id}`}>Ativo</Label><Switch id={`ativo-${m.id}`} checked={m.ativo} onCheckedChange={v=>update(m.id,{ativo:v})}/></div></div>)}</div>{tipicos.isError&&<p className="text-destructive text-sm">Não foi possível carregar os Típicos.</p>}</section>
    <section><h2 className="text-lg font-semibold mb-4">Padrões de operação</h2><div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-5">{parametro('Tempo de receita (s)','tempo_receita_padrao_s')}{parametro('Horas trabalhadas / dia','horas_trabalhadas_padrao')}{parametro('Horas perdidas — lotes liberados','horas_perdidas_padrao')}{parametro('Horas perdidas — lotes desorganizados','horas_perdidas_lotes_desorganizados')}{parametro('Folga mínima (%)','folga_minima',false,true)}{parametro('Crescimento padrão (% a.a.)','crescimento_padrao_pct')}{parametro('Horizonte padrão (anos)','horizonte_padrao_anos')}</div></section>
    <section><h2 className="text-lg font-semibold mb-4">Peso padrão por cultura</h2><div className="grid sm:grid-cols-3 gap-5">{parametro('Soja (kg/saco)','peso_soja',true)}{parametro('Milho (kg/saco)','peso_milho',true)}{parametro('Trigo (kg/saco)','peso_trigo',true)}</div></section>
    <Button onClick={()=>void salvar()} disabled={saving}><Save className="w-4 h-4 mr-2"/>{saving?'Salvando…':'Salvar configurações'}</Button></>}
  </main></div>;
}