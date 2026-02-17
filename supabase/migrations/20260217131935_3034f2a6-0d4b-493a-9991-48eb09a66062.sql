
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS contato_nome text;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS cliente_endereco text;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS cliente_telefone text;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS cliente_cnpj text;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS cliente_email text;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS validade_dias integer DEFAULT 10;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS local_entrega text;
ALTER TABLE propostas ADD COLUMN IF NOT EXISTS numero_proposta text;
