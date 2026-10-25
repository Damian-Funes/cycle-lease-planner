import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useConfiguracaoCapacidade } from '@/hooks/useCapacidade';
import { calcularCapacidade, validarCapacidade, urlOrcamentoDiagnostico, type EntradaCapacidade } from '@/lib/capacidade';
import AppHeader from '@/components/AppHeader';
import SeletorOrganizacao from '@/components/SeletorOrganizacao';
import NumeroInput from '@/components/capacidade/NumeroInput';
import DiagnosticoResultados from '@/components/capacidade/DiagnosticoResultados';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { ArrowLeft, Gauge, Loader2 } from 'lucide-react';
import { toast } from 'sonner';

export default function Diagnostico() {
  const navigate=useNavigate(); const [search,setSearch]=useSearchParams(); const qc=useQueryClient();
  const config=useConfiguracaoCapacidade(); const id=search.get('id');
  const [entrada,setEntrada]=useState<EntradaCapacidade|null>(null);
  const [organizacao,setOrganizacao]=useState<string|null>(search.get('organizacao'));
  const [oportunidade,setOportunidade]=useState<string|null>(search.get('oportunidade'));
  const [unidadeAtual,setUnidadeAtual]=useState('kg'); const [saving,setSaving]=useState(false);
  const [erroCarga,setErroCarga]=useState(''); const [carregado,setCarregado]=useState(false);
  const deals=useQuery({queryKey:['diagnostico-deals'],queryFn:async()=>{
    const {data,error}=await supabase.from('oportunidades').select('id,titulo,organizacao_id,organizacoes(nome)').order('titulo').limit(1000);
    if(error)throw error;return data;
  }});
  useEffect(()=>{
    if(!config.data)return; let active=true;
    const iniciar=async()=>{
      setCarregado(false);setErroCarga('');
      try {
        if(id){
          const {data:d,error}=await supabase.from('diagnosticos_tecnicos').select('*').eq('id',id).single();
          if(error)throw error;
          if(active){setEntrada({cultura:d.cultura,sacos_safra:d.sacos_safra,kg_por_saco:d.kg_por_saco,janela_dias:d.janela_dias,horas_trabalhadas_dia:d.horas_trabalhadas_dia,lotes_liberados_dia_anterior:d.lotes_liberados_dia_anterior,horas_perdidas_dia:d.horas_perdidas_dia,tempo_receita_s:d.tempo_receita_s,num_produtos_liquidos:d.num_produtos_liquidos,usa_po:d.usa_po,capacidade_atual_kg_h:d.capacidade_atual_kg_h,equipamento_atual:d.equipamento_atual??'',observacoes:d.observacoes??''});setOrganizacao(d.organizacao_id);setOportunidade(d.oportunidade_id);}
        }else{
          const p=config.data.parametros;
          if(active)setEntrada({cultura:'soja',sacos_safra:0,kg_por_saco:p.peso_soja??0,janela_dias:0,horas_trabalhadas_dia:p.horas_trabalhadas_padrao,lotes_liberados_dia_anterior:true,horas_perdidas_dia:p.horas_perdidas_padrao,tempo_receita_s:p.tempo_receita_padrao_s,num_produtos_liquidos:0,usa_po:false,capacidade_atual_kg_h:null,equipamento_atual:'',observacoes:''});
          const opp=search.get('oportunidade');
          if(opp){const {data,error}=await supabase.from('oportunidades').select('organizacao_id').eq('id',opp).single();if(error)throw error;if(active){setOportunidade(opp);setOrganizacao(data.organizacao_id);}}
        }
      }catch(e){if(active)setErroCarga((e as Error).message);}finally{if(active)setCarregado(true);}
    };void iniciar();return()=>{active=false;};
  },[config.data,id]);
  const erros=entrada?validarCapacidade(entrada):[];
  const resultado=useMemo(()=>{
    if(!entrada||!config.data)return null;
    try{return calcularCapacidade(entrada,config.data.modelos,config.data.parametros.folga_minima);}catch{return null;}
  },[entrada,config.data]);
  const patch=(p:Partial<EntradaCapacidade>)=>setEntrada(e=>e?{...e,...p}:e);
  async function salvar(modeloId?:string){
    if(!entrada||!resultado||saving)return;
    setSaving(true);
    try{
      const payload={...entrada,organizacao_id:organizacao,oportunidade_id:oportunidade,modelo_sugerido_id:resultado.recomendado_id,resultado:resultado as unknown as Json};
      const q=id?supabase.from('diagnosticos_tecnicos').update(payload).eq('id',id):supabase.from('diagnosticos_tecnicos').insert(payload);
      const {data,error}=await q.select('id').single();if(error)throw error;
      await qc.invalidateQueries({queryKey:['diagnosticos']});
      if(modeloId){const modelo=config.data?.modelos.find(m=>m.id===modeloId);navigate(urlOrcamentoDiagnostico(modelo?.tipico_id??null,oportunidade,organizacao));}
      else{setSearch({id:data.id},{replace:true});toast.success('Diagnóstico salvo');}
    }catch(e){toast.error((e as Error).message||'Não foi possível salvar o diagnóstico.');}finally{setSaving(false);}
  }
  const numero=(label:string,campo:keyof EntradaCapacidade,integer=false)=><NumeroInput label={label} value={entrada?.[campo] as number??0} integer={integer} onChange={v=>patch({[campo]:v??0})}/>;
  return <div className="min-h-screen bg-background"><header className="border-b"><div className="max-w-7xl mx-auto px-4 py-3 flex justify-between"><Button variant="ghost" onClick={()=>navigate(-1)}><ArrowLeft className="w-4 h-4 mr-2"/>Voltar</Button><AppHeader/></div></header><main className="max-w-7xl mx-auto px-4 py-8">
    <div className="flex items-center gap-3 mb-8"><Gauge className="w-8 h-8 text-primary"/><div><h1 className="text-2xl font-bold">Diagnóstico Técnico</h1><p className="text-sm text-muted-foreground">Capacidade e dimensionamento LS</p></div></div>
    {config.isError||erroCarga?<div className="text-destructive">{erroCarga||(config.error as Error)?.message}<Button className="ml-3" variant="outline" onClick={()=>config.refetch()}>Tentar novamente</Button></div>:!entrada||!carregado?<Loader2 className="w-6 h-6 animate-spin text-primary"/>:<div className="grid lg:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.5fr)] gap-10">
      <div className="space-y-6 min-w-0">
        <section className="border-b pb-6 space-y-4"><h2 className="font-semibold">Cliente e negócio</h2><SeletorOrganizacao pedirContato={false} showDataPreview={false} value={{organizacao_id:organizacao}} onChange={v=>{setOrganizacao(v.organizacao_id??null);setOportunidade(null);}}/>
          <Label>Negócio</Label><Select value={oportunidade??'nenhum'} onValueChange={v=>{const d=deals.data?.find(d=>d.id===v);setOportunidade(d?.id??null);if(d)setOrganizacao(d.organizacao_id);}}><SelectTrigger><SelectValue placeholder="Vincular a um negócio"/></SelectTrigger><SelectContent><SelectItem value="nenhum">Sem negócio vinculado</SelectItem>{deals.data?.filter(d=>!organizacao||d.organizacao_id===organizacao).map(d=><SelectItem key={d.id} value={d.id}>{d.titulo}</SelectItem>)}</SelectContent></Select>{deals.isError&&<p className="text-xs text-destructive">Não foi possível carregar os negócios.</p>}</section>
        <section className="border-b pb-6 space-y-4"><h2 className="font-semibold">1. Volume</h2><Label>Cultura</Label><Select value={entrada.cultura} onValueChange={v=>{const p=config.data?.parametros;const peso=v==='soja'?p?.peso_soja:v==='milho'?p?.peso_milho:v==='trigo'?p?.peso_trigo:null;patch({cultura:v,kg_por_saco:peso??0});}}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{['soja','milho','trigo','outra'].map(v=><SelectItem key={v} value={v}>{v[0].toUpperCase()+v.slice(1)}</SelectItem>)}</SelectContent></Select><div className="grid grid-cols-2 gap-4">{numero('Kg por saco','kg_por_saco')}{numero('Sacos por safra','sacos_safra')}</div></section>
        <section className="border-b pb-6 space-y-4"><h2 className="font-semibold">2. Janela</h2>{numero('Em quantos dias precisa tratar tudo?','janela_dias')}{numero('Quantas horas por dia trabalha?','horas_trabalhadas_dia')}</section>
        <section className="border-b pb-6 space-y-4"><h2 className="font-semibold">3. Operação</h2><Label>Os lotes são liberados no dia anterior?</Label><div className="flex gap-2">{[true,false].map(sim=><Button key={String(sim)} type="button" variant={entrada.lotes_liberados_dia_anterior===sim?'default':'outline'} onClick={()=>patch({lotes_liberados_dia_anterior:sim,horas_perdidas_dia:sim?config.data?.parametros.horas_perdidas_padrao??2:config.data?.parametros.horas_perdidas_lotes_desorganizados??4})}>{sim?'Sim':'Não'}</Button>)}</div>{numero('Horas perdidas por dia (manobras)','horas_perdidas_dia')}</section>
        <section className="border-b pb-6 space-y-4"><h2 className="font-semibold">4. Receita</h2>{numero('Tempo de ciclo (segundos)','tempo_receita_s')}{numero('Nº de produtos líquidos','num_produtos_liquidos',true)}<div className="flex items-center justify-between"><Label htmlFor="usa-po">Usa pó?</Label><Switch id="usa-po" checked={entrada.usa_po} onCheckedChange={v=>patch({usa_po:v})}/></div></section>
        <section className="border-b pb-6 space-y-4"><h2 className="font-semibold">5. Equipamento atual <span className="text-muted-foreground font-normal text-sm">(opcional)</span></h2><Label htmlFor="equipamento-atual">Qual equipamento usa hoje?</Label><Input id="equipamento-atual" value={entrada.equipamento_atual} onChange={e=>patch({equipamento_atual:e.target.value})}/><div className="flex gap-2">{['kg','sacos'].map(u=><Button key={u} type="button" variant={unidadeAtual===u?'default':'outline'} onClick={()=>setUnidadeAtual(u)}>{u}/h</Button>)}</div><NumeroInput label={`Capacidade atual (${unidadeAtual}/h)`} nullable value={entrada.capacidade_atual_kg_h===null?null:unidadeAtual==='kg'?entrada.capacidade_atual_kg_h:entrada.kg_por_saco>0?entrada.capacidade_atual_kg_h/entrada.kg_por_saco:null} onChange={v=>patch({capacidade_atual_kg_h:v===null?null:unidadeAtual==='kg'?v:v*entrada.kg_por_saco})}/></section>
        <div className="space-y-2"><Label htmlFor="observacoes">Observações</Label><Textarea id="observacoes" value={entrada.observacoes} onChange={e=>patch({observacoes:e.target.value})}/></div>
      </div><DiagnosticoResultados resultado={resultado} erros={erros} saving={saving} onSave={()=>void salvar()} onGerar={modelo=>void salvar(modelo)}/>
    </div>}
  </main></div>;
}