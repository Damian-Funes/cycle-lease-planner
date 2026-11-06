import { describe, expect, it } from 'vitest';
import { chavePendencia, faltasLevantamento, montarPendencias, pendenciasNotificaveis, resumoAdmin, type ContextoPendencias } from './pendenciasDia';
import { mensagemBusca, mensagemVinculo } from '../../supabase/functions/julia-viagem-ferramentas/organizacao';
import { segmentoBR, ufBR, normalizarBody } from '../../supabase/functions/julia-viagem-ferramentas/entrada';
const base = (paradas: ContextoPendencias['paradas'], fim = '2026-11-06'): ContextoPendencias => ({ id: 'r1', data_inicio: '2026-11-05', data_fim: fim, paradas, pernoites: [{ id: 'n', noite: '2026-11-05', tipo: 'sem_custo', gasto_id: null }], gastos: [] });
const completo = { contato_nome: 'Arno', sacos_safra: 1, equipamento_atual: 'x', problema_principal: 'y', interesse: 'alto', concorrente: 'z', proximo_passo: 'Reunião', proximo_passo_data: '2026-11-20' };
describe('pendências pós-ligação (fonte única)', () => {
  it('visita sem data de próximo passo gera aviso com a empresa', () => {
    const p = pendenciasNotificaveis(base([{ id: 'p1', visitada: true, organizacao_id: 'o', organizacao: { nome: 'Costa Beber' }, relato: { ...completo, proximo_passo_data: undefined } }]), '2026-11-05');
    expect(p.map(x => x.titulo)).toEqual(['Defina a data do próximo passo com Costa Beber']);
  });
  it('debrief incompleto lista todos os pontos faltantes numa só pendência', () => {
    const p = pendenciasNotificaveis(base([{ id: 'p1', visitada: true, organizacao_id: 'o', organizacao: { nome: 'X' }, relato: { contato_nome: 'A', interesse: 'alto', equipamento_atual: 'e', problema_principal: 'p', proximo_passo_data: '2026-11-20' } }]), '2026-11-05');
    expect(p).toHaveLength(1); expect(p[0].titulo).toBe('Complete o levantamento de X: faltou sacos/safra e concorrente/objeções');
  });
  it('faltasLevantamento aceita decisores no lugar do contato e objeções no lugar do concorrente', () => {
    expect(faltasLevantamento({ decisores: 'B', objecoes: ['preço'] })).toEqual(['sacos/safra', 'equipamento', 'problema', 'interesse']);
  });
  it('visita de prospecção sem empresa pede vínculo pela cidade', () => {
    const p = pendenciasNotificaveis(base([{ id: 'p1', visitada: true, cidade: 'Patos de Minas', organizacao_id: null, relato: completo }]), '2026-11-05');
    expect(p.map(x => x.titulo)).toEqual(['Vincule a visita de Patos de Minas a uma empresa']);
  });
  it('paradas restantes só no último dia', () => {
    const ctx = base([{ id: 'p1', visitada: null }]);
    expect(pendenciasNotificaveis(ctx, '2026-11-05').map(x => x.tipo)).toEqual([]);
    expect(pendenciasNotificaveis(ctx, '2026-11-06').map(x => x.tipo)).toEqual(['paradas_restantes']);
  });
  it('visita completa não gera pendência; resolver remove da lista', () => {
    expect(pendenciasNotificaveis(base([{ id: 'p1', visitada: true, organizacao_id: 'o', relato: completo }]), '2026-11-05')).toEqual([]);
  });
  it('sem a opção completo, a Júlia de discagem vê só as pendências antigas', () => {
    expect(montarPendencias(base([{ id: 'p1', visitada: true, organizacao_id: null }]), '2026-11-05').map(x => x.tipo)).toEqual([]);
  });
  it('chave estável por viagem/tipo/item', () => expect(chavePendencia('r1', { tipo: 'parada_sem_empresa', id: 'p1', titulo: '', detalhe: '' })).toBe('pend:r1:parada_sem_empresa:p1'));
  it('resumo do admin', () => expect(resumoAdmin('Murilo', base([{ id: 'p1', visitada: true, organizacao_id: null, cidade: 'Patos' }, { id: 'p2', visitada: true, organizacao_id: 'o', relato: completo }]), '2026-11-05')).toBe('Murilo fechou o dia: 2 visitas, 1 pendência'));
});
describe('buscar/vincular organização', () => {
  it('frase de busca com matriz', () => expect(mensagemBusca([{ id: '1', nome: 'Sementes São Francisco', cidade: 'Rio Verde', uf: 'GO', matriz: null, matriz_id: null }])).toContain('1) Sementes São Francisco (Rio Verde/GO)'));
  it('busca vazia oferece cadastro', () => expect(mensagemBusca([])).toContain('cadastrar como nova'));
  it('vínculo de filial criada', () => expect(mensagemVinculo({ nome: 'SF Patos', criada: true }, true)).toBe('Criei a filial SF Patos como lead e vinculei a parada.'));
  it('vínculo repetido', () => expect(mensagemVinculo({ nome: 'SF', ja_vinculada: true }, false)).toContain('já estava vinculada'));
  it('UF falada', () => { expect(ufBR('Minas Gerais')).toBe('MG'); expect(ufBR('go')).toBe('GO'); expect(ufBR('Atlântida')).toBeUndefined(); });
  it('segmento falado', () => { expect(segmentoBR('sementeira')).toBe('SEMENTEIRA PRIVADA'); expect(segmentoBR('cooperativa')).toBe('COOPERATIVAS'); expect(segmentoBR('banco')).toBeUndefined(); });
  it('criar normaliza UF e descarta segmento inválido com aviso', () => {
    const avisos: string[] = [];
    expect(normalizarBody({ acao: 'vincular_organizacao', criar: { nome: 'SF Patos', uf: 'minas gerais', segmento: 'banco', matriz_id: '' } }, '2026-11-05', avisos)).toEqual({ acao: 'vincular_organizacao', criar: { nome: 'SF Patos', uf: 'MG' } });
    expect(avisos).toContain('Segmento descartado: fora da lista.');
  });
});
