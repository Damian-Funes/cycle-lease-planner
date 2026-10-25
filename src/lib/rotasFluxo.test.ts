import { describe, expect, it } from 'vitest';
import { paradaInformada, prestacaoPendente, resumoMensal, validarEnvio } from './rotasFluxo';
const hoje = '2026-10-25';
const visita = { tipo: 'visita', organizacao_id: 'org', objetivo: 'apresentar LSB150' };
describe('autorização e prestação das rotas', () => {
  it('rejeita envio com data passada', () => expect(validarEnvio('2026-10-24', [visita], undefined, hoje)).toHaveLength(1));
  it('exige ao menos uma parada', () => expect(validarEnvio(hoje, [], undefined, hoje)).toHaveLength(1));
  it('exige objetivo em todas as paradas', () => expect(validarEnvio(hoje, [{ ...visita, objetivo: '  ' }], undefined, hoje)).toHaveLength(1));
  it('exige organização para visita mas não prospecção', () => {
    expect(validarEnvio(hoje, [{ ...visita, organizacao_id: null }], undefined, hoje)).toHaveLength(1);
    expect(validarEnvio(hoje, [{ ...visita, tipo: 'prospeccao', organizacao_id: null }], undefined, hoje)).toEqual([]);
  });
  it('aprovada passada bloqueia e rascunho antigo não bloqueia', () => {
    expect(prestacaoPendente({ status: 'aprovada', data_rota: '2026-10-24' }, hoje)).toBe(true);
    expect(prestacaoPendente({ status: 'rascunho', data_rota: '2026-10-24' }, hoje)).toBe(false);
    expect(prestacaoPendente({ status: 'aprovada', data_rota: hoje }, hoje)).toBe(false);
    expect(validarEnvio(hoje, [visita], { data_rota: '2026-10-24' }, hoje)).toEqual(['Preste contas da rota de 24/10 antes de pedir nova viagem.']);
  });
  it('visitada exige resultado', () => { expect(paradaInformada({ visitada: true, resultado: ' ' })).toBe(false); expect(paradaInformada({ visitada: true, resultado: 'LSB150 apresentado' })).toBe(true); });
  it('não visitada exige motivo', () => { expect(paradaInformada({ visitada: false })).toBe(false); expect(paradaInformada({ visitada: false, motivo_nao_visita: 'Cliente ausente' })).toBe(true); });
  it('null não conta como informado', () => expect(paradaInformada({ visitada: null, resultado: 'texto' })).toBe(false));
  it('dias em campo conta datas distintas por vendedor', () => {
    expect(resumoMensal([{ vendedor_id: 'v', data_rota: hoje, paradas: [{ visitada: true }] }, { vendedor_id: 'v', data_rota: hoje, paradas: [{ visitada: false }] }])).toEqual([{ vendedor_id: 'v', rotas: 2, dias: 1, visitadas: 1, naoVisitadas: 1 }]);
  });
});