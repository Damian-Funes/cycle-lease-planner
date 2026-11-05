# Júlia só para vendedores — fechamento do dia por voz

## Estado atual verificado
- Único ponto que chama `julia-iniciar-ligacao`: `src/components/JuliaLigarButton.tsx`, usado só em `src/pages/Orcamento.tsx:615`.
- `profiles` não tem celular. `viagem_parametros` tem só preços de combustível.
- Não existe tabela de notificação in-app (só `email_notification_*`).
- `fn_pernoites_validar` exige hoje gasto de hotel **com** `arquivo_path` para tipo `hotel`.
- Extensões `pg_cron` e `pg_net` já instaladas. `supabase/functions/` não contém as funções `julia-*` (e continuará sem elas).

## 1. Fim das ligações para clientes (só frontend)
- `src/pages/Orcamento.tsx`: remover `<JuliaLigarButton>` e import.
- `src/components/JuliaLigarButton.tsx`: apagar.
- Histórico (`useLigacoesJulia`, aba de ligações no orçamento/deal, "Motivos de perda (Júlia)") fica só leitura, sem mudança.
- A função `julia-iniciar-ligacao` publicada fora daqui não é tocada; recomendo você despublicá-la na origem (o CRM deixa de chamar).

## 2. Celular dos vendedores
- Nova coluna `profiles.celular` (E.164 `^\+55\d{10,11}$`, validada no banco).
- `src/pages/ConfiguracoesViagens.tsx`: seção "Celulares dos vendedores" (lista de vendedores com veículo/rotas, campo com máscara, salva em E.164) + horário da ligação + botão "Ligar agora" (por vendedor e todos).
- `src/lib/telefone.ts` (puro, testado): `normalizarCelularBR`, `validarE164BR`.
- Só admin edita `celular` (policy + trigger que bloqueia mudança de `celular` por não-admin no próprio perfil).

## 3. Funções novas (este repositório)
`supabase/functions/_shared/juliaViagem.ts` — contexto do vendedor (rota de hoje, pendentes, visitadas hoje), data BRT, whitelist.

### `julia-viagem-ligar`
- Entrada: `{ modo: "cron" }` (header `x-cron-secret` = `JULIA_CRON_SECRET`) ou `{ modo: "manual", vendedor_id? }` (JWT de admin).
- Cron processa: (a) primeira ligação quando hora BRT ≥ `ligacao_hora`; (b) `ligacoes_viagem` com `status='agendada'` e `agendada_para <= now()`; (c) às 9h BRT, notificações de dia não fechado.
- Seleciona rotas `aprovada` com `hoje BRT` entre `data_inicio` e `data_fim`, sem `rota_pernoites` da noite de hoje (noite só existe se hoje < `data_fim`; no último dia o critério é "nenhuma parada informada hoje e ainda há pendentes").
- **Whitelist**: o número discado sai só de `profiles.celular` do `vendedor_id` da rota, que precisa ter papel `comercial`/`rtv`; qualquer outro número é recusado com erro gravado. Nunca recebe número no corpo.
- Uma ligação por vendedor por dia, no máximo 3 tentativas totais (inicial + 1 de não atendeu + retornos pedidos), bloqueio por índice único `(vendedor_id, data_ref, tentativa)`.
- Chama ElevenLabs `POST /v1/convai/twilio/outbound-call` com `ELEVENLABS_AGENT_ID_VIAGEM`, `ELEVENLABS_PHONE_NUMBER_ID` e `conversation_initiation_client_data.dynamic_variables`: `vendedor_nome`, `vendedor_id`, `rota_id`, `rota_nome`, `data_hoje` (DD/MM), `noite` (AAAA-MM-DD), `ultimo_dia` (sim/não), `paradas_pendentes` (texto "id | nome | cidade-UF" por linha), `visitadas_hoje`, `ligacao_id`.

### `julia-viagem-ferramentas`
- Header `x-julia-secret` = `JULIA_TOOL_SECRET` (comparação em tempo constante). Valida `ligacao_id` + `rota_id` pertencendo à mesma ligação ativa (impede a ferramenta mexer em outra viagem).
- Grava com service role mas **reproduz o usuário**: `autor_id` = vendedor; datas BRT; os triggers existentes (`fn_paradas_protecao`, `fn_pernoites_validar`) continuam como autoridade. Erros do banco voltam em texto para a Júlia ler ao vendedor.
- Ferramentas: `listar_pendentes`, `registrar_visita`, `registrar_pernoite`, `agendar_retorno` (schemas abaixo).
- `registrar_visita` cria o informativo no `rota_diario` com o resultado/motivo (equivalente ao fluxo do ConcluirAtividadeDialog: status da parada + resultado; atividade vinculada concluída como hoje).

### `julia-viagem-webhook`
- Verifica `ElevenLabs-Signature` (`t=...,v0=...`, HMAC-SHA256 de `t.body` com `JULIA_WEBHOOK_SECRET`, tolerância 30 min) — mesmo padrão ElevenLabs.
- `post_call_transcription`: grava `resumo`, `transcricao`, `duracao_s`, `status='concluida'`; insere `rota_diario` "Ligação da Júlia: <resumo>". Se houver pernoite `aguardando_nota`, cria notificação ao vendedor com link `/viagens/:id/hoje?nota=<gasto_id>`.
- `call_initiation_failure` / não atendeu: `status='nao_atendeu'` e agenda 1 retentativa +30 min (se ainda < 22h BRT).

`supabase/config.toml`: `verify_jwt = false` nas três (validação no código).

## 4. Hotel por voz — estado "aguardando nota"
- `rota_gastos.arquivo_path` continua opcional; o gasto de hotel criado por voz nasce sem foto.
- `fn_pernoites_validar` passa a aceitar gasto de hotel **sem** foto (exige gasto de hotel da mesma rota). Pendência = gasto hotel vinculado a pernoite com `arquivo_path IS NULL`.
- Novo trigger em `rotas` (separado, não reescreve `fn_rotas_autorizacao`): ao passar para `concluida`, recusa se existir pernoite hotel com nota faltando: "Envie a foto da nota do hotel da noite de DD/MM."
- UI: `ViagemHoje`/`RelatorioDiaDialog` mostram "Nota pendente" com botão "Enviar foto" (reaproveita upload/compressão atual); `ViagemAcompanhar` sinaliza pendência ao admin.

## 5. Notificações in-app
- Tabela `notificacoes` (usuário, título, texto, link, lida_em).
- `src/components/NotificacoesSino.tsx` no cabeçalho (`AppLayout`): contador + lista, marca como lida.
- Geradas pelas funções: dia não fechado às 9h (vendedor + todos admins), nota de hotel pendente, falha de ligação (admin).

## 6. Admin
- `src/pages/ViagensAndamento.tsx`: coluna "Ligação de hoje" (status/tentativas) e "Ligar agora".
- `src/pages/ViagemAcompanhar.tsx`: lista de ligações da viagem com resumo e transcrição.
- `src/lib/juliaViagem.ts` + `src/hooks/useLigacoesViagem.ts` (leitura).

## 7. Agendamento (cron)
- Recomendação: um único job a cada 10 min só nas janelas 18h–22h e 9h BRT (~30 execuções/dia). Necessário porque o horário é configurável, há retentativa de 30 min e retorno no horário pedido. Atraso máximo de 10 min; fora das janelas não roda. Alternativa mais barata: a cada 30 min (atraso até 30 min).
- Como o backend é seu Supabase, o job é criado por SQL direto (não migration) com `net.http_post` para `julia-viagem-ligar`, header `x-cron-secret` lido do Vault. Mostro antes de rodar.

## Testes
- `src/lib/telefone.test.ts`; `src/lib/juliaViagem.test.ts` (seleção de vendedores, texto das variáveis, janela de horário/limite 22h, regra de retentativa).
- DB (Postgres descartável, como os anteriores): celular inválido recusado; não-admin não altera celular; hotel sem foto aceito no pernoite; concluir com nota pendente recusado; após foto, conclui; vendedor não lê ligações de outro.
- Deno: assinatura do webhook válida/inválida; ferramentas sem secret → 401; `ligacao_id` de outra rota → 403; número fora da whitelist recusado.

## SQL da migration (não aplicar sem aprovação)
```sql
-- 1. Celular
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS celular text;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname='profiles_celular_e164') THEN
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_celular_e164 CHECK (celular IS NULL OR celular ~ '^\+55[1-9][0-9]{9,10}$');
  END IF; END $$;

CREATE OR REPLACE FUNCTION public.fn_profiles_celular_admin() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NEW.celular IS DISTINCT FROM OLD.celular
     AND auth.uid() IS NOT NULL
     AND NOT public.has_role(auth.uid(),'admin') THEN
    RAISE EXCEPTION 'Só o administrador altera o celular do vendedor.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_profiles_celular_admin ON public.profiles;
CREATE TRIGGER trg_profiles_celular_admin BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.fn_profiles_celular_admin();

-- 2. Parâmetros
ALTER TABLE public.viagem_parametros ADD COLUMN IF NOT EXISTS ligacao_ativa boolean NOT NULL DEFAULT false;
ALTER TABLE public.viagem_parametros ADD COLUMN IF NOT EXISTS ligacao_hora time NOT NULL DEFAULT '19:00';
ALTER TABLE public.viagem_parametros ADD COLUMN IF NOT EXISTS ligacao_hora_limite time NOT NULL DEFAULT '22:00';

-- 3. Ligações de viagem
CREATE TABLE IF NOT EXISTS public.ligacoes_viagem (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  vendedor_id uuid NOT NULL,
  data_ref date NOT NULL,
  tentativa integer NOT NULL DEFAULT 1,
  origem text NOT NULL DEFAULT 'cron',          -- cron | manual | retentativa | retorno
  status text NOT NULL DEFAULT 'agendada',      -- agendada | discando | em_andamento | concluida | nao_atendeu | falhou | cancelada
  agendada_para timestamptz NOT NULL DEFAULT now(),
  telefone text,
  conversation_id text,
  call_sid text,
  resumo text,
  transcricao jsonb,
  duracao_s integer,
  erro text,
  solicitado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT ligacoes_viagem_status_chk CHECK (status IN ('agendada','discando','em_andamento','concluida','nao_atendeu','falhou','cancelada')),
  CONSTRAINT ligacoes_viagem_origem_chk CHECK (origem IN ('cron','manual','retentativa','retorno')),
  CONSTRAINT ligacoes_viagem_tentativa_chk CHECK (tentativa BETWEEN 1 AND 5),
  CONSTRAINT ligacoes_viagem_uniq UNIQUE (vendedor_id, data_ref, tentativa)
);
GRANT SELECT ON public.ligacoes_viagem TO authenticated;
GRANT ALL ON public.ligacoes_viagem TO service_role;
ALTER TABLE public.ligacoes_viagem ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ligacoes_viagem_ler ON public.ligacoes_viagem;
CREATE POLICY ligacoes_viagem_ler ON public.ligacoes_viagem FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR vendedor_id = auth.uid());
CREATE INDEX IF NOT EXISTS ligacoes_viagem_agenda_idx ON public.ligacoes_viagem (status, agendada_para);
CREATE UNIQUE INDEX IF NOT EXISTS ligacoes_viagem_conv_idx ON public.ligacoes_viagem (conversation_id) WHERE conversation_id IS NOT NULL;
DROP TRIGGER IF EXISTS trg_ligacoes_viagem_upd ON public.ligacoes_viagem;
CREATE TRIGGER trg_ligacoes_viagem_upd BEFORE UPDATE ON public.ligacoes_viagem
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Notificações in-app
CREATE TABLE IF NOT EXISTS public.notificacoes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  tipo text NOT NULL,
  titulo text NOT NULL,
  texto text,
  link text,
  chave text,                 -- evita duplicar (ex.: 'dia_aberto:<rota>:<data>')
  lida_em timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT notificacoes_chave_uniq UNIQUE (user_id, chave)
);
GRANT SELECT, UPDATE ON public.notificacoes TO authenticated;
GRANT ALL ON public.notificacoes TO service_role;
ALTER TABLE public.notificacoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notificacoes_ler ON public.notificacoes;
CREATE POLICY notificacoes_ler ON public.notificacoes FOR SELECT TO authenticated USING (user_id = auth.uid());
DROP POLICY IF EXISTS notificacoes_marcar ON public.notificacoes;
CREATE POLICY notificacoes_marcar ON public.notificacoes FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE INDEX IF NOT EXISTS notificacoes_user_idx ON public.notificacoes (user_id, lida_em, created_at DESC);

-- 5. Hotel aguardando nota: pernoite aceita gasto sem foto
CREATE OR REPLACE FUNCTION public.fn_pernoites_validar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.rotas;
BEGIN
  IF TG_OP = 'UPDATE' THEN NEW.rota_id := OLD.rota_id; NEW.autor_id := OLD.autor_id; END IF;
  SELECT * INTO r FROM public.rotas WHERE id = NEW.rota_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Viagem não encontrada.'; END IF;
  IF NEW.noite < r.data_inicio OR NEW.noite >= r.data_fim THEN RAISE EXCEPTION 'A noite precisa estar dentro do período da viagem.'; END IF;
  NEW.estado := upper(nullif(btrim(NEW.estado),''));
  IF NEW.tipo IN ('hotel','sem_custo') AND (nullif(btrim(NEW.cidade),'') IS NULL OR coalesce(NEW.estado,'') !~ '^[A-Z]{2}$') THEN
    RAISE EXCEPTION 'Informe cidade e UF de onde dormiu.'; END IF;
  IF NEW.tipo = 'hotel' THEN
    IF nullif(btrim(NEW.hotel_nome),'') IS NULL THEN RAISE EXCEPTION 'Informe o nome do hotel.'; END IF;
    IF NEW.gasto_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.rota_gastos g WHERE g.id = NEW.gasto_id AND g.rota_id = NEW.rota_id AND g.categoria = 'hotel') THEN
      RAISE EXCEPTION 'Pernoite em hotel precisa do gasto de hotel.'; END IF;
  ELSIF nullif(btrim(NEW.observacao),'') IS NULL THEN
    RAISE EXCEPTION 'Explique por que não houve hotel nesta noite.';
  END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_pernoites_validar() FROM PUBLIC, anon, authenticated;

-- 6. Encerrar exige foto de todas as notas de hotel dos pernoites
CREATE OR REPLACE FUNCTION public.fn_rotas_exigir_notas_hotel() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE n date;
BEGIN
  IF NEW.status = 'concluida' AND OLD.status IS DISTINCT FROM 'concluida' THEN
    SELECT p.noite INTO n FROM public.rota_pernoites p
      JOIN public.rota_gastos g ON g.id = p.gasto_id
     WHERE p.rota_id = NEW.id AND p.tipo = 'hotel' AND g.arquivo_path IS NULL
     ORDER BY p.noite LIMIT 1;
    IF n IS NOT NULL THEN
      RAISE EXCEPTION 'Envie a foto da nota do hotel da noite de %.', to_char(n,'DD/MM');
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.fn_rotas_exigir_notas_hotel() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_rotas_exigir_notas_hotel ON public.rotas;
CREATE TRIGGER trg_rotas_exigir_notas_hotel BEFORE UPDATE OF status ON public.rotas
  FOR EACH ROW EXECUTE FUNCTION public.fn_rotas_exigir_notas_hotel();
```

## Ferramentas para configurar na ElevenLabs (webhook, POST)
Header em todas: `x-julia-secret: <JULIA_TOOL_SECRET>`. URL: `https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/julia-viagem-ferramentas/<nome>`. `ligacao_id` e `rota_id` vêm de variáveis dinâmicas (`{{ligacao_id}}`, `{{rota_id}}`).

```json
[
 {"name":"listar_pendentes","description":"Lista as paradas da viagem que ainda não foram informadas.",
  "parameters":{"type":"object","required":["ligacao_id","rota_id"],"properties":{
   "ligacao_id":{"type":"string"},"rota_id":{"type":"string"}}}},
 {"name":"registrar_visita","description":"Registra se o vendedor visitou ou não uma parada. Visitada exige resultado; não visitada exige motivo.",
  "parameters":{"type":"object","required":["ligacao_id","rota_id","parada_id","visitada"],"properties":{
   "ligacao_id":{"type":"string"},"rota_id":{"type":"string"},
   "parada_id":{"type":"string","description":"id da lista de pendentes"},
   "visitada":{"type":"boolean"},
   "resultado":{"type":"string","description":"O que aconteceu na visita"},
   "motivo":{"type":"string","description":"Por que não visitou"}}}},
 {"name":"registrar_pernoite","description":"Registra onde o vendedor vai dormir hoje.",
  "parameters":{"type":"object","required":["ligacao_id","rota_id","tipo"],"properties":{
   "ligacao_id":{"type":"string"},"rota_id":{"type":"string"},
   "tipo":{"type":"string","enum":["hotel","sem_custo","voltou_base"]},
   "cidade":{"type":"string"},"uf":{"type":"string","pattern":"^[A-Z]{2}$"},
   "hotel_nome":{"type":"string"},"valor":{"type":"number","description":"Valor da diária em reais"},
   "observacao":{"type":"string","description":"Justificativa, obrigatória para sem_custo e voltou_base"}}}},
 {"name":"agendar_retorno","description":"Agenda nova ligação hoje no horário pedido (até 22h).",
  "parameters":{"type":"object","required":["ligacao_id","rota_id","horario"],"properties":{
   "ligacao_id":{"type":"string"},"rota_id":{"type":"string"},
   "horario":{"type":"string","pattern":"^([01][0-9]|2[0-2]):[0-5][0-9]$","description":"HH:MM, horário de Brasília"}}}}
]
```
Webhook pós-ligação: `.../julia-viagem-webhook`, assinatura HMAC com `JULIA_WEBHOOK_SECRET`.

## Roteiro do agente (prompt de sistema)
```text
Você é a Júlia, assistente da LS que liga para os VENDEDORES no fim do dia de viagem. Você nunca fala com clientes.
Fale português do Brasil, frases curtas, tom de colega de equipe, objetiva. A ligação deve durar no máximo 4 minutos.

Contexto: vendedor {{vendedor_nome}}, viagem "{{rota_nome}}", hoje {{data_hoje}}.
Paradas pendentes (id | empresa | cidade):
{{paradas_pendentes}}
Já informadas hoje: {{visitadas_hoje}}. Último dia da viagem: {{ultimo_dia}}.

Roteiro:
1. Cumprimente pelo nome e pergunte se pode falar 3 minutos. Se não puder, pergunte o melhor horário até 22h e use agendar_retorno; despeça-se.
2. Pergunte quais empresas visitou hoje. Para cada uma mencionada, identifique a parada na lista (confirme o nome se tiver dúvida) e use registrar_visita com visitada=true e um resultado de uma ou duas frases (interesse, próximo passo, pedido de proposta).
3. Pergunte se alguma parada prevista para hoje não deu certo. Use registrar_visita com visitada=false e o motivo. Não force o vendedor a falar de paradas que ficam para os próximos dias.
4. Se não for o último dia, pergunte onde vai dormir:
   - Hotel: pergunte cidade, nome do hotel e valor da diária; use registrar_pernoite tipo hotel. Avise que ele vai receber no CRM o pedido da foto da nota.
   - Casa de cliente, parente ou alojamento: cidade e o motivo; tipo sem_custo.
   - Voltou para casa: tipo voltou_base com o motivo.
5. Repita em uma frase o que foi registrado, agradeça e encerre.

Regras:
- Use somente ids da lista; se não encontrar a empresa, chame listar_pendentes; se ainda assim não existir, diga que ele registre pelo CRM.
- Se uma ferramenta retornar erro, leia a mensagem ao vendedor de forma simples e siga em frente.
- Nunca invente valores, cidades ou resultados. Confirme números (valor da diária) repetindo.
- Não fale de preços de produtos, descontos nem dados de outros vendedores.
```

## Perguntas abertas
1. Quem é "vendedor" para a whitelist: papéis `comercial` e `rtv` bastam? Incluir você (admin) para testes?
2. Último dia da viagem (sem noite a registrar): ligar mesmo assim só para as visitas, ou não ligar?
3. Limite de tentativas por dia: proponho 3 no total (inicial + 1 de não atendeu + 1 retorno pedido). Ok?
4. Cron a cada 10 min nas janelas (~30 execuções/dia) ou a cada 30 min?
5. Começar com `ligacao_ativa = false` e você liga manualmente com "Ligar agora" até validar o agente?
6. O segredo do cron (`JULIA_CRON_SECRET`) eu gero automaticamente — confirma? E você cria `ELEVENLABS_AGENT_ID_VIAGEM` depois de configurar o agente.
