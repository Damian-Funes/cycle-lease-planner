-- Correção dos dados da ligação c81411ce (Flávio, 06/11/2026). NÃO APLICAR sem aprovação.
-- Vendedor: 0488a4f9-5a4a-4cac-a564-beec5fb21757 | Tipo Tarefa: 18a81316-9ca6-4e3f-980c-c771b821a730
BEGIN;

-- a) Próximo passo da CORTEVAS – Londrina (parada 091c347e), 04/12/2026 9h BRT
WITH nova AS (
  INSERT INTO public.atividades(tipo, tipo_id, titulo, descricao, conteudo, data_atividade, data_inicio,
                                responsavel_id, organizacao_id, oportunidade_id, concluida, evento_automatico)
  SELECT 'tarefa', '18a81316-9ca6-4e3f-980c-c771b821a730',
         'Próximo passo: Montar apresentação com layout para o cliente',
         'Combinado na visita — ' || p.resultado, 'Combinado na visita — ' || p.resultado,
         (date '2026-12-04' + time '09:00') AT TIME ZONE 'America/Sao_Paulo',
         (date '2026-12-04' + time '09:00') AT TIME ZONE 'America/Sao_Paulo',
         '0488a4f9-5a4a-4cac-a564-beec5fb21757', 'e43700d0-5b8b-4aeb-b6b3-edb9fc53e127', p.oportunidade_id, false, false
  FROM public.rota_paradas p
  WHERE p.id = '091c347e-64b4-4aa2-a678-9aeeb8376359' AND p.atividade_id IS NULL
    AND NOT (p.relato ? 'proximo_passo')
  RETURNING id
)
UPDATE public.rota_paradas p
   SET atividade_id = nova.id,
       relato = p.relato || jsonb_build_object('proximo_passo', 'Montar apresentação com layout para o cliente', 'atividade_id', nova.id)
  FROM nova
 WHERE p.id = '091c347e-64b4-4aa2-a678-9aeeb8376359';

-- b) Contatos da Chioqueta + histórico origem 'julia'
INSERT INTO public.pessoas(nome, cargo, telefone, organizacao_id, responsavel_id, observacoes)
SELECT v.nome, 'Proprietário', v.tel, '5560da95-9ae9-4bb5-a877-e3e12f2080f1', '0488a4f9-5a4a-4cac-a564-beec5fb21757',
       'Informado pela Júlia em 06/11/2026 (correção manual da ligação)'
FROM (VALUES ('Alexandre', '65999625984'), ('Marcelo', NULL)) v(nome, tel)
WHERE NOT EXISTS (SELECT 1 FROM public.pessoas x WHERE x.organizacao_id = '5560da95-9ae9-4bb5-a877-e3e12f2080f1' AND lower(btrim(x.nome)) = lower(v.nome));

INSERT INTO public.organizacao_levantamentos(organizacao_id, origem, rota_id, autor_id, data_visita, acao,
                                             contato_nome, contato_cargo, contato_telefone, resultado)
VALUES
 ('5560da95-9ae9-4bb5-a877-e3e12f2080f1', 'julia', '59a5a3df-6daa-4704-a7a0-da8b9d6a3296', '0488a4f9-5a4a-4cac-a564-beec5fb21757',
  date '2026-11-06', 'completou', 'Alexandre', 'Proprietário', '65999625984', 'Júlia: pessoa_criada (correção da ligação c81411ce)'),
 ('5560da95-9ae9-4bb5-a877-e3e12f2080f1', 'julia', '59a5a3df-6daa-4704-a7a0-da8b9d6a3296', '0488a4f9-5a4a-4cac-a564-beec5fb21757',
  date '2026-11-06', 'completou', 'Marcelo', 'Proprietário', NULL, 'Júlia: pessoa_criada (correção da ligação c81411ce)');

SELECT public.fn_atualizar_completude('5560da95-9ae9-4bb5-a877-e3e12f2080f1');

COMMIT;

-- c) Só listar (não apagar) o placeholder da Chioqueta:
-- SELECT id, nome, telefone, celular, created_at FROM public.pessoas
--  WHERE organizacao_id = '5560da95-9ae9-4bb5-a877-e3e12f2080f1' AND nome = 'ph';
-- Resultado hoje: 853748a0-6163-49a5-b361-176bfed4e2f3 | ph | 000000 | criada 13/10/2026
