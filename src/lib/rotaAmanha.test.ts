import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

// Exercise the existing function with fake clock/query/email dependencies, never real sends.
async function consultar(agora: string) {
  const filtros: Record<string, string> = {};
  let handler: (() => Promise<unknown>) | undefined;
  class Clock extends Date {
    constructor(value?: string | number) { super(value ?? agora); }
  }
  const query = {
    select: () => query,
    eq: (campo: string, valor: string) => { filtros[campo] = valor; return query; },
    then: (resolve: (value: { data: unknown[] }) => void) => resolve({ data: [] }),
  };
  const source = readFileSync('supabase/functions/notify-rota-amanha/index.ts', 'utf8').replace(/^import .*;\r?\n/gm, '');
  const js = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None } }).outputText;
  runInNewContext(js, {
    Date: Clock, Intl, Response,
    corsHeaders: {}, adminClient: { from: () => query },
    Deno: { serve: (fn: () => Promise<unknown>) => { handler = fn; } },
  });
  if (!handler) throw new Error('Função não registrada');
  await (handler as (req: { method: string }) => Promise<unknown>)({ method: 'POST' });
  return filtros;
}
describe('e-mail da rota de amanhã', () => {
  it('consulta somente rotas aprovadas', async () => {
    expect((await consultar('2026-10-25T12:00:00Z')).status).toBe('aprovada');
  });
  it('amanhã é calculado em São Paulo, inclusive depois das 21h e na virada do mês', async () => {
    expect((await consultar('2026-10-25T00:00:00Z')).data_rota).toBe('2026-10-25');
    expect((await consultar('2026-11-01T02:59:59Z')).data_rota).toBe('2026-11-01');
    expect((await consultar('2026-11-01T03:00:00Z')).data_rota).toBe('2026-11-02');
  });
});