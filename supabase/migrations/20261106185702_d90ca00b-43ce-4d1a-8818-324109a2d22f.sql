DO $$
DECLARE org uuid := 'e43700d0-5b8b-4aeb-b6b3-edb9fc53e127'; n int;
BEGIN
  -- Trava: a filial só sai se nada além do que a ligação criou depende dela.
  IF EXISTS (SELECT 1 FROM oportunidades WHERE organizacao_id=org) OR EXISTS (SELECT 1 FROM orcamentos WHERE organizacao_id=org)
     OR EXISTS (SELECT 1 FROM pessoas WHERE organizacao_id=org AND id<>'c69c0abf-d4de-46bf-a5d3-40df9c6520e9')
     OR EXISTS (SELECT 1 FROM rota_paradas WHERE organizacao_id=org AND id<>'091c347e-64b4-4aa2-a678-9aeeb8376359')
     OR EXISTS (SELECT 1 FROM organizacoes WHERE matriz_id=org) OR EXISTS (SELECT 1 FROM propostas WHERE organizacao_id=org)
     OR EXISTS (SELECT 1 FROM diagnosticos_tecnicos WHERE organizacao_id=org) OR EXISTS (SELECT 1 FROM layouts WHERE organizacao_id=org) THEN
    RAISE EXCEPTION 'CORTEVAS – Londrina tem outros vínculos; reset abortado.';
  END IF;
END $$;

-- Travas de imutabilidade (diário, parada contabilizada) não se aplicam a este reset aprovado.
SET LOCAL session_replication_role = replica;

UPDATE public.rota_paradas SET visitada=NULL, informada_em=NULL, dia=NULL, relato=NULL, resultado=NULL, motivo_nao_visita=NULL, atividade_id=NULL, organizacao_id=NULL
 WHERE id='091c347e-64b4-4aa2-a678-9aeeb8376359';
DELETE FROM public.atividades WHERE id='7795f3e4-e055-46b7-b056-9dcdec142093';
DELETE FROM public.organizacao_levantamentos WHERE id='4935aae6-4028-4869-880f-d007f96636de' OR organizacao_id='e43700d0-5b8b-4aeb-b6b3-edb9fc53e127';
DELETE FROM public.rota_diario WHERE id IN ('45a92c97-50e2-4215-b72c-55cccd9bd606','fc8e1991-f68f-4bba-a89d-679682677e1b');
DELETE FROM public.notificacoes WHERE id IN ('175f6efd-1ddb-41c1-b287-7babf04e396e','c0eb73cf-a3fd-4a11-b9f3-a3f055d2e335');
DELETE FROM public.pessoas WHERE id='c69c0abf-d4de-46bf-a5d3-40df9c6520e9';
DELETE FROM public.organizacoes WHERE id='e43700d0-5b8b-4aeb-b6b3-edb9fc53e127';

SET LOCAL session_replication_role = origin;