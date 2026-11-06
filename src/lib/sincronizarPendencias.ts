import { supabase } from "@/integrations/supabase/client";
let ultima = 0;
/** Recalcula as notificações de pendência das viagens do usuário. Silencioso; limitado no sino. */
export async function sincronizarPendencias(rotaId?: string, opcoes: { limitar?: boolean } = {}) {
  if (opcoes.limitar && Date.now() - ultima < 5 * 60 * 1000) return;
  ultima = Date.now();
  try { await supabase.functions.invoke("viagem-sincronizar-pendencias", { body: rotaId ? { rota_id: rotaId } : {} }); } catch { /* não bloqueia a tela */ }
}
