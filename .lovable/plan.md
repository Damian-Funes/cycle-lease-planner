# Júlia vincula a empresa na ligação + Matriz/Filial

Nada é aplicado sem sua aprovação explícita do SQL. O SQL fica em `docs/sql/julia-organizacao-proposta.sql`, testado antes num banco descartável.

## Estado atual verificado
- A parada `36ed1829` (viagem `d9ef2fbe`, Murilo, aprovada de 05/11 a 06/11) é de prospecção em Patos de Minas/MG e não tem organização. Ela já está visitada e o relato está completo: Rander, Bonilio, 500.000 sacos, LS-150 BASF, Momesu, interesse alto. Não tem atividade planejada.
- A matriz `f0f044ab` (Sementes São Francisco) fica em Rio Verde/GO e o responsável é o Murilo.
- `organizacoes` aceita estes valores:
  - **segmento:** COOPERATIVAS, MULTINACIONAIS, SEMENTEIRA PRIVADA, PRODUTOR RURAL, REVENDA;
  - **status:** lead, prospect, ativo, inativo, perdido;
  - **CNPJ:** único;
  - **tags:** lista de textos.
  
  Ainda não existe nenhum vínculo de matriz.
- **Ponto crítico:** hoje, trocar `organizacao_id` de uma parada conta como mudança de planejamento. Em viagem aprovada e em andamento, isso **devolve a viagem para "aguardando aprovação"**. Além disso, o gatilho do levantamento só reage a `visitada`/`relato`. Os dois pontos precisam de ajuste.
- A busca por semelhança de texto (pg_trgm) já está instalada.

## O que muda para o usuário
- Na Organização:
  - aparece "Filial de X" (com link) ou a lista "Filiais";
  - admin e gerente podem definir a matriz;
  - o Levantamento técnico da matriz mostra também as filiais, agrupado por unidade.
- A Júlia, numa parada de prospecção sem empresa, pergunta qual empresa foi visitada, busca a empresa e confirma a unidade. Então vincula a uma existente ou cria uma filial ou um lead, e só depois registra a visita.
- Vincular a empresa durante a viagem **não** pede nova aprovação da viagem.
- O caso de hoje (São Francisco – Patos de Minas) é corrigido e aparece nas duas fichas.

## Plano por arquivo
- `docs/sql/julia-organizacao-proposta.sql` (abaixo).
- `supabase/functions/julia-viagem-ferramentas/schema.ts`: schemas zod `buscar_organizacao` e `vincular_organizacao`, com `.strip()` e as mesmas normalizações. Por exemplo, "São Paulo" vira `uf` "SP", e o segmento é aceito sem acento ou caixa.
- `supabase/functions/julia-viagem-ferramentas/entrada.ts`: aceitar as 2 ações novas e normalizar `uf` e `segmento`. Um segmento inválido é descartado com aviso, sem dar 400.
- `supabase/functions/julia-viagem-ferramentas/respostas.ts`: frases como "Encontrei 2: Sementes São Francisco (Rio Verde/GO, matriz)…", "Parada vinculada à Sementes São Francisco – Patos de Minas." e "Criei a filial … como lead.". Mantém `salvo` e `mensagem`.
- `supabase/functions/julia-viagem-ferramentas/index.ts`: roteia as ações para as RPCs novas, só service role, com as mesmas regras de segredo, ligação válida e ligação ativa. Repetir a mesma vinculação responde 200 ("já estava vinculada").
- `src/lib/juliaFerramentasEntrada.test.ts` e `respostas` tests: casos novos.
- `src/lib/juliaOrganizacaoBanco.test.ts` (banco descartável):
  - vincular não devolve a viagem para aprovação;
  - vincular uma parada já visitada gera o levantamento;
  - não cria ciclo nem filial de filial;
  - recusa parada de outra viagem ou parada com organização diferente;
  - a busca respeita a visibilidade;
  - repetir não duplica;
  - segmento inválido é recusado.
- `src/components/organizacao/MatrizFiliais.tsx` (novo): "Filial de X" / "Filiais", e um seletor de matriz para admin e gerente.
- `src/pages/OrganizacaoDetalhe.tsx`: mostra o bloco acima na coluna lateral.
- `src/components/organizacao/LevantamentoTecnico.tsx` e `src/lib/levantamentos.ts`: incluir as filiais (consulta por `organizacao_id in [matriz, filiais]`) e agrupar por unidade. A situação atual mostra um bloco por unidade.
- `docs/julia-viagem-elevenlabs.md`: roteiro e schemas novos (abaixo).
- `AGENTS.md`: regra sobre matriz/filial em um nível e sobre vincular empresa a uma parada sem organização sem contar como replanejamento.

## SQL completo (proposta)
```sql
-- 1. Matriz/filial (um nível)
ALTER TABLE public.organizacoes ADD COLUMN IF NOT EXISTS matriz_id uuid REFERENCES public.organizacoes(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_organizacoes_matriz ON public.organizacoes(matriz_id) WHERE matriz_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_organizacoes_nome_trgm ON public.organizacoes
  USING gin (lower(public.unaccent_simple(coalesce(nome,'')||' '||coalesce(nome_fantasia,''))) gin_trgm_ops);

CREATE OR REPLACE FUNCTION public.fn_organizacoes_matriz_validar() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF NEW.matriz_id IS NULL THEN RETURN NEW; END IF;
  IF NEW.matriz_id = NEW.id THEN RAISE EXCEPTION 'Uma organização não pode ser filial de si mesma.'; END IF;
  IF EXISTS (SELECT 1 FROM organizacoes WHERE id = NEW.matriz_id AND matriz_id IS NOT NULL) THEN
    RAISE EXCEPTION 'A matriz escolhida já é filial de outra organização.'; END IF;
  IF EXISTS (SELECT 1 FROM organizacoes WHERE matriz_id = NEW.id) THEN
    RAISE EXCEPTION 'Esta organização tem filiais e não pode virar filial.'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_organizacoes_matriz ON public.organizacoes;
CREATE TRIGGER trg_organizacoes_matriz BEFORE INSERT OR UPDATE OF matriz_id ON public.organizacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_organizacoes_matriz_validar();

-- 2. Vincular empresa a parada sem organização NÃO é replanejamento
--    (protecao e reaprovacao: troca o critério de planejamento)
--    Regra nova: mudança apenas de organizacao_id de NULL -> valor não conta como planejamento.
--    (as duas funções são recriadas idênticas às atuais, trocando só a expressão `planejamento`:)
--    planejamento := ROW(<campos atuais sem organizacao_id>) IS DISTINCT FROM ROW(<OLD...>)
--                    OR (OLD.organizacao_id IS NOT NULL AND NEW.organizacao_id IS DISTINCT FROM OLD.organizacao_id);
--    O texto completo das duas funções vai no arquivo, copiado da definição em produção com só essa linha alterada.

-- 3. Levantamento também ao vincular uma parada já visitada
CREATE OR REPLACE FUNCTION public.fn_paradas_levantamento() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.visitada IS TRUE AND NEW.organizacao_id IS NOT NULL THEN
    BEGIN
      IF TG_OP = 'INSERT' OR OLD.visitada IS DISTINCT FROM TRUE
         OR (OLD.organizacao_id IS NULL) THEN
        PERFORM fn_registrar_levantamento_parada(NEW.id, 'visita_rota', NULL);
      ELSIF NEW.relato IS DISTINCT FROM OLD.relato
        AND EXISTS (SELECT 1 FROM organizacao_levantamentos WHERE parada_id = NEW.id AND origem = 'visita_rota') THEN
        PERFORM fn_registrar_levantamento_parada(NEW.id, 'manual', auth.uid());
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'levantamento da parada % falhou: %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS trg_paradas_levantamento ON public.rota_paradas;
CREATE TRIGGER trg_paradas_levantamento AFTER INSERT OR UPDATE OF visitada, relato, organizacao_id ON public.rota_paradas
FOR EACH ROW EXECUTE FUNCTION public.fn_paradas_levantamento();
REVOKE ALL ON FUNCTION public.fn_paradas_levantamento() FROM PUBLIC, anon, authenticated;

-- 4. Busca (service-only; visibilidade do vendedor da ligação)
CREATE OR REPLACE FUNCTION public.julia_buscar_organizacao(p_ligacao uuid, p_texto text, p_cidade text DEFAULT NULL, p_uf text DEFAULT NULL)
RETURNS TABLE(id uuid, nome text, cidade text, uf text, matriz_id uuid, matriz_nome text, similaridade real)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE v_vend uuid; q text := lower(unaccent_simple(btrim(coalesce(p_texto,''))));
BEGIN
  SELECT vendedor_id INTO v_vend FROM ligacoes_viagem WHERE ligacoes_viagem.id = p_ligacao
    AND status IN ('discando','em_andamento');
  IF v_vend IS NULL THEN RAISE EXCEPTION 'Ligação inválida ou encerrada.'; END IF;
  IF length(q) < 3 THEN RAISE EXCEPTION 'Diga pelo menos 3 letras do nome da empresa.'; END IF;
  RETURN QUERY
  SELECT o.id, coalesce(o.nome_fantasia, o.nome), o.cidade, e.sigla, o.matriz_id, coalesce(m.nome_fantasia, m.nome),
         similarity(lower(unaccent_simple(coalesce(o.nome,'')||' '||coalesce(o.nome_fantasia,''))), q)
           + CASE WHEN p_cidade IS NOT NULL AND lower(unaccent_simple(o.cidade)) = lower(unaccent_simple(p_cidade)) THEN 0.3 ELSE 0 END
           + CASE WHEN p_uf IS NOT NULL AND e.sigla = upper(p_uf) THEN 0.1 ELSE 0 END
  FROM organizacoes o
  LEFT JOIN estados e ON e.id = o.estado_id
  LEFT JOIN organizacoes m ON m.id = o.matriz_id
  WHERE pode_ver_organizacao(v_vend, o.estado_id, o.responsavel_id)
    AND (lower(unaccent_simple(coalesce(o.nome,'')||' '||coalesce(o.nome_fantasia,''))) % q
         OR lower(unaccent_simple(coalesce(o.nome,'')||' '||coalesce(o.nome_fantasia,''))) LIKE '%'||q||'%')
  ORDER BY 7 DESC LIMIT 5;
END $$;
REVOKE ALL ON FUNCTION public.julia_buscar_organizacao(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.julia_buscar_organizacao(uuid,text,text,text) TO service_role;

-- 5. Vincular / criar (service-only, transacional)
CREATE OR REPLACE FUNCTION public.julia_vincular_organizacao(p_ligacao uuid, p_parada uuid, p_organizacao uuid DEFAULT NULL, p_criar jsonb DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE l ligacoes_viagem; p rota_paradas; r rotas; v_org uuid; v_estado uuid; v_seg text; v_nome text; v_criada boolean := false;
BEGIN
  SELECT * INTO l FROM ligacoes_viagem WHERE id = p_ligacao AND status IN ('discando','em_andamento');
  IF l.id IS NULL THEN RAISE EXCEPTION 'Ligação inválida ou encerrada.'; END IF;
  SELECT * INTO p FROM rota_paradas WHERE id = p_parada AND rota_id = l.rota_id FOR UPDATE;
  IF p.id IS NULL THEN RAISE EXCEPTION 'Parada não pertence a esta viagem.'; END IF;
  SELECT * INTO r FROM rotas WHERE id = p.rota_id;
  IF r.status <> 'aprovada' THEN RAISE EXCEPTION 'A viagem não está aprovada.'; END IF;
  IF p.tipo = 'pernoite' THEN RAISE EXCEPTION 'Pernoite não tem empresa.'; END IF;

  IF p_organizacao IS NOT NULL THEN
    IF NOT EXISTS (SELECT 1 FROM organizacoes o WHERE o.id = p_organizacao
                   AND pode_ver_organizacao(r.vendedor_id, o.estado_id, o.responsavel_id)) THEN
      RAISE EXCEPTION 'Empresa não encontrada para este vendedor.'; END IF;
    v_org := p_organizacao;
  ELSIF p_criar IS NOT NULL THEN
    v_nome := NULLIF(btrim(p_criar->>'nome'), '');
    IF v_nome IS NULL OR length(v_nome) > 200 THEN RAISE EXCEPTION 'Informe o nome da empresa.'; END IF;
    SELECT id INTO v_estado FROM estados WHERE sigla = upper(p_criar->>'uf');
    IF v_estado IS NULL THEN RAISE EXCEPTION 'Informe a UF da empresa.'; END IF;
    v_seg := CASE WHEN p_criar->>'segmento' IN ('COOPERATIVAS','MULTINACIONAIS','SEMENTEIRA PRIVADA','PRODUTOR RURAL','REVENDA')
                  THEN p_criar->>'segmento' END;
    INSERT INTO organizacoes (nome, cidade, estado, estado_id, segmento, status, responsavel_id, tags, matriz_id)
    VALUES (v_nome, NULLIF(btrim(p_criar->>'cidade'),''), upper(p_criar->>'uf'), v_estado, v_seg, 'lead',
            r.vendedor_id, ARRAY['julia','incompleto'], fn_uuid_seguro(p_criar->>'matriz_id'))
    RETURNING id INTO v_org;
    v_criada := true;
  ELSE
    RAISE EXCEPTION 'Informe a empresa existente ou os dados para criar.';
  END IF;

  IF p.organizacao_id = v_org THEN
    RETURN jsonb_build_object('organizacao_id', v_org, 'ja_vinculada', true, 'criada', false);
  END IF;
  IF p.organizacao_id IS NOT NULL THEN RAISE EXCEPTION 'Esta parada já tem outra empresa; corrija pelo CRM.'; END IF;

  UPDATE rota_paradas SET organizacao_id = v_org WHERE id = p.id;  -- gatilho gera levantamento se já visitada
  RETURN jsonb_build_object('organizacao_id', v_org, 'ja_vinculada', false, 'criada', v_criada,
    'nome', (SELECT coalesce(nome_fantasia, nome) FROM organizacoes WHERE id = v_org),
    'levantamento_id', (SELECT id FROM organizacao_levantamentos WHERE parada_id = p.id AND origem = 'visita_rota'));
END $$;
REVOKE ALL ON FUNCTION public.julia_vincular_organizacao(uuid,uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.julia_vincular_organizacao(uuid,uuid,uuid,jsonb) TO service_role;

-- 6. Correção pontual de hoje (idempotente)
DO $$
DECLARE v_org uuid; v_mg uuid := 'd9bc8913-9997-40a3-a666-bc2402d5c595';
BEGIN
  SELECT id INTO v_org FROM organizacoes WHERE matriz_id = 'f0f044ab-53c2-4b13-b0f9-5e526b2f36eb'
    AND lower(unaccent_simple(cidade)) = 'patos de minas' LIMIT 1;
  IF v_org IS NULL THEN
    INSERT INTO organizacoes (nome, cidade, estado, estado_id, segmento, status, responsavel_id, tags, matriz_id)
    VALUES ('Sementes São Francisco – Patos de Minas', 'Patos de Minas', 'MG', v_mg,
            (SELECT segmento FROM organizacoes WHERE id = 'f0f044ab-53c2-4b13-b0f9-5e526b2f36eb'),
            'lead', '14138b1c-5b33-4a66-b0f0-fc06e58da561', ARRAY['julia','incompleto'],
            'f0f044ab-53c2-4b13-b0f9-5e526b2f36eb')
    RETURNING id INTO v_org;
  END IF;
  UPDATE rota_paradas SET organizacao_id = v_org
   WHERE id = '36ed1829-6c24-459c-94ce-67706bdd0379' AND organizacao_id IS NULL;
  -- Bonilio (citado em decisores, não é o contato): cria como decisor se não existir
  IF NOT EXISTS (SELECT 1 FROM pessoas WHERE organizacao_id = v_org AND lower(unaccent_simple(nome)) = 'bonilio') THEN
    INSERT INTO pessoas (nome, cargo, organizacao_id, responsavel_id, e_decisor)
    VALUES ('Bonilio', 'Diretor-geral', v_org, '14138b1c-5b33-4a66-b0f0-fc06e58da561', true);
  ELSE
    UPDATE pessoas SET e_decisor = true WHERE organizacao_id = v_org AND lower(unaccent_simple(nome)) = 'bonilio';
  END IF;
END $$;
```

**Resultado esperado da correção:**
- 1 organização-filial;
- a parada vinculada, sem reaprovar a viagem;
- 1 levantamento com Rander, 500.000 sacos, LS-150 BASF, Momesu e interesse alto;
- Rander cadastrado como Gerente da UBS e de produção, não decisor;
- Bonilio cadastrado como Diretor-geral, decisor;
- 1 atividade "Visita realizada", porque a parada não tinha atividade.

## Schemas das ferramentas novas (ElevenLabs)
```json
{
  "name": "buscar_organizacao",
  "description": "Busca empresas visíveis ao vendedor pelo nome. Use quando a parada não tem empresa ou o vendedor citar uma empresa. Retorna até 5 opções com cidade, UF e matriz.",
  "parameters": {
    "type": "object",
    "properties": {
      "acao": { "type": "string", "enum": ["buscar_organizacao"] },
      "ligacao_id": { "type": "string" },
      "rota_id": { "type": "string" },
      "texto": { "type": "string", "description": "Nome falado pelo vendedor (mín. 3 letras)" },
      "cidade": { "type": "string" },
      "uf": { "type": "string", "description": "Sigla, ex.: MG" }
    },
    "required": ["acao", "ligacao_id", "rota_id", "texto"]
  }
}
```
```json
{
  "name": "vincular_organizacao",
  "description": "Vincula a parada a uma empresa existente (organizacao_id) OU cria uma nova (criar). Para outra unidade de empresa existente, crie com matriz_id. Chame antes de registrar_visita. Nunca peça CNPJ.",
  "parameters": {
    "type": "object",
    "properties": {
      "acao": { "type": "string", "enum": ["vincular_organizacao"] },
      "ligacao_id": { "type": "string" },
      "rota_id": { "type": "string" },
      "parada_id": { "type": "string" },
      "organizacao_id": { "type": "string", "description": "Id retornado por buscar_organizacao" },
      "criar": {
        "type": "object",
        "properties": {
          "nome": { "type": "string" },
          "cidade": { "type": "string" },
          "uf": { "type": "string" },
          "matriz_id": { "type": "string", "description": "Id da matriz, se for filial" },
          "segmento": { "type": "string", "enum": ["COOPERATIVAS","MULTINACIONAIS","SEMENTEIRA PRIVADA","PRODUTOR RURAL","REVENDA"], "description": "Só se o vendedor disser" }
        },
        "required": ["nome", "uf"]
      }
    },
    "required": ["acao", "ligacao_id", "rota_id", "parada_id"]
  }
}
```

## Acréscimos ao prompt
- **Parada sem empresa:** pergunte "Qual empresa você visitou?" e chame `buscar_organizacao`. Confirme a unidade, por exemplo "É a Sementes São Francisco de Rio Verde ou outra unidade?".
  - Se for a mesma unidade, vincule pelo id.
  - Se for outra unidade, crie com `matriz_id` e a cidade da parada.
  - Se não existir, crie como lead.
  - Só então chame `registrar_visita`. Nunca peça CNPJ.
- **Próximo passo com período:** proponha a data-limite do período, por exemplo "semana que vem ou a outra" vira a sexta da semana seguinte à próxima. Confirme ("Fica até sexta, 20/11, certo?") e grave. Insista no máximo 1 vez; se ele não definir, registre sem data.

## Impacto
- Só a troca de empresa de "nenhuma" para "uma" deixa de pedir reaprovação. Trocar uma empresa por outra continua pedindo.
- Paradas com empresa, as travas de prestação e as funções antigas da Júlia não mudam.
- A busca e o vínculo usam a visibilidade do vendedor da ligação, então a Júlia nunca revela empresa de outro território.
- O CNPJ continua vazio. A tag `incompleto` permite filtrar as empresas para completar depois.

## Item 5: "O que faltou" vira notificações

### Estado atual verificado
- A tabela `notificacoes` já tem a chave única (usuário, chave) e as regras de acesso de leitura e de marcar como lida. Não existe regra para o próprio usuário criar notificações. Hoje só aparece o tipo `julia_viagem`.
- As regras de pendência ficam em uma função única, `montarPendencias`, que hoje cobre 3 tipos: parada pendente, onde dormiu e nota do hotel. A Júlia já usa essa função em `listar_pendentes`.
- O sino só lê e marca como lida. A gravação de notificações hoje acontece no servidor, ignorando duplicadas.

### Proposta (simples e robusta)
- **Uma única fonte de regras:** `montarPendencias` ganha 4 tipos novos, e tanto a Júlia quanto as notificações usam esta função. Os tipos novos são:
  - `proximo_passo_sem_data`
  - `levantamento_incompleto`, que lista quais dos 6 pontos faltaram
  - `parada_sem_empresa`
  - `paradas_restantes`, só no último dia

  `nota_hotel` continua como está.
- **Sincronizar em vez de só criar:** uma função `sincronizarNotificacoes(db, rota)` em `_shared` calcula as pendências da viagem e então:
  - grava as que faltam (cada item tem uma chave fixa, ex.: `pend:<rota>:<tipo>:<id>`);
  - **marca como resolvidas** as notificações daquela viagem cujo item não aparece mais.
  
  Nada é apagado: a notificação fica com "resolvida em" e some da contagem do sino.
- **Quando sincroniza:**
  1. no fim da ligação (`julia-viagem-webhook`, depois de `julia_finalizar_ligacao`);
  2. ao fechar o dia pela tela (`ViagemHoje`/Encerrar);
  3. ao abrir o sino, no máximo 1 vez a cada 5 minutos, só para as viagens do próprio vendedor no período.
  
  Assim, depois que o vendedor resolve algo, a notificação some no próximo fechamento do dia ou na próxima abertura do sino, sem gatilhos espalhados pelo banco.
  - Os itens 2 e 3 usam uma função nova, `viagem-sincronizar-pendencias`. Ela confere o login, aceita só o vendedor da viagem ou o admin, e grava com acesso de servidor.
- **Resumo para o admin:** só no webhook e só em ligação concluída (fora testes). A chave é `resumo:<ligacao>`, para não duplicar. O texto é "<Vendedor> fechou o dia: X visitas, Y pendências", com link para `/viagens/<rota>/acompanhar`.
- **Mensagens e links do vendedor:**
  - **a)** "Defina a data do próximo passo com <empresa>", com link para a parada na viagem.
  - **b)** "Complete o levantamento de <empresa>: faltou sacos/safra e concorrente", com link para a parada. Os 6 pontos são: contato/decisor, sacos/safra, equipamento, problema, interesse e concorrente/objeções.
  - **c)** "Vincule a visita de <cidade> a uma empresa", com link para a parada.
  - **d)** A nota do hotel continua como hoje.
  - **e)** "Informe as paradas que faltam antes de encerrar", com link para `/viagens/<rota>/hoje`.

  Ficam fora: viagens de teste e paradas não visitadas. Os itens b) e c) valem só para paradas visitadas.

### Arquivos (acréscimo)
- `supabase/functions/_shared/pendenciasDia.ts`: tipos novos, função pura `faltasLevantamento(relato)`, `montarPendencias(contexto, data, { posLigacao })`, e `chavePendencia()` / `mensagemPendencia()` puras. O contexto passa a incluir `tipo`, `relato` e `organizacao_id` da parada.
- `supabase/functions/_shared/notificacoesViagem.ts` (novo): `sincronizarNotificacoes()` e `resumoAdmin()`.
- `supabase/functions/julia-viagem-webhook/index.ts`: chama a sincronização e o resumo depois de finalizar.
- `supabase/functions/julia-viagem-ferramentas/index.ts`: `listar_pendentes` usa os mesmos tipos novos, para a Júlia cobrar na ligação o mesmo que vira notificação.
- `supabase/functions/viagem-sincronizar-pendencias/index.ts` (novo): confere o login, aceita só o dono da viagem ou o admin.
- `src/lib/pendenciasDia.ts`: reexporta. Testes em `src/lib/pendenciasDia.test.ts`:
  - cada um dos tipos de a) a e);
  - chave estável;
  - item resolvido sai da lista.
- `src/lib/notificacoesViagemBanco.test.ts` (banco descartável):
  - gravar a mesma notificação duas vezes não duplica;
  - item resolvido fica marcado;
  - vendedor não lê a notificação de outro.
- `src/components/NotificacoesSino.tsx`: esconde as resolvidas da contagem e mostra "Resolvida" em cinza, além de chamar a sincronização com limite de frequência.
- `src/components/viagens/ViagemHoje.tsx` (fechar o dia): chama a sincronização depois de salvar.

### SQL (acréscimo ao mesmo arquivo)
```sql
-- 7. Notificações: vínculo com viagem e resolução automática
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS rota_id uuid REFERENCES public.rotas(id) ON DELETE CASCADE;
ALTER TABLE public.notificacoes ADD COLUMN IF NOT EXISTS resolvida_em timestamptz;
CREATE INDEX IF NOT EXISTS notificacoes_rota_abertas_idx
  ON public.notificacoes(rota_id, user_id) WHERE resolvida_em IS NULL;
-- Gravação continua só pelo servidor (service_role); usuário segue só lendo/marcando lida.
GRANT ALL ON public.notificacoes TO service_role;
-- Usuário não pode "desresolver" nem trocar vínculo: UPDATE do usuário limitado a lida_em
CREATE OR REPLACE FUNCTION public.fn_notificacoes_usuario_so_lida() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF auth.role() = 'authenticated' AND ROW(NEW.user_id, NEW.chave, NEW.rota_id, NEW.resolvida_em, NEW.titulo, NEW.texto, NEW.link)
     IS DISTINCT FROM ROW(OLD.user_id, OLD.chave, OLD.rota_id, OLD.resolvida_em, OLD.titulo, OLD.texto, OLD.link) THEN
    RAISE EXCEPTION 'Só é possível marcar a notificação como lida.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_notificacoes_so_lida ON public.notificacoes;
CREATE TRIGGER trg_notificacoes_so_lida BEFORE UPDATE ON public.notificacoes
FOR EACH ROW EXECUTE FUNCTION public.fn_notificacoes_usuario_so_lida();
```
Gravação e resolução, feitas pelo servidor:
- **gravar o que falta:** grava com a chave e, se a notificação já existir, reabre (`resolvida_em = null`) só quando o item voltou a faltar;
- **resolver o que sumiu:** `update notificacoes set resolvida_em = now() where rota_id = $1 and resolvida_em is null and chave like 'pend:%' and chave <> all($2)`.

## Perguntas
1. **Segmento da filial criada por voz:** herdar o segmento da matriz quando o vendedor não disser? Proposta: sim. Na correção de hoje, já herda.
2. **Decisores citados que não são o contato** (como o Bonilio): cadastro só nesta correção ou passo a regra a valer sempre? Proposta: sempre que `decisores` trouxer um nome claro com cargo; caso contrário, nada.
3. **Responsável pela filial nova:** o vendedor da ligação, ou o mesmo responsável da matriz? Proposta: o vendedor.
4. **Quem define a matriz pela tela:** só admin e gerente, ou também o responsável pela organização? Proposta: admin e gerente.
