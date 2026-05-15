-- Apaga card duplicado no SmartCycle (será recriado se necessário a partir do orçamento)
DELETE FROM historico_oportunidade WHERE oportunidade_id='09c68928-4c7a-49c8-a815-5537a026d14e';
DELETE FROM atividades WHERE oportunidade_id='09c68928-4c7a-49c8-a815-5537a026d14e';
DELETE FROM oportunidades WHERE id='09c68928-4c7a-49c8-a815-5537a026d14e';

-- Vincula organização LAR ao orçamento ORC2026-001
UPDATE orcamentos
SET organizacao_id='e36ac7af-a99a-461f-b682-66dcaa84d5e7'
WHERE id='c74d6bd5-4ecc-49d8-98c9-aba372148270';