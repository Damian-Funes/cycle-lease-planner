// Wrapper do PushAlert (script carregado só em crmls.com.br pelo index.html).
import { supabase } from '@/integrations/supabase/client';
import { dominioPush, plataformaDe, userAgentCurto } from './plataforma';

type PA = { forceSubscribe?: () => void; getSubsInfo?: () => { status?: string; subscriber_id?: string; subs_id?: string } | undefined };
declare global { interface Window { pushalertbyiw?: unknown[]; PushAlertCo?: PA } }

export const pushDisponivelAqui = () => typeof window !== 'undefined' && dominioPush(location.hostname) && window.self === window.top;
export const standalone = () => window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
export const temPushNoNavegador = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

function fila() { return (window.pushalertbyiw = window.pushalertbyiw || []); }

/** Espera o script do PushAlert (até ~8 s). */
export async function pushAlertPronto(ms = 8000): Promise<PA | null> {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (window.PushAlertCo) return window.PushAlertCo; await new Promise(r => setTimeout(r, 200)); }
  return null;
}

export function subscriberAtual(): string | null {
  const i = window.PushAlertCo?.getSubsInfo?.();
  return i?.status === 'subscribed' ? (i.subscriber_id ?? i.subs_id ?? null) : null;
}

export async function registrarAparelho(subscriberId: string, userId: string) {
  const ua = navigator.userAgent;
  const { error } = await (supabase as any).rpc('fn_push_registrar', { p_subscriber: subscriberId, p_plataforma: plataformaDe(ua, navigator.maxTouchPoints), p_user_agent: userAgentCurto(ua) });
  if (error) throw error;
  fila().push(['addAttributes', { user_id: userId }]);
}

/** Pede a permissão (só chamar a partir de um toque no botão). Resolve com o subscriber ID. */
export function ativarPush(): Promise<string> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Sem resposta do navegador. Tente de novo.')), 60000);
    fila().push(['onSuccess', (r: { subscriber_id?: string }) => { clearTimeout(timer); r?.subscriber_id ? resolve(r.subscriber_id) : reject(new Error('Inscrição sem ID.')); }]);
    fila().push(['onFailure', () => { clearTimeout(timer); reject(new Error('Permissão negada ou indisponível.')); }]);
    pushAlertPronto().then(pa => {
      if (!pa?.forceSubscribe) { clearTimeout(timer); reject(new Error('Serviço de notificações não carregou.')); return; }
      const ja = subscriberAtual(); if (ja) { clearTimeout(timer); resolve(ja); return; }
      pa.forceSubscribe();
    });
  });
}

export async function desativarAparelhoAtual() {
  if (!pushDisponivelAqui()) return;
  const id = subscriberAtual(); if (!id) return;
  await (supabase as any).rpc('fn_push_desativar', { p_subscriber: id });
}

/** Ao abrir o app logado: se este aparelho já está inscrito, confirma o vínculo com o usuário atual. */
export async function sincronizarAparelho(userId: string) {
  if (!pushDisponivelAqui()) return;
  const pa = await pushAlertPronto(); if (!pa) return;
  const id = subscriberAtual(); if (id) await registrarAparelho(id, userId).catch(() => undefined);
}
