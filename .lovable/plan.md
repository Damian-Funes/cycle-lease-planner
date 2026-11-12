# Orçamentos com multinacionais — várias por negócio

## O que existe hoje
- Funis: `pipelines` (Orçamentos, Reforma, SmartCycle) + `etapas_pipeline`; negócio = `oportunidades` (pipeline, etapa, status, ultima_atividade_em); histórico em `historico_oportunidade`.
- Orçamento tem 1 cliente: `organizacao_id` + `nome_cliente` copiado; o PDF imprime `CLIENTE: <nome_cliente>`.
- Multinacionais: `organizacoes.segmento='MULTINACIONAIS'` (BASF x2, Syngenta x2, CTVA, LongPing, Biotrigo, Incotec).
- 142 orçamentos abertos (42 negócios) estão com a multinacional como cliente; o cliente final não está em lugar nenhum. ORC2026-059: BASF (V1–V4, V6, V7, negócio A), CTVA (V5, negócio B), Priori (V8, negócio A).

## Modelo novo
```text
Negócio (cliente final) ── Orçamento ORC-059 (organizacao_id = cliente final)
                          └─ Envios
                              ├─ BASF  · versão V7 · enviado 01/10 · cobrar 30/11 · negociando
                              └─ CTVA  · versão V5 · enviado 15/10 · cobrar 14/12 · enviado
```
- O orçamento e o negócio passam a ser SEMPRE do cliente final (`organizacao_id`).
- Cada envio = uma multinacional + a versão/PDF endereçado a ela + data de envio + data para cobrar + situação (enviado / negociando / venceu / perdeu).

## Antes → depois
| | Antes | Depois |
|---|---|---|
| Para quem vai | 1 cliente | Cliente final + lista de envios (0..N multinacionais) |
| PDF | CLIENTE: BASF | PDF do envio: "À BASF Agricultural Solutions — Projeto: Sementes São Francisco, Rio Verde/GO"; PDF direto igual hoje |
| Botão | — | "Enviar para multinacional" (repetível) e "Voltar para negociação direta" — vendedor e admin |
| Funil | Orçamentos | Negócio com envio ativo vai para "Multinacionais", aparece 1 vez com "via BASF, CTVA" |
| Comissão | soma por versão | 1 vez por cliente final + número; card mostra "via BASF, CTVA" |
| Ganho | — | 1 envio "venceu" → negócio ganho, demais envios viram "perdeu" automaticamente |
| CEO | — | Parados por negócio e, abrindo, por multinacional (dias desde envio / última movimentação) |

## Fluxos
- **Enviar para multinacional**: escolhe a multinacional (sugere segmento MULTINACIONAIS), data de cobrança (+60 dias). Cria nova versão do mesmo número (mesmo cliente final, itens iguais), o registro de envio apontando para ela, atividade "Cobrar retorno da <multi> sobre <orçamento>" e, no 1º envio, move o negócio para "Enviado à multinacional" (guarda funil/etapa anteriores). Mesma multinacional já com envio aberto: recusa (evita duplicata).
- **Mudar situação do envio**: negociando / venceu / perdeu. Venceu → demais envios "perdeu", negócio vai para Ganho.
- **Voltar para negociação direta**: fecha os envios abertos como "perdeu" (motivo "voltou para direto"), negócio volta ao funil/etapa anterior (sem anterior: Orçamentos › Negociação).
- Funil "Multinacionais": Enviado à multinacional → Multinacional negociando → Cliente final definido → Ganho → Perdido. A etapa acompanha o envio mais avançado.

## Casos existentes (142)
- Nada muda sozinho. Admin ganha a fila "Enviados a multinacional sem cliente final", por negócio: escolhe o cliente final uma vez → o orçamento passa a ser do cliente final e cada multinacional que aparece nas versões vira um envio (apontando para a última versão dela), situação "enviado".
- 059: se BASF e CTVA disputam a mesma sementeira, o admin escolhe o mesmo cliente final nos dois negócios e eles podem ser unidos (o negócio B vira envio CTVA do negócio A; B fica arquivado, não apagado). V8 Priori: se Priori é o cliente final, vira o cliente final do negócio A.
- Enquanto não tratados, comissão e telas seguem como hoje.

## SQL proposto (docs/sql/orcamentos-multinacional-proposta.sql — só após OK do CEO)
- Tabela `orcamento_envios`: id, oportunidade_id, orcamento_id (versão enviada), numero_base, multinacional_id, enviado_em, cobrar_em, situacao (enviado|negociando|venceu|perdeu, validada por trigger), motivo, atividade_id, criado_por, created_at, updated_at; índice único parcial (oportunidade_id, multinacional_id) onde situação aberta. GRANT authenticated/service_role, RLS espelhando quem pode ver/editar o orçamento.
- `oportunidades`: `pipeline_anterior_id`, `etapa_anterior_id`, `multinacional_desde`.
- Pipeline "Multinacionais" + 5 etapas.
- Funções transacionais: `fn_enviar_multinacional`, `fn_envio_situacao` (venceu fecha os outros), `fn_voltar_negociacao_direta`, `fn_definir_cliente_final` (fila dos legados, só admin/gerente).
- `fn_comissao_orcamentos`: ignora a versão de envio na contagem (mesmo número + cliente final = 1 linha) e devolve `via` (nomes das multinacionais com envio aberto).
- View `vw_multinacionais_paradas` (security_invoker): por negócio e por envio, dias desde envio e desde última movimentação.
- Testes em BEGIN…ROLLBACK com 059 e São Francisco: 2 envios no mesmo negócio, comissão 1 vez, venceu fecha o outro, voltar para direto.

## Riscos
- Mudar `organizacao_id` dos legados para o cliente final muda quem "vê" o orçamento por organização e a taxa (4%/5%); feito só pela fila, com confirmação.
- Unir negócios (059 A/B) mexe em atividades/histórico de B; proposta: mover só os envios e arquivar B.
- Versões extras por envio aumentam a lista de versões.
- Vendedor só envia/move o que já pode editar hoje (RLS atual); se não puder, aviso na tela.
- Relatórios por funil passam a ver esses negócios no funil novo.
- Júlia continua lendo `organizacao_id` (agora o cliente final) — é o comportamento desejado, mas muda o que ela fala nos legados tratados.
