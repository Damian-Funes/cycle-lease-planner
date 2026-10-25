import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { ModeloCapacidade, ParametrosCapacidade } from '@/lib/capacidade';
export function useConfiguracaoCapacidade() {
  return useQuery({ queryKey:['capacidade-config'], queryFn: async () => {
    const [m,p] = await Promise.all([
      supabase.from('capacidade_modelos').select('*').order('ordem'),
      supabase.from('capacidade_parametros').select('*').eq('id','padrao').single(),
    ]);
    if (m.error) throw m.error;
    if (p.error) throw p.error;
    return { modelos: m.data as ModeloCapacidade[], parametros: p.data as ParametrosCapacidade };
  } });
}
export function useDiagnosticos(v: { oportunidadeId?: string; organizacaoId?: string }) {
  return useQuery({ queryKey:['diagnosticos',v], enabled:Boolean(v.oportunidadeId || v.organizacaoId), queryFn: async () => {
    let q = supabase.from('diagnosticos_tecnicos').select('*').order('created_at',{ascending:false}).limit(20);
    if (v.oportunidadeId) q=q.eq('oportunidade_id',v.oportunidadeId);
    else if (v.organizacaoId) q=q.eq('organizacao_id',v.organizacaoId);
    const {data,error}=await q;
    if (error) throw error;
    return data;
  } });
}