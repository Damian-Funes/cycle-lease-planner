# Separar pedidos de preço das propostas reais

## Situação verificada
- Hoje há 224 orçamentos; 223 já têm deal e **48 deals têm mais de um orçamento**.
- Status de deal usados: `aberta`, `ganha`, `perdida` — não vamos criar um novo.
- O deal automático é criado em `Orcamento.tsx` via `criarOportunidadeAuto` (Reforma e Index também usam, mas não serão alterados).
- O funil é lido em: CRM, Home (widgets), Relatórios, Atividades, DealDetalhe, OportunidadeSheet/Form, Rotas, Diagnóstico, AdminPipelines.

## Mecanismo proposto para tirar do funil
Nova coluna `oportunidades.fora_do_funil boolean not null default false`, **calculada pelo banco** (o vendedor não edita):

Um deal fica `fora_do_funil = true` somente quando TODAS forem verdade:
1. tem pelo menos um orçamento;
2. todos os orçamentos dele são `referencia` (nenhum `projeto`, nenhum ainda "a classificar");
3. não tem proposta SmartCycle nem orçamento de Reforma vinculados;
4. não tem atividade manual (só notas automáticas) nem pessoas vinculadas manualmente além das automáticas;
5. está `aberta` (ganho/perdido nunca some dos relatórios históricos).

Caso contrário fica `false`. Deals sem orçamento e deals de orçamentos "a classificar" ficam como hoje.

Por que é seguro: nada é apagado, status não muda, triggers/relatórios existentes continuam funcionando; basta voltar o tipo para "projeto" (ou o deal ganhar atividade real) e ele reaparece automaticamente. Para desfazer tudo, remover o filtro da coluna.

Recalculado por trigger quando: orçamento é criado/alterado (tipo ou deal), atividade é criada/alterada, deal muda de status.

Telas de funil passam a filtrar `fora_do_funil = false`: quadro do CRM, widgets da Home, Relatórios/forecast. Abrir o deal por link direto (DealDetalhe, orçamento) continua funcionando, com aviso "Fora do funil — referência de preço".

## Banco (migration idempotente)
- `orcamentos.tipo_pedido text` com CHECK (`referencia`,`projeto`) ou nulo; existentes ficam nulos.
- Trigger BEFORE INSERT em `orcamentos`: recusa tipo nulo ("Escolha Referência de preço ou Proposta de projeto").
- Em UPDATE: permite trocar entre referência/projeto e classificar nulo; não permite voltar para nulo.
- Coluna `fora_do_funil` + função `fn_recalcular_fora_do_funil(opp_id)` (SECURITY DEFINER) + triggers acima. Backfill não altera nada (todos nulos ⇒ false).
- Índice em `orcamentos(tipo_pedido)` e `oportunidades(fora_do_funil)`.

## Tela do orçamento
- Ao salvar orçamento novo ou "a classificar": diálogo com dois cartões grandes:
  - "Referência de preço — só quer saber valores, não entra no funil"
  - "Proposta de projeto — negociação real, entra no funil"
- Só "Projeto" chama `criarOportunidadeAuto`. Referência salva sem deal; PDF igual.
- Badge do tipo no cabeçalho; botão "Converter em proposta de projeto" (cria/vincula deal com a lógica atual) e "Converter em referência" com confirmação (deal sai do funil pela regra acima, se aplicável).
- Lista em `PropostasUnificadasModal`: badge + filtro (Todos / Referência / Projeto / A classificar).
- Diagnóstico continua opcional.

## Classificação dos antigos
- Nova rota `/orcamentos/classificar`: orçamentos nulos do próprio vendedor (`responsavel_id`), mais antigos primeiro; cliente, segmento da organização, número, valor, data, link. Botões Referência | Projeto por linha e seleção múltipla em lote.
  - Classificar "Projeto" em orçamento sem deal cria o deal; com deal, mantém.
- Admin: filtro por vendedor + resumo classificados x pendentes por vendedor.
- Banner na Home: "Você tem N orçamentos para classificar", some ao zerar.

## Relatórios
Card em `/relatorios`: referência x projeto x a classificar — quantidade e valor, por vendedor.

## Não muda
Cálculo, itens e PDF do orçamento, Típicos, Diagnóstico, Rotas, Atividades, Reforma.

## Detalhes técnicos
- Arquivos: `Orcamento.tsx`, novo `TipoPedidoDialog.tsx`, `TipoPedidoBadge.tsx`, `src/lib/tipoPedido.ts` (rótulos + helper `filtrarFunil`), `PropostasUnificadasModal.tsx`, nova página `ClassificarOrcamentos.tsx` + rota em `App.tsx`, `Home.tsx` (banner + filtros widgets), `Crm.tsx`, `Relatorios.tsx`, `DealDetalhe.tsx` (aviso). Tipos Supabase regenerados.
- Testes:
  - banco (Postgres descartável, migration rodada 2x): insert sem tipo recusado; existente nulo pode ser classificado; deal só com referências fica fora; deal com um orçamento projeto permanece; deal com atividade manual permanece; voltar para projeto reaparece; deal ganho nunca fica fora.
  - unitários: referência não chama `criarOportunidadeAuto`; converter referência→projeto chama e vincula deal; filtro do funil exclui `fora_do_funil`.
- Entrega: SQL completa, lista de arquivos e resultado dos testes.
