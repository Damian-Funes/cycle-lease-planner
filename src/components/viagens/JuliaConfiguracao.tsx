import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chamarJulia } from '@/hooks/useLigacoesViagem';
import { validarConfigJulia } from '@/lib/juliaConfigValidacao';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Phone, Save } from 'lucide-react';
import { toast } from 'sonner';
import { listarViagensTesteJulia } from '@/lib/juliaConfiguracao';
import { hojeRota } from '@/lib/rotasFluxo';
type PerfilJulia = {user_id:string;nome:string;celular:string|null};
const PERFIS_VAZIOS: PerfilJulia[] = [];
const mensagemErro = (e: unknown) => e && typeof e === 'object' && 'message' in e ? String(e.message) : 'Não foi possível carregar os dados.';
export default function JuliaConfiguracao(){
 const qc=useQueryClient();const [busy,setBusy]=useState(false);const [ativo,setAtivo]=useState(false);const [hora,setHora]=useState('16:00');const [cel,setCel]=useState<Record<string,string>>({});const [rota,setRota]=useState('');
 const parametrosQuery=useQuery({queryKey:['julia-parametros'],retry:false,queryFn:async()=>{const r=await supabase.from('viagem_parametros').select('*').eq('id','padrao').single();if(r.error)throw r.error;return r.data;}});
 const params=parametrosQuery.data;
 const pronto=params?.ligacao_ativa!==undefined && params?.contato_hora!==undefined;
 const perfisQuery=useQuery({queryKey:['julia-celulares'],retry:false,queryFn:async()=>{const roles=await supabase.from('user_roles').select('user_id,role').in('role',['comercial','rtv','admin']);if(roles.error)throw roles.error;const ids=[...new Set((roles.data??[]).filter(r=>r.role!=='admin'||r.user_id==='660c2932-4404-48ca-ad2d-c76862bb9d74').map(r=>r.user_id))];if(!ids.length)return PERFIS_VAZIOS;const r=await supabase.from('profiles').select('user_id,nome,celular').in('user_id',ids).order('nome');if(r.error)throw r.error;return r.data as PerfilJulia[];}});
 const profiles=perfisQuery.data??PERFIS_VAZIOS;
 const hoje=hojeRota();
 const viagensQuery=useQuery({queryKey:['viagens-teste-julia',hoje],retry:false,queryFn:()=>listarViagensTesteJulia(hoje),refetchInterval:120000});
 const viagens=viagensQuery.data??[];
 const carregando=parametrosQuery.isPending||perfisQuery.isPending;
 const erros=[['Configurações',parametrosQuery.error],['Celulares',perfisQuery.error],['Viagens',viagensQuery.error]] as const;
 const [errosSalvar,setErrosSalvar]=useState<string[]>([]);
 const motivoBloqueio=busy?'salvando…':carregando?'carregando dados…':parametrosQuery.error?'erro ao carregar configurações':perfisQuery.error?'erro ao carregar celulares':!pronto?'campos da Júlia indisponíveis':null;
 useEffect(()=>{if(params){setAtivo(params.ligacao_ativa??false);setHora(params.contato_hora?.slice(0,5)??'16:00');}},[params]);
 useEffect(()=>{setCel(Object.fromEntries(profiles.map(p=>[p.user_id,p.celular??''])));},[profiles]);
 const naoSalvo=pronto&&(hora!==(params?.contato_hora?.slice(0,5)??'16:00')||profiles.some(p=>(cel[p.user_id]??'')!==(p.celular??'')));
 return <Card className="p-4 space-y-3"><h2 className="font-semibold">Júlia — fechamento do dia por voz</h2>
 {erros.map(([titulo,erro])=>erro?<p key={titulo} role="alert" className="text-sm text-destructive">{titulo}: {mensagemErro(erro)}</p>:null)}
 {carregando&&<p role="status" className="text-sm text-muted-foreground">Carregando configurações da Júlia…</p>}
 {!parametrosQuery.isPending&&!parametrosQuery.error&&!pronto&&<p role="alert" className="text-sm text-destructive">Os campos de configuração da Júlia não estão disponíveis. Atualize e tente novamente.</p>}
 {erros.some(([,erro])=>erro)&&<Button variant="outline" onClick={()=>{void parametrosQuery.refetch();void perfisQuery.refetch();void viagensQuery.refetch();}}>Tentar novamente</Button>}
 <div className="flex flex-wrap gap-4 items-center"><Label className="flex items-center gap-2"><Switch disabled={!pronto||busy} checked={ativo} onCheckedChange={async(novo)=>{if(novo&&!confirm('A Júlia vai ligar de verdade para os vendedores em viagem. Ligar?'))return;const anterior=ativo;setAtivo(novo);setBusy(true);try{const r=await supabase.from('viagem_parametros').update({ligacao_ativa:novo}).eq('id','padrao').select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Sem permissão para salvar (precisa ser admin).');setErrosSalvar([]);await qc.invalidateQueries({queryKey:['julia-parametros']});toast.success(`Ligações automáticas ${novo?'LIGADAS':'DESLIGADAS'}`);}catch(e){setAtivo(anterior);const m=mensagemErro(e);setErrosSalvar([`Não salvou o switch: ${m}`]);toast.error(m);}finally{setBusy(false);}}}/>Ligações automáticas</Label><Label>Contato inicial (Brasília)<Input disabled={!pronto||busy} type="time" value={hora} onChange={e=>setHora(e.target.value)}/></Label></div>
 <h3 className="font-medium">Celulares dos vendedores</h3>{profiles.map(p=><div key={p.user_id} className="grid sm:grid-cols-2 gap-2"><Label htmlFor={`cel-${p.user_id}`}>{p.nome}</Label><Input id={`cel-${p.user_id}`} inputMode="tel" value={cel[p.user_id]??''} onChange={e=>setCel({...cel,[p.user_id]:e.target.value})} placeholder="+55 (DDD) celular"/></div>)}
 {params&&pronto&&<p className={`text-sm font-medium ${params.ligacao_ativa?'text-primary':'text-muted-foreground'}`}>Salvo no sistema: ligações automáticas {params.ligacao_ativa?'LIGADAS':'DESLIGADAS'} · contato {String(params.contato_hora).slice(0,5)}</p>}
 {motivoBloqueio&&<p role="status" className="text-sm text-muted-foreground">Botão indisponível: {motivoBloqueio}</p>}
 {errosSalvar.length>0&&<div role="alert" className="text-sm text-destructive space-y-1">{errosSalvar.map(e=><p key={e}>{e}</p>)}</div>}
 <Button disabled={Boolean(motivoBloqueio)} onClick={async()=>{const v=validarConfigJulia(hora,profiles,cel);if(v.erros.length||!v.hora){setErrosSalvar(v.erros);toast.error(v.erros[0]??'Dados inválidos');return;}setErrosSalvar([]);setBusy(true);try{const r=await supabase.from('viagem_parametros').update({contato_hora:v.hora}).eq('id','padrao').select('id').maybeSingle();if(r.error)throw r.error;if(!r.data)throw new Error('Sem permissão para salvar (precisa ser admin).');for(const c of v.celularesAlterados){const p=await supabase.from('profiles').update({celular:c.celular}).eq('user_id',c.user_id).select('user_id').maybeSingle();if(p.error)throw p.error;if(!p.data)throw new Error('Sem permissão para salvar celulares (precisa ser admin).');}await qc.invalidateQueries({queryKey:['julia-parametros']});await qc.invalidateQueries({queryKey:['julia-celulares']});toast.success('Horário e celulares salvos');}catch(e){const m=mensagemErro(e);setErrosSalvar([`Não salvou: ${m}`]);toast.error(m);}finally{setBusy(false);}}}><Save className="w-4 h-4 mr-1"/>Salvar horário e celulares</Button>
 {naoSalvo&&<span role="status" className="ml-2 text-sm font-medium text-destructive">Alterações não salvas</span>}
 <div className="border-t pt-3 space-y-2"><Label htmlFor="julia-rota">Viagem real para teste</Label><select id="julia-rota" disabled={busy||viagensQuery.isPending||Boolean(viagensQuery.error)} className="w-full border border-input rounded-md p-2 bg-background" value={rota} onChange={e=>setRota(e.target.value)}><option value="">Selecione um vendedor em viagem</option>{viagens.map(v=><option key={v.id} value={v.id}>{profiles.find(p=>p.user_id===v.vendedor_id)?.nome??'Vendedor'} · {v.data_inicio} a {v.data_fim}</option>)}</select>
 {viagensQuery.isPending?<p role="status" className="text-sm text-muted-foreground">Carregando viagens…</p>:!viagensQuery.error&&!viagens.length?<p className="text-sm text-muted-foreground">Nenhuma viagem aprovada em andamento hoje (Brasília).</p>:null}
 <Button variant="outline" disabled={!pronto||!viagens.some(v=>v.id===rota)||busy||Boolean(viagensQuery.error)} onClick={async()=>{if(!confirm('Ligar para o seu celular usando as pendências reais desta viagem? Os registros por voz serão reais.'))return;setBusy(true);try{await chamarJulia({modo:'manual',rota_id:rota,teste:true});toast.success('Ligação de teste iniciada');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}><Phone className="w-4 h-4 mr-1"/>Ligar para mim (teste)</Button></div>
 </Card>;
}