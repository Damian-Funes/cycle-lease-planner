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
