import { useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { chamarJulia } from '@/hooks/useLigacoesViagem';
import { normalizarCelularBR, validarE164BR } from '@/lib/telefone';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Phone, Save } from 'lucide-react';
import { toast } from 'sonner';
import { viagensEmAndamento } from '@/lib/viagemDados';
import { hojeRota } from '@/lib/rotasFluxo';
export default function JuliaConfiguracao(){
 const qc=useQueryClient();const [busy,setBusy]=useState(false);const [ativo,setAtivo]=useState(false);const [hora,setHora]=useState('16:00');const [cel,setCel]=useState<Record<string,string>>({});const [rota,setRota]=useState('');
 const {data:params}=useQuery({queryKey:['julia-parametros'],queryFn:async()=>{const r=await supabase.from('viagem_parametros').select('*').eq('id','padrao').single();if(r.error)throw r.error;return r.data as unknown as {ligacao_ativa?:boolean;contato_hora?:string};}});
 const pronto=params?.ligacao_ativa!==undefined;
 const {data:profiles=[]}=useQuery({queryKey:['julia-celulares'],enabled:pronto,queryFn:async()=>{const roles=await supabase.from('user_roles').select('user_id,role').in('role',['comercial','rtv','admin']);if(roles.error)throw roles.error;const ids=(roles.data??[]).filter(r=>r.role!=='admin'||r.user_id==='660c2932-4404-48ca-ad2d-c76862bb9d74').map(r=>r.user_id);if(!ids.length)return [];const r=await (supabase as any).from('profiles').select('user_id,nome,celular').in('user_id',ids).order('nome');if(r.error)throw r.error;return r.data as {user_id:string;nome:string;celular:string|null}[];}});
 const {data:viagens=[]}=useQuery({queryKey:['viagens-teste-julia'],enabled:pronto,queryFn:()=>viagensEmAndamento(hojeRota())});
 useEffect(()=>{if(params){setAtivo(params.ligacao_ativa??false);setHora(params.contato_hora?.slice(0,5)??'16:00');}},[params]);
 useEffect(()=>{setCel(Object.fromEntries(profiles.map(p=>[p.user_id,p.celular??''])));},[profiles]);
 return <Card className="p-4 space-y-3"><h2 className="font-semibold">Júlia — fechamento do dia por voz</h2>{!pronto?<p className="text-sm text-muted-foreground">Aguardando aprovação e aplicação da SQL. Ligações automáticas desativadas.</p>:<>
 <div className="flex flex-wrap gap-4 items-center"><Label className="flex items-center gap-2"><Switch checked={ativo} onCheckedChange={setAtivo}/>Ligações automáticas</Label><Label>Contato inicial (Brasília)<Input type="time" value={hora} onChange={e=>setHora(e.target.value)}/></Label></div>
 <h3 className="font-medium">Celulares dos vendedores</h3>{profiles.map(p=><div key={p.user_id} className="grid sm:grid-cols-2 gap-2"><Label htmlFor={`cel-${p.user_id}`}>{p.nome}</Label><Input id={`cel-${p.user_id}`} inputMode="tel" value={cel[p.user_id]??''} onChange={e=>setCel({...cel,[p.user_id]:e.target.value})} placeholder="+55 (DDD) celular"/></div>)}
 <Button disabled={busy} onClick={async()=>{const entries=Object.entries(cel).map(([id,v])=>[id,normalizarCelularBR(v)]);if(entries.some(([,v])=>v&&!validarE164BR(v))){toast.error('Celular inválido');return;}if(hora<'15:50'||hora>='22:00'){toast.error('Contato deve ficar entre 15h50 e 21h59');return;}setBusy(true);try{for(const[id,v]of entries){const r=await(supabase as any).from('profiles').update({celular:v||null}).eq('user_id',id);if(r.error)throw r.error;}const r=await(supabase as any).from('viagem_parametros').update({ligacao_ativa:ativo,contato_hora:hora}).eq('id','padrao');if(r.error)throw r.error;qc.invalidateQueries({queryKey:['julia-parametros']});toast.success('Configurações da Júlia salvas');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}><Save className="w-4 h-4 mr-1"/>Salvar Júlia</Button>
 <div className="border-t pt-3 space-y-2"><Label htmlFor="julia-rota">Viagem real para teste</Label><select id="julia-rota" className="w-full border border-input rounded-md p-2 bg-background" value={rota} onChange={e=>setRota(e.target.value)}><option value="">Selecione um vendedor em viagem</option>{viagens.map(v=><option key={v.id} value={v.id}>{v.vendedor?.nome} · {v.data_inicio} a {v.data_fim}</option>)}</select><Button variant="outline" disabled={!rota||busy} onClick={async()=>{if(!confirm('Ligar para o seu celular usando as pendências reais desta viagem? Os registros por voz serão reais.'))return;setBusy(true);try{await chamarJulia({modo:'manual',rota_id:rota,teste:true});toast.success('Ligação de teste iniciada');}catch(e){toast.error((e as Error).message);}finally{setBusy(false);}}}><Phone className="w-4 h-4 mr-1"/>Ligar para mim (teste)</Button></div>
 </>}</Card>;
}