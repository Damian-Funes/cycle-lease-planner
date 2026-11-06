-- Limpeza pontual (aplicar só após aprovação; rodar DEPOIS da migração de cobrança)
-- Esperado: 17 linhas (14 "Visita planejada —" + 3 testes da Júlia antiga). As 8 do dossiê não são tocadas.
UPDATE public.atividades
   SET concluida = true,
       situacao = 'concluida',
       data_conclusao = now(),
       resultado = 'Limpeza: atividade automática sem ação real'
 WHERE concluida = false
   AND (titulo LIKE 'Visita planejada —%'
        OR id IN ('32c8fee9-258d-407f-89bb-80f4879b10d9',
                  'd36cc835-7e19-4537-8675-1f5314678e37',
                  '82640cc6-3556-4582-bf84-646ea5c7c1f9'));
