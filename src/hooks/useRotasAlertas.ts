import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { supabase } from '@/integrations/supabase/client';
import { pendenciasRotas } from '@/lib/rotas';

export function useRotasAlertas() {
  const { user, isAdmin } = useAuth();
  const pendentes = useQuery({ queryKey: ['rotas-pendencias', user?.id], enabled: Boolean(user), refetchInterval: 30000,
    queryFn: () => user ? pendenciasRotas(user.id) : Promise.resolve([]) });
  const aprovacoes = useQuery({ queryKey: ['rotas-aprovacoes-contagem'], enabled: isAdmin, refetchInterval: 30000,
    queryFn: async () => {
      const { count, error } = await supabase.from('rotas').select('id', { count: 'exact', head: true }).eq('status', 'aguardando_aprovacao');
      if (error) throw error;
      return count ?? 0;
    } });
  return { pendentes: pendentes.data ?? [], aprovacoes: aprovacoes.data ?? 0 };
}