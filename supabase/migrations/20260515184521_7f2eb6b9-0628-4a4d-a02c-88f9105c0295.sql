update public.propostas
set nome_cliente = 'LS-B150 - Sementes Batovi',
    cliente_cnpj = '28.124.693/0001-43',
    organizacao_id = null,
    oportunidade_id = null,
    updated_at = now()
where id = 'a6630332-f2fa-4baf-a60a-8401a0c50c8d';

update public.propostas
set nome_cliente = 'LS-B130 - Batovi',
    cliente_cnpj = null,
    organizacao_id = null,
    oportunidade_id = null,
    updated_at = now()
where id = 'f7123f04-1eee-4b19-84f7-8e3d1ea20738';

update public.oportunidades
set valor_estimado = 282804.36,
    updated_at = now()
where id = '014882f9-fc70-4159-96ef-c58e8ed5da95';