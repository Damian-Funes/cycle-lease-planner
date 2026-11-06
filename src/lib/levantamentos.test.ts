import { describe, expect, it } from 'vitest';
import { dataCurta, informadoPor } from './levantamentos';
describe('levantamentos', () => {
  it('data curta DD/MM', () => expect(dataCurta('2026-11-05')).toBe('05/11'));
  it('informado por autor e data', () => expect(informadoPor({ data: '2026-11-05', autor_id: 'u1' }, { u1: 'Flávio' })).toBe('informado por Flávio em 05/11'));
});
