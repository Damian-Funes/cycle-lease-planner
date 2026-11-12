# Orçamentos com multinacionais (BASF, Syngenta, CTVA…)

## O que encontrei hoje
- Funis: `pipelines` (Orçamentos, Reforma, SmartCycle) + `etapas_pipeline`; negócio = `oportunidades` (pipeline_id, etapa_id, status, ultima_atividade_em, responsavel_id); histórico em `historico_oportunidade`.
- Orçamento tem UM cliente só: `organizacao_id` + `nome_cliente` (e endereço/CNPJ copiados). O PDF imprime `CLIENTE: <nome_cliente>`.
- Multinacionais já identificáveis por `organizacoes.segmento='MULTINACIONAIS'` (BASF x2, Syngenta x2, CTVA, LongPing, Biotrigo, Incotec).
- **142 orçamentos abertos (42 negócios) estão gravados com a multinacional como cliente** — o cliente final não está registrado em lugar nenhum. Ex.: ORC2026-059 V1–V4/V6/V7 = BASF, V5 = CTVA (outro negócio), V8 = Priori.

## Antes → depois
| | Antes | Depois |
|---|---|---|
| Orçamento | 1 cliente | "Enviado para" (= `organizacao_id`, como hoje) + "Cliente final" (novo `cliente_final_id`; vazio = igual ao enviado para) |
| PDF | CLIENTE: BASF | "À BASF Agricultural Solutions — Projeto: Sementes São Francisco, Rio Verde/GO" (sem cliente final, igual hoje) |
| Negócio | fica em "Orçamento Enviado"/Negociação | Botão "Passar para multinacional" → funil "Multinacionais" + atividade de cobrança |
| Comissão | taxa pelo cliente do orçamento | taxa/"cliente antigo" pelo cliente final (fallback: enviado para); card mostra "via BASF" |
| Admin | — | Lista "Parados com multinacionais" por dias, do mais parado |

Escolha: manter `organizacao_id` como "Enviado para" para não quebrar PDF, buscas, Júlia, permissões e as 142 linhas existentes; só acrescenta o cliente final.

## Botões (vendedor e admin)
- **Passar para multinacional**: escolhe a multinacional (sugere segmento MULTINACIONAIS primeiro, busca em todas), cliente final (pré-preenchido com o cliente atual) e data de cobrança (+60 dias). Cria nova versão do mesmo número (Vn+1) com enviado para = multinacional e cliente final mantido; move o negócio para "Enviado à multinacional"; cria atividade "Cobrar retorno da <multi> sobre <orçamento>".
- **Voltar para negociação direta**: nova versão com enviado para = cliente final; negócio volta ao funil/etapa de antes (guardados no negócio; se não houver, Orçamentos › Negociação).
- Funil novo "Multinacionais": Enviado à multinacional → Multinacional negociando → Cliente final definido → Ganho → Perdido.

## Casos existentes (sem quebrar nada)
- Nada é alterado automaticamente: as 142 linhas continuam válidas (cliente final vazio = vale o enviado para, comissão igual a hoje).
- Admin ganha a fila "Orçamentos enviados a multinacional sem cliente final" agrupada por negócio, para escolher o cliente final uma vez (grava em todas as versões abertas do negócio) e opcionalmente mover para o funil novo.
- ORC2026-059: BASF (V1–V7 exceto V5) e CTVA (V5) entram nessa fila; V8 Priori não é multinacional e fica como está. A regra de "última versão por número + organização" da comissão continua, agora usando o cliente final quando existir.

## Visão do CEO
Em /comissoes (admin) ou no CRM: tabela "Multinacionais paradas" — negócio, vendedor, multinacional, cliente final, dias desde a entrada no funil e dias desde a última movimentação, ordenada do mais parado, com atalho para o negócio.

## SQL proposto (docs/sql/orcamentos-multinacional-proposta.sql — só após OK do CEO)
- `orcamentos.cliente_final_id uuid null references organizacoes(id)`.
- `oportunidades`: `multinacional_id`, `multinacional_desde timestamptz`, `pipeline_anterior_id`, `etapa_anterior_id`.
- INSERT do pipeline "Multinacionais" + 5 etapas.
- `fn_passar_multinacional(orcamento_id, multinacional_id, cliente_final_id, cobrar_em)` e `fn_voltar_negociacao_direta(orcamento_id)` (security invoker, respeitam RLS atual; transação única: versão + negócio + atividade + histórico).
- `fn_comissao_orcamentos`: taxa e cliente antigo via `coalesce(cliente_final_id, organizacao_id)` e agrupamento pela mesma chave; devolve também `enviado_para_nome`.
- View `vw_multinacionais_paradas` (security_invoker) com os dias.
- Testado antes em BEGIN…ROLLBACK com o 059 e São Francisco.

## Riscos
- Versão nova por troca de destinatário aumenta o número de versões (é o pedido do CEO).
- RLS: vendedor só cria versão/move negócio se já pode hoje; se o negócio for de outro, o botão falha (mostrar aviso).
- Escolher o cliente final errado nos legados muda a taxa (4%/5%) daquele orçamento.
- Pipeline novo aparece nos filtros/telas de funil já existentes; checar que relatórios por pipeline não somem com esses negócios.
- Júlia e PDF antigos continuam lendo `organizacao_id` = enviado para (comportamento atual).
