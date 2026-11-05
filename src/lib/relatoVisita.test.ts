import { describe, expect, it } from 'vitest';
import { extrairRelato } from '../../supabase/functions/_shared/relatoVisita';
describe('relato de visita', () => {
 const hoje = '2026-11-05';
 it('preserva só chaves conhecidas e nunca aceita id de atividade do agente', () => expect(extrairRelato({ contato_nome: ' Ana ', sacos_safra: 0, interesse: 'alto', atividade_id: 'forjado', segredo: 'x' }, hoje)).toEqual({ contato_nome: 'Ana', sacos_safra: 0, interesse: 'alto' }));
 it('limita textos a 500 caracteres', () => { expect(() => extrairRelato({ decisores: 'a'.repeat(501) }, hoje)).toThrow(); expect(extrairRelato({ decisores: 'a'.repeat(500) }, hoje).decisores?.length).toBe(500); });
 it('sacos precisa ser número finito não negativo', () => { for (const sacos_safra of [-1, Infinity, '100']) expect(() => extrairRelato({ sacos_safra }, hoje)).toThrow(); });
 it('valida interesse e cada objeção', () => { expect(() => extrairRelato({ interesse: 'quente' }, hoje)).toThrow(); expect(() => extrairRelato({ objecoes: ['a'.repeat(501)] }, hoje)).toThrow(); });
 it('recusa data passada e data inexistente, permite hoje BRT', () => { for (const proximo_passo_data of ['2026-11-04', '2026-02-30']) expect(() => extrairRelato({ proximo_passo_data }, hoje)).toThrow(); expect(extrairRelato({ proximo_passo_data: hoje }, hoje).proximo_passo_data).toBe(hoje); });
});