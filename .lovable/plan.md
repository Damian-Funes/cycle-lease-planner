# Avisos dos movimentos das rotas (sininho + push)

Acréscimo à mesma proposta `docs/sql/push-pushalert-proposta.sql`. Nada é aplicado sem aprovação.

## O que muda para o time

| Evento | Quem recebe | Sininho | Push | Exemplo de texto |
|---|---|---|---|---|
| Rota enviada para aprovação (inclui reenvio após reprovação e replanejamento de rota aprovada) | Todos os admins | sim | sim, imediato | "Flávio enviou uma rota" · "Oeste do Paraná · 10–12/11 · 6 paradas" |
| Rota voltou para rascunho depois de enviada | Todos os admins | sim | não | "Flávio retirou a rota Oeste do Paraná da aprovação" |
| Prestação de contas concluída | Todos os admins | sim | não | "Flávio concluiu a prestação da rota Oeste do Paraná" |
| Rota aprovada | Vendedor dono | sim | sim | "Rota aprovada" · "Oeste do Paraná · 10–12/11" |
| Rota reprovada | Vendedor dono | sim | sim | "Rota reprovada" · "Motivo: …" (corta em 120 caracteres) |

Todos com link para `/rotas/<id>` (admins podem também abrir a fila `/rotas/aprovacoes`; recomendo a própria rota). Nenhum texto com R$.

Quem fez a ação não recebe aviso dele mesmo (ex.: admin que monta e envia a própria rota).

## Recomendações

- **Rota enviada**: push imediato, mas respeitando o silêncio 21h–7h (não urgente). Aprovação não é emergência; à noite ela fica guardada e chega no resumo das 7h. Se o CEO quiser receber a qualquer hora, basta marcar "urgente" nesse tipo no painel — sem mudar código.
- **Aprovada/reprovada**: push normal (também segura no silêncio). Reprovação à noite chega 7h, antes do vendedor sair.
- **Orçamento travado**: não criar aviso. O bloqueio já aparece na tela no exato momento em que a pessoa tenta, e as atividades vencidas que causam a trava já geram aviso próprio (`atividade:`). Um push extra seria repetido. Mantenho a regra `orcamento-trava:` existente desligada por padrão.

## Como evita duplicar

Cada aviso tem uma chave única por envio. Um contador por rota (`envios_aprovacao`) sobe a cada envio, então:

```text
rota-enviada:<rota>:1   1º envio
rota-reprovada:<rota>:1 reprovação desse envio
rota-enviada:<rota>:2   reenvio depois de corrigir -> novo aviso e novo push
rota-aprovada:<rota>:2
rota-rascunho:<rota>:2
rota-prestacao:<rota>   uma única vez
```

Salvar a rota de novo sem mudar status não gera nada. Como o push só sai em INSERT real, regravações nunca reenviam. Quando a rota é aprovada/reprovada/retirada, os avisos "enviada" daquele envio são marcados como lidos para todos os admins (o sininho deles se limpa sozinho).

## Riscos

- Replanejar rota aprovada (mudar parada) já volta automaticamente para "aguardando aprovação"; isso gerará novo aviso aos admins — é o desejado, mas o texto diz "reenviou" nesse caso.
- Muitos admins = um aviso por admin (hoje são poucos).
- O gatilho é tolerante: se falhar ao montar o texto, a mudança de status da rota continua (aviso nunca bloqueia a aprovação).
- Antes de aplicar confirmo se já existe algum gerador gravando `rota-aprovada`/`rota-reprovada` (a regra `rota-` existe, o gerador pode não existir) para não criar avisos em dobro.

## Detalhes técnicos (SQL a acrescentar na proposta)

```sql
-- 7) Avisos de movimentos das rotas
ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS envios_aprovacao integer NOT NULL DEFAULT 0;

-- Regras específicas (prefixo mais longo vence 'rota-')
INSERT INTO public.push_regras (prefixo, descricao, ativo, urgente) VALUES
  ('rota-enviada:',   'Rota enviada para aprovação (admins)', true,  false),
  ('rota-aprovada:',  'Sua rota foi aprovada',                true,  false),
  ('rota-reprovada:', 'Sua rota foi reprovada',               true,  false),
  ('rota-rascunho:',  'Rota retirada da aprovação',           false, false),
  ('rota-prestacao:', 'Prestação de contas concluída',        false, false)
ON CONFLICT (prefixo) DO NOTHING;

-- BEFORE UPDATE: conta o envio (roda depois de fn_rotas_autorizacao pela ordem alfabética do nome)
CREATE OR REPLACE FUNCTION public.fn_rotas_contar_envio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.status='aguardando_aprovacao' AND OLD.status IS DISTINCT FROM 'aguardando_aprovacao' THEN
    NEW.envios_aprovacao := OLD.envios_aprovacao + 1;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER trg_rotas_zz_contar_envio BEFORE UPDATE OF status ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.fn_rotas_contar_envio();

-- AFTER UPDATE: gera os avisos
CREATE OR REPLACE FUNCTION public.fn_rotas_notificar() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE vend text; periodo text; resumo text; n int := NEW.envios_aprovacao; ator uuid := auth.uid();
BEGIN
  BEGIN
    SELECT split_part(coalesce(full_name,'Vendedor'),' ',1) INTO vend FROM profiles WHERE id=NEW.vendedor_id;
    periodo := to_char(NEW.data_inicio,'DD') ||
      CASE WHEN coalesce(NEW.data_fim,NEW.data_inicio)<>NEW.data_inicio
           THEN '–'||to_char(NEW.data_fim,'DD/MM') ELSE '/'||to_char(NEW.data_inicio,'MM') END;
    resumo := coalesce(NEW.nome,'Rota')||' · '||periodo||' · '||
      (SELECT count(*) FROM rota_paradas WHERE rota_id=NEW.id)||' paradas';

    IF NEW.status='aguardando_aprovacao' AND OLD.status<>'aguardando_aprovacao' THEN
      INSERT INTO notificacoes (user_id,tipo,titulo,texto,link,chave)
      SELECT ur.user_id,'rota_enviada',
             vend||CASE WHEN n>1 THEN ' reenviou' ELSE ' enviou' END||' uma rota', resumo,
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
               ELSE 'Motivo: '||left(coalesce(NEW.motivo_reprovacao,'não informado'),120) END,
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
  EXCEPTION WHEN OTHERS THEN NULL; -- aviso nunca bloqueia a rota
  END;
  RETURN NULL;
END $$;
CREATE TRIGGER trg_rotas_notificar AFTER UPDATE ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.fn_rotas_notificar();
```

Também no código (após aprovação do SQL):
- `supabase/functions/_shared/push.ts`: espelhar os 5 novos prefixos.
- Teste unitário: chave por prefixo resolve a regra certa (`rota-enviada:` push, `rota-rascunho:` sem push) e texto sem "R$".
- Ao aplicar: conferir nomes reais das colunas (`rotas.nome`, `profiles.full_name`) e testar em BEGIN…ROLLBACK: envio → admins avisados; reprovar → vendedor com motivo e aviso do admin lido; reenviar → chave `:2`; salvar sem mudar status → nada.
