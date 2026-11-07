CREATE OR REPLACE FUNCTION public.fn_rotas_notificar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vend text; periodo text; resumo text; n int := NEW.envios_aprovacao; ator uuid := auth.uid();
BEGIN
  BEGIN
    SELECT split_part(coalesce(nullif(trim(nome),''),'Vendedor'),' ',1) INTO vend FROM profiles WHERE user_id=NEW.vendedor_id;
    vend := coalesce(vend,'Vendedor');
    periodo := CASE WHEN coalesce(NEW.data_fim,NEW.data_inicio)<>NEW.data_inicio
                    THEN to_char(NEW.data_inicio,'DD')||'–'||to_char(NEW.data_fim,'DD/MM')
                    ELSE to_char(NEW.data_inicio,'DD/MM') END;
    resumo := 'Rota '||coalesce(periodo,'')||' · '||(SELECT count(*) FROM rota_paradas WHERE rota_id=NEW.id)||' paradas';

    IF NEW.status='aguardando_aprovacao' AND OLD.status<>'aguardando_aprovacao' THEN
      INSERT INTO notificacoes (user_id,tipo,titulo,texto,link,chave)
      SELECT ur.user_id,'rota_enviada',
             vend||CASE WHEN n>1 THEN ' reenviou' ELSE ' enviou' END||' uma rota para aprovação', resumo,
             '/rotas/'||NEW.id,'rota-enviada:'||NEW.id||':'||n
        FROM user_roles ur WHERE ur.role='admin' AND ur.user_id IS DISTINCT FROM ator
      ON CONFLICT (user_id,chave) DO NOTHING;

    ELSIF OLD.status='aguardando_aprovacao' AND NEW.status IN ('aprovada','reprovada','rascunho') THEN
      UPDATE notificacoes SET lida_em=now()
       WHERE chave='rota-enviada:'||NEW.id||':'||n AND lida_em IS NULL;
      IF NEW.status='rascunho' THEN
        INSERT INTO notificacoes (user_id,tipo,titulo,texto,link,chave)
        SELECT ur.user_id,'rota_rascunho',vend||' retirou uma rota da aprovação',resumo,
               '/rotas/'||NEW.id,'rota-rascunho:'||NEW.id||':'||n
          FROM user_roles ur WHERE ur.role='admin' AND ur.user_id IS DISTINCT FROM ator
        ON CONFLICT (user_id,chave) DO NOTHING;
      ELSIF NEW.vendedor_id IS DISTINCT FROM ator THEN
        INSERT INTO notificacoes (user_id,tipo,titulo,texto,link,chave)
        VALUES (NEW.vendedor_id,'rota_'||NEW.status,
          CASE NEW.status WHEN 'aprovada' THEN 'Rota aprovada' ELSE 'Rota reprovada' END,
          CASE NEW.status WHEN 'aprovada' THEN resumo
               ELSE 'Motivo: '||left(coalesce(nullif(trim(NEW.motivo_reprovacao),''),'não informado'),120) END,
          '/rotas/'||NEW.id,'rota-'||NEW.status||':'||NEW.id||':'||n)
        ON CONFLICT (user_id,chave) DO NOTHING;
      END IF;
    END IF;

    IF NEW.prestacao_concluida_em IS NOT NULL AND OLD.prestacao_concluida_em IS NULL THEN
      INSERT INTO notificacoes (user_id,tipo,titulo,texto,link,chave)
      SELECT ur.user_id,'rota_prestacao',vend||' concluiu a prestação de contas',resumo,
             '/rotas/'||NEW.id,'rota-prestacao:'||NEW.id
        FROM user_roles ur WHERE ur.role='admin' AND ur.user_id IS DISTINCT FROM ator
      ON CONFLICT (user_id,chave) DO NOTHING;
    END IF;
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.fn_rotas_notificar() FROM PUBLIC, anon, authenticated;