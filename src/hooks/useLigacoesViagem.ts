import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
export interface LigacaoViagem { id:string; rota_id:string; vendedor_id:string; data_ref:string; tentativa:number; status:string; escolha:string|null; agendada_para:string; resumo:string|null; transcricao:{role:string;message:string|null}[]|null; teste:boolean }
export function useJuliaDisponivel() {
 return useQuery({queryKey:['julia-disponivel'],queryFn:async()=>{
  const {data,error}=await supabase.from('viagem_parametros').select('*').eq('id','padrao').single();
  if(error) throw error;
  return Object.prototype.hasOwnProperty.call(data,'ligacao_ativa');
 },staleTime:60000});
}
export function useLigacoesViagem(rotaId?:string,dataRef?:string) {
 const {data:disponivel=false}=useJuliaDisponivel();
 return useQuery({queryKey:['ligacoes-viagem',rotaId,dataRef],enabled:disponivel,refetchInterval:60000,queryFn:async()=>{
  let q=(supabase as any).from('ligacoes_viagem').select('*').order('created_at',{ascending:false});
  if(rotaId) q=q.eq('rota_id',rotaId); if(dataRef) q=q.eq('data_ref',dataRef);
  const r=await q; if(r.error) throw r.error; return (r.data ?? []) as LigacaoViagem[];
 }});
}
export async function chamarJulia(body:Record<string,unknown>) {
 const {data,error}=await supabase.functions.invoke('julia-viagem-ligar',{body});
 if(error) {
  let message=error.message;
  if('context' in error && error.context instanceof Response) { try { const b=await error.context.json(); message=b.error || message; } catch { /* rede sem JSON */ } }
  throw new Error(message);
 }
 if(data?.error) throw new Error(data.error); return data;
}