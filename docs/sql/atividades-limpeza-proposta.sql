-- Zerar atividades vencidas (aplicar só após aprovação; rodar DEPOIS da migração de cobrança)
-- Conclui TODAS as abertas vencidas no momento da aplicação, inclusive as do dossiê. Futuras intactas. Nada é apagado.
-- Hoje (05/11/2026): 25 linhas.
UPDATE public.atividades
   SET concluida = true,
       situacao = 'concluida',
       data_conclusao = now(),
       resultado = 'Zerado em 05/11/2026 – recomeço'
 WHERE concluida = false
   AND coalesce(data_inicio, data_atividade) < now()
RETURNING id;
