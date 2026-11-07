export type EstadoPlataforma =
  | 'ios_fora_app'      // iPhone/iPad no Safari: precisa Adicionar à Tela de Início
  | 'ios_antigo'        // iOS < 16.4: não suporta web push
  | 'pronto'            // pode pedir permissão pelo botão
  | 'nao_suportado';

export type Plataforma = 'ios' | 'android' | 'desktop';

export function plataformaDe(ua: string, maxTouchPoints = 0): Plataforma {
  if (/iPhone|iPad|iPod/i.test(ua) || (/Macintosh/i.test(ua) && maxTouchPoints > 1)) return 'ios';
  if (/Android/i.test(ua)) return 'android';
  return 'desktop';
}

export function versaoIOS(ua: string): number | null {
  const m = ua.match(/OS (\d+)[_.](\d+)/);
  return m ? Number(m[1]) + Number(m[2]) / 100 : null;
}

export function estadoPlataforma(o: { ua: string; maxTouchPoints?: number; standalone: boolean; temPush: boolean }): EstadoPlataforma {
  const p = plataformaDe(o.ua, o.maxTouchPoints);
  if (p === 'ios') {
    const v = versaoIOS(o.ua);
    if (v !== null && v < 16.04) return 'ios_antigo';
    if (!o.standalone) return 'ios_fora_app';
  }
  return o.temPush ? 'pronto' : 'nao_suportado';
}

export const DOMINIOS_PUSH = ['crmls.com.br', 'www.crmls.com.br'];
export const dominioPush = (host: string) => DOMINIOS_PUSH.includes(host.toLowerCase());

export const userAgentCurto = (ua: string) => ua.replace(/\s+/g, ' ').slice(0, 120);
