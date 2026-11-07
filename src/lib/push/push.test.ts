import { describe, expect, it } from 'vitest';
import { decidirEnvio, emSilencio, inscritoInvalido, limparTexto, montarPush, regraDaChave } from '../../../supabase/functions/_shared/push';
import { dominioPush, estadoPlataforma } from './plataforma';

const IPHONE_17 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_2 like Mac OS X) AppleWebKit/605.1.15 Version/17.2 Mobile/15E148 Safari/604.1';
const IPHONE_16_3 = 'Mozilla/5.0 (iPhone; CPU iPhone OS 16_3 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; SM-S911B) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36';

describe('quais avisos viram push', () => {
  it('atividade vencida, "marcou para você" e ligação caída viram push', () => {
    expect(regraDaChave('atividade:abc:vencida')).not.toBeNull();
    expect(regraDaChave('julia-admin:123')).not.toBeNull();
    expect(regraDaChave('caiu:xyz')?.urgente).toBe(true);
    expect(regraDaChave('julia-recusadas:2026-11-07')?.urgente).toBe(true);
  });
  it('pendências e resumos ficam só no sininho', () => {
    expect(regraDaChave('pend:rota:2026-11-07')).toBeNull();
    expect(regraDaChave('resumo:rota')).toBeNull();
    expect(regraDaChave('desconhecido:1')).toBeNull();
  });
});

describe('avisos de rotas', () => {
  it('rota enviada, aprovada e reprovada viram push e não são urgentes', () => {
    for (const k of ['rota-enviada:r1:1', 'rota-aprovada:r1:2', 'rota-reprovada:r1:1']) {
      expect(regraDaChave(k)?.prefixo).toBe(k.split(':')[0] + ':');
      expect(regraDaChave(k)?.urgente).toBe(false);
    }
  });
  it('rascunho, prestação e trava de orçamento ficam só no sininho', () => {
    expect(regraDaChave('rota-rascunho:r1:2')).toBeNull();
    expect(regraDaChave('rota-prestacao:r1')).toBeNull();
    expect(regraDaChave('orcamento-trava:u1')).toBeNull();
  });
  it('rota enviada à noite fica para as 7h', () => {
    expect(decidirEnvio(regraDaChave('rota-enviada:r1:1'), new Date('2026-11-08T02:00:00Z'))).toBe('adiar');
  });
});

describe('horário silencioso 21h–7h (Brasília)', () => {
  it('20h59 BRT envia; 21h BRT segura; 6h59 segura; 7h envia', () => {
    expect(emSilencio(new Date('2026-11-07T23:59:00Z'))).toBe(false);
    expect(emSilencio(new Date('2026-11-08T00:00:00Z'))).toBe(true);
    expect(emSilencio(new Date('2026-11-08T09:59:00Z'))).toBe(true);
    expect(emSilencio(new Date('2026-11-08T10:00:00Z'))).toBe(false);
  });
  it('urgente sai mesmo de madrugada; normal fica para as 7h', () => {
    const madrugada = new Date('2026-11-08T05:00:00Z');
    expect(decidirEnvio(regraDaChave('caiu:1'), madrugada)).toBe('enviar');
    expect(decidirEnvio(regraDaChave('atividade:1:vencida'), madrugada)).toBe('adiar');
  });
});

describe('texto do push sem dados sensíveis', () => {
  it('remove valores em R$ e telefones, mantém a empresa', () => {
    expect(limparTexto('Cocari aprovou R$ 1.250.000,00 ligar 44 99988-7766')).toBe('Cocari aprovou ligar');
    expect(montarPush({ titulo: 'Atividade vencida: Cocari', link: '/atividades' }).url).toBe('https://crmls.com.br/atividades');
  });
  it('link externo não é aceito', () => {
    expect(montarPush({ titulo: 'x', link: '//evil.com' }).url).toBe('https://crmls.com.br/');
  });
});

describe('inscrito inválido fica inativo', () => {
  it('reconhece respostas de inscrito inexistente', () => {
    expect(inscritoInvalido(200, { success: false, msg: 'Invalid subscriber' })).toBe(true);
    expect(inscritoInvalido(500, { success: false, msg: 'Server error' })).toBe(false);
  });
  it('v2: erro de inscrito pelo código desativa', () => {
    expect(inscritoInvalido(400, { success: false, code: 'invalid_subscriber', msg: 'x' })).toBe(true);
    expect(inscritoInvalido(410, { success: false, code: 'gone' })).toBe(true);
  });
  it('v2: erro da chave/conta nunca desativa o aparelho', () => {
    expect(inscritoInvalido(403, { success: false, code: 'version_mismatch', msg: 'This API key was created for API v2 and cannot be used with API v1.' })).toBe(false);
    expect(inscritoInvalido(401, { success: false, code: 'invalid_api_key', msg: 'Invalid subscriber or key' })).toBe(false);
    expect(inscritoInvalido(429, { success: false, code: 'rate_limit', msg: 'subscriber unsubscribed' })).toBe(false);
    expect(inscritoInvalido(404, { success: false, msg: 'Not found' })).toBe(false);
  });
});

describe('plataforma e domínio', () => {
  it('iPhone no Safari precisa da Tela de Início; no app pode ativar', () => {
    expect(estadoPlataforma({ ua: IPHONE_17, standalone: false, temPush: false })).toBe('ios_fora_app');
    expect(estadoPlataforma({ ua: IPHONE_17, standalone: true, temPush: true })).toBe('pronto');
    expect(estadoPlataforma({ ua: IPHONE_16_3, standalone: true, temPush: false })).toBe('ios_antigo');
    expect(estadoPlataforma({ ua: ANDROID, standalone: false, temPush: true })).toBe('pronto');
  });
  it('push só no domínio crmls.com.br', () => {
    expect(dominioPush('crmls.com.br')).toBe(true);
    expect(dominioPush('www.crmls.com.br')).toBe(true);
    expect(dominioPush('cycle-lease-planner.lovable.app')).toBe(false);
  });
});
