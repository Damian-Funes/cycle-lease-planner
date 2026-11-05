import { beforeEach, describe, expect, it, vi } from 'vitest';
const { from, query } = vi.hoisted(() => {
  const query = { select: vi.fn(), eq: vi.fn(), lte: vi.fn(), gte: vi.fn(), order: vi.fn() };
  return { from: vi.fn(() => query), query };
});
vi.mock('@/integrations/supabase/client', () => ({ supabase: { from } }));
import { listarViagensTesteJulia } from './juliaConfiguracao';
describe('Viagens reais para teste da Júlia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const method of [query.select, query.eq, query.lte, query.gte]) method.mockReturnValue(query);
  });
  it('consulta somente aprovadas com período incluindo hoje em BRT', async () => {
    const viagem = { id: 'viagem-real', vendedor_id: 'vendedor', data_inicio: '2026-11-04', data_fim: '2026-11-06' };
    query.order.mockResolvedValue({ data: [viagem], error: null });
    expect(await listarViagensTesteJulia('2026-11-05')).toEqual([viagem]);
    expect(from).toHaveBeenCalledWith('rotas');
    expect(query.eq).toHaveBeenCalledWith('status', 'aprovada');
    expect(query.lte).toHaveBeenCalledWith('data_inicio', '2026-11-05');
    expect(query.gte).toHaveBeenCalledWith('data_fim', '2026-11-05');
  });
  it('propaga falha de consulta para exibir o erro, sem fingir lista vazia', async () => {
    const error = { message: 'Acesso recusado', code: '42501' };
    query.order.mockResolvedValue({ data: null, error });
    await expect(listarViagensTesteJulia('2026-11-05')).rejects.toEqual(error);
  });
});