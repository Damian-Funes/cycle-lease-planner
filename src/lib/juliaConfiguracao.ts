import { supabase } from '@/integrations/supabase/client';

/** Only approved trips spanning today's BRT date; no diary/expense joins needed. */
export async function listarViagensTesteJulia(hoje: string) {
  const { data, error } = await supabase.from('rotas')
    .select('id,vendedor_id,data_inicio,data_fim')
    .eq('status', 'aprovada').lte('data_inicio', hoje).gte('data_fim', hoje)
    .order('data_inicio');
  if (error) throw error;
  return data ?? [];
}