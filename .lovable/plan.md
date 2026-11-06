# Atividades reais, resolvíveis e cobradas

## O que confirmei no banco
- 25 atividades abertas atrasadas: 14 "Visita planejada —" + 8 do dossiê + 3 de teste.
- As 3 de teste **não têm** "TESTE-JULIA" no título. São da organização "[TESTE] Sementes Campo Verde" (ids 32c8fee9, d36cc835, 82640cc6). A limpeza vai filtrar por esses ids.
- A tabela `atividades` só tem `concluida` (sim/não). Não existe "cancelada" nem histórico de reagendamento.
- A tabela `notificacoes` já tem chave única por usuário (`user_id, chave`) e o campo `resolvida_em`. Vamos reaproveitar.
- Quem cria a "Visita planejada" é `criarAtividadeVisita` (src/lib/rotas.ts), chamada em dois pontos de `RotaEditor.tsx` (linhas ~354 e ~478).

## 1. Parar de criar "Visita planejada"
- Remover as duas chamadas no `RotaEditor.tsx` e apagar `criarAtividadeVisita`. Paradas novas ficam com `atividade_id` vazio.
- O fechamento de visita continua como está: com `atividade_id` vazio, o gatilho de levantamento já cria uma atividade "Visita realizada" concluída.

## 2. Limpeza (SQL separado, aprovação à parte)
```sql
UPDATE public.atividades
   SET concluida = true, data_conclusao = now(), situacao = 'concluida',
       resultado = 'Limpeza: atividade automática sem ação real'
 WHERE concluida = false
   AND (titulo LIKE 'Visita planejada —%'
        OR id IN ('32c8fee9-258d-407f-89bb-80f4879b10d9',
                  'd36cc835-7e19-4537-8675-1f5314678e37',
                  '82640cc6-3556-4582-bf84-646ea5c7c1f9'));
-- esperado: 17 linhas. As 8 do dossiê não são tocadas.
```
As paradas que apontam para essas atividades continuam funcionando: o gatilho reutiliza a atividade vinculada mesmo concluída, sem criar duplicata. Vou conferir isso no banco descartável.

## 3. Resolver em 1 toque
Componente único `AcoesAtividade` com 3 botões, usado na Agenda (`Atividades.tsx`), em `ActivityFeed`/`Timeline` (organização e negócio), em `CrmWidgets` e na nova aba Atrasadas:
- **Feito**: resultado curto obrigatório (reaproveita `ConcluirAtividadeDialog`).
- **Reagendar**: nova data (não pode ser no passado) e motivo, os dois obrigatórios.
- **Cancelar**: motivo obrigatório.

As três ações gravam por funções no banco (`fn_atividade_concluir/reagendar/cancelar`). Assim o motivo e o histórico são garantidos também no futuro uso pela Júlia.

## 4. Cobrança
- **Vendedor**: uma notificação por atividade vencida (`chave = atividade:<id>:vencida`, link para a atividade).
- **Admins**: aviso quando a atividade está vencida há mais de 3 dias úteis (`atividade:<id>:escalada`). Aviso "empurrando" quando foi reagendada 3 vezes ou mais (`atividade:<id>:empurrando`).
- **Resolução automática**: um gatilho em `atividades` marca `resolvida_em` quando a atividade é concluída, cancelada ou reagendada para o futuro. A notificação "empurrando" só se resolve quando a atividade termina.
- **Quando gerar** (sem cron, como pedido antes): a função `fn_sincronizar_cobranca_atividades()` (só servidor) roda dentro de `viagem-sincronizar-pendencias`. Essa rotina já é chamada pelo sino, a cada 5 minutos no máximo. Sem limpeza de notificações: só insere as que faltam e marca as resolvidas.
- **Aba "Atrasadas" (só admin)** em `Atividades.tsx`: por vendedor, mostra quantidade, data da mais antiga, total de reagendamentos e quantas estão "empurrando". Abre a lista com as 3 ações.
- **Júlia (preparado, não ativado)**: proposta de 2 ferramentas novas, `listar_atividades_vencidas {}` e `resolver_atividade {atividade_id, acao: feito|reagendar|cancelar, resultado?, nova_data?, motivo?}`. Elas chamam as mesmas funções do banco e são documentadas em `docs/julia-viagem-elevenlabs.md`, na seção "Futuro — não colar". O prompt e o código de produção ficam como estão.

## 5. As 8 do dossiê
Entram automaticamente: a cobrança vai para o responsável atual de cada uma (Murilo/Renan).

## Detalhes técnicos — migração proposta
```sql
ALTER TABLE public.atividades
  ADD COLUMN situacao text NOT NULL DEFAULT 'aberta',      -- aberta|concluida|cancelada
  ADD COLUMN motivo_cancelamento text,
  ADD COLUMN reagendamentos integer NOT NULL DEFAULT 0;
UPDATE public.atividades SET situacao='concluida' WHERE concluida;
-- cancelada também fica concluida=true para os leitores antigos sumirem com ela da agenda

CREATE TABLE public.atividade_reagendamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  atividade_id uuid NOT NULL REFERENCES public.atividades(id) ON DELETE CASCADE,
  data_anterior timestamptz, data_nova timestamptz NOT NULL,
  motivo text NOT NULL, autor_id uuid, origem text NOT NULL DEFAULT 'app', -- app|julia
  created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.atividade_reagendamentos TO authenticated;
GRANT ALL ON public.atividade_reagendamentos TO service_role;
ALTER TABLE public.atividade_reagendamentos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "ver reagendamentos de atividade visível" ON public.atividade_reagendamentos
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.atividades a WHERE a.id = atividade_id));
-- sem insert direto: só pelas funções

-- fn_atividade_concluir(p_id, p_resultado), fn_atividade_reagendar(p_id, p_data, p_motivo),
-- fn_atividade_cancelar(p_id, p_motivo): SECURITY DEFINER, exigem texto com 3+ caracteres,
-- conferem se quem chama é o responsável, admin ou gerente (ou service_role com p_autor, pensando na Júlia),
-- gravam situacao/resultado/log e somam reagendamentos.
-- Gatilho fn_atividade_reagendar_guarda: se data_atividade mudar em atividade aberta fora da função
-- (ex.: arrastar no calendário), registra mesmo assim no log com motivo 'alterado na edição'.
-- Assim nada é sobrescrito em silêncio.
-- fn_dias_uteis_entre(a date, b date) (seg–sex, sem feriados).
-- fn_sincronizar_cobranca_atividades(): insere as notificações com ON CONFLICT (user_id, chave)
--   DO UPDATE SET resolvida_em = NULL quando a atividade volta a vencer; marca as resolvidas.
-- Gatilho AFTER UPDATE em atividades: resolve as notificações da atividade.
```
O SQL completo vai em `docs/sql/atividades-cobranca-proposta.sql`. A limpeza vai em `docs/sql/atividades-limpeza-proposta.sql`. Os dois são testados num banco descartável antes de aplicar. Testes: regra de 3 dias úteis, limite de 3 reagendamentos e motivo obrigatório.

## Arquivos
- `src/lib/rotas.ts`, `src/pages/RotaEditor.tsx`: remover a criação automática.
- novo `src/lib/atividadesAcoes.ts` (+ teste), novo `src/components/atividade/AcoesAtividade.tsx`, `ReagendarDialog.tsx`, `CancelarAtividadeDialog.tsx`.
- `Atividades.tsx` (ações + aba Atrasadas), `ActivityFeed.tsx`, `Timeline.tsx`, `CrmWidgets.tsx`, `ConcluirAtividadeDialog.tsx` (resultado obrigatório).
- `useAtividadesBadge.ts`, `Relatorios.tsx`: ignorar canceladas.
- `supabase/functions/viagem-sincronizar-pendencias`: chamar a sincronização da cobrança.
- `docs/julia-viagem-elevenlabs.md`: seção "Futuro" com as 2 ferramentas.

## Dúvidas
1. Cancelada: guardar com `concluida=true` + `situacao='cancelada'` (mais seguro para as telas atuais)? Sugiro que sim.
2. Dias úteis: só segunda a sexta, sem feriados, está bom?
3. Arrastar no calendário conta como reagendamento sem motivo, ou devemos obrigar o motivo também (abrindo o diálogo)? Sugiro obrigar.
4. Escalonamento: só para admins ou também para o gerente comercial?
