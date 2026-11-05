# Viagens sem dia planejado: paradas livres, pernoite real e relatório diário

## Situação atual no banco
- 1 viagem existente (aprovada, vários dias): 3 paradas, todas no Dia 1, nenhuma prestada, 0 pernoites. Não há viagens em rascunho/concluídas.
- `rota_paradas.dia` é usado hoje em:
  - `fn_paradas_protecao`: preenche `dia = data_inicio` quando vazio e exige dia dentro do período; inclui `dia`, `hotel_nome`, `valor_diaria_est` na lista de campos de "planejamento".
  - `fn_paradas_reaprovacao`: mesma lista. Mudar o dia de uma parada aprovada manda a viagem de volta para aprovação.
  - `pedagio-viagem` (função do servidor): ordena por dia e quebra o trajeto nos pernoites.
- `fn_rotas_autorizacao`: no envio, exige hotel e diária em todo pernoite. No encerramento, exige que toda parada que não seja pernoite tenha "Visitei + resultado" ou "Não visitei + motivo". Isso já cobre o item 4.
- Datas BRT: `fn_rota_hoje_brt()` e `now() AT TIME ZONE 'America/Sao_Paulo'`. A prestação é aceita entre o início da viagem aprovada e o encerramento. Diário e gastos usam `fn_pode_escrever_diario` (início até fim + 1 dia) e `fn_pode_lancar_gasto`. Essas regras ficam como estão.

## Decisões propostas
1. **Reaproveitar `rota_paradas.dia` como "dia realizado"**, sem criar coluna nova. Ele fica vazio enquanto a parada está pendente. O banco grava a data BRT no momento em que o vendedor marca Visitei/Não visitei e limpa a data se a marcação for desfeita. O vendedor não escolhe esse valor; só o admin pode corrigi-lo, dentro do período da viagem. Assim telas e relatórios que já agrupam por `dia` passam a mostrar o dia real.
2. **`dia`, `hotel_nome` e `valor_diaria_est` deixam de contar como planejamento.** Sem isso, marcar uma visita gravaria o dia e mandaria a viagem de volta para aprovação.
3. **Hospedagem estimada = noites × diária média.** Noites = `data_fim − data_inicio`. A diária média fica em `rotas.diaria_media_est`, com valor padrão em `viagem_parametros.diaria_padrao`. Mudar a diária de uma viagem aprovada volta para aprovação, como acontece hoje com período e veículo.
4. **Pernoite deixa de ser parada.** Passa a ser um registro real numa tabela nova, `rota_pernoites`: noite, cidade/UF IBGE, coordenada, hotel e ligação opcional ao gasto de hotel em `rota_gastos`, onde ficam o valor e a foto da nota. O banco recusa pernoites novos como parada. Pernoites antigos, se existirem, continuam guardados e não aparecem no planejamento (hoje são 0).
5. **Trajeto e custo:** base → paradas na ordem atual → base, em um só percurso, com combustível e pedágio calculados como hoje. O aviso de "rota longa para um dia" é trocado por "≈ X h de direção por dia".

## Plano por arquivo
- `src/lib/viagem.ts`: tirar a divisão por dia do cálculo do trajeto, que passa a ignorar pernoites. Em `custoEstimado`, receber `noites` e `diariaMedia` no lugar da lista de diárias. Nova `noitesDaViagem(inicio, fim)` e `agruparPorDiaRealizado(paradas, diario, gastos, pernoites)` para o histórico.
- `src/lib/viagemRota.ts`: um único cálculo de rota na ordem das paradas.
- `supabase/functions/pedagio-viagem/index.ts`: mesma ordenação de `assinaturaTrajeto`, sem dia nem pernoite, mantendo a duplicação descrita em AGENTS.md. A viagem aprovada mantém o valor de pedágio congelado e só consulta de novo se for reenviada.
- `src/pages/RotaEditor.tsx`: remover as abas e o seletor de dia, o botão de pernoite e o `PernoiteDialog`. Ficam período, lista única ordenável, campo "Diária média estimada" pré-preenchido com o padrão e o card de investimento com "N noites × R$ X".
- `src/components/rotas/PernoiteDialog.tsx`: deixa de ser usado no planejamento. O preenchimento de cidade pelo IBGE vai para o novo `src/components/viagens/RelatorioDiaDialog.tsx`.
- `src/pages/RotasAprovacoes.tsx` e `src/components/rotas/RotaMapa.tsx`: lista de paradas sem dia, período, noites × diária e um único traçado.
- `src/pages/ViagemHoje.tsx`:
  - Aba **Pendentes**: lista única com Visitei / Não visitei / Waze / + Informativo, em qualquer ordem.
  - Aba **Hoje**: paradas feitas hoje, informativos e gastos do dia, mais o botão **"Fechar o dia: onde dormi"**. Ele abre `RelatorioDiaDialog`: cidade IBGE, hotel, valor e foto da nota. Grava `rota_pernoites` e, se houver valor, um gasto de hotel em `rota_gastos`.
  - **Histórico**: um bloco por dia real.
  - **"Encerrar viagem"**: lista as pendentes, pede o motivo de cada uma (com opção de usar o mesmo motivo para todas), grava como "Não visitei" e depois encerra a viagem. Mantém o aviso de viagem sem gastos.
- `src/pages/ViagemAcompanhar.tsx`: linha do tempo por dia real, com paradas feitas, informativos, pernoite real e gastos. Mapa com o trajeto planejado e marcadores de pernoites reais. Comparativo estimado x real, em que hotel compara com noites × diária.
- `src/pages/ViagensAndamento.tsx`: progresso x de y (mantido), pendentes, onde dormiu ontem e último informativo.
- `src/lib/viagemDados.ts` e `src/lib/viagemDiario.ts`: carregar `rota_pernoites` e espelhar as regras para avisos na tela.
- `src/pages/configuracoes/Viagens`: campo "Diária média padrão".
- Testes:
  - `viagem.test.ts`: noites × diária e trajeto único.
  - `rotasBanco.test.ts`: dia gravado em BRT ao prestar; editar dia não volta para aprovação; pernoite novo como parada é recusado; envio sem diária em viagem de vários dias é recusado; encerrar com pendente é recusado.
  - `viagemDiarioBanco.test.ts`: acesso a `rota_pernoites` (dono e admin sim, outro vendedor não).

## SQL proposta (idempotente)
Executa nesta ordem: funções primeiro, dados por último. Assim limpar o `dia` das paradas pendentes não dispara reaprovação.

```sql
-- 1. Colunas
ALTER TABLE public.rotas ADD COLUMN IF NOT EXISTS diaria_media_est numeric;
ALTER TABLE public.viagem_parametros ADD COLUMN IF NOT EXISTS diaria_padrao numeric NOT NULL DEFAULT 200;

-- 2. Pernoites reais
CREATE TABLE IF NOT EXISTS public.rota_pernoites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  rota_id uuid NOT NULL REFERENCES public.rotas(id) ON DELETE CASCADE,
  noite date NOT NULL,
  cidade text NOT NULL,
  estado text NOT NULL,
  latitude numeric, longitude numeric,
  hotel_nome text,
  gasto_id uuid REFERENCES public.rota_gastos(id) ON DELETE SET NULL,
  observacao text,
  autor_id uuid NOT NULL DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (rota_id, noite)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.rota_pernoites TO authenticated;
GRANT ALL ON public.rota_pernoites TO service_role;
ALTER TABLE public.rota_pernoites ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pernoites_ver ON public.rota_pernoites;
CREATE POLICY pernoites_ver ON public.rota_pernoites FOR SELECT TO authenticated
  USING (public.fn_pode_ver_rota(auth.uid(), rota_id));
DROP POLICY IF EXISTS pernoites_inserir ON public.rota_pernoites;
CREATE POLICY pernoites_inserir ON public.rota_pernoites FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(),'admin') OR (autor_id = auth.uid() AND public.fn_pode_escrever_diario(auth.uid(), rota_id)));
DROP POLICY IF EXISTS pernoites_alterar ON public.rota_pernoites;
CREATE POLICY pernoites_alterar ON public.rota_pernoites FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (autor_id = auth.uid() AND public.fn_pode_escrever_diario(auth.uid(), rota_id)))
  WITH CHECK (public.has_role(auth.uid(),'admin') OR (autor_id = auth.uid() AND public.fn_pode_escrever_diario(auth.uid(), rota_id)));
DROP POLICY IF EXISTS pernoites_apagar ON public.rota_pernoites;
CREATE POLICY pernoites_apagar ON public.rota_pernoites FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(),'admin') OR (autor_id = auth.uid() AND public.fn_pode_escrever_diario(auth.uid(), rota_id)));

CREATE OR REPLACE FUNCTION public.fn_pernoites_validar() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE r public.rotas;
BEGIN
  SELECT * INTO r FROM public.rotas WHERE id = NEW.rota_id;
  IF NEW.noite < r.data_inicio OR NEW.noite > r.data_fim THEN RAISE EXCEPTION 'A noite precisa estar dentro do período da viagem.'; END IF;
  IF nullif(btrim(NEW.cidade),'') IS NULL OR NEW.estado !~ '^[A-Z]{2}$' THEN RAISE EXCEPTION 'Informe cidade e UF do pernoite.'; END IF;
  IF NEW.gasto_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.rota_gastos g WHERE g.id = NEW.gasto_id AND g.rota_id = NEW.rota_id AND g.categoria = 'hotel') THEN
    RAISE EXCEPTION 'O gasto ligado ao pernoite deve ser um gasto de hotel desta viagem.'; END IF;
  IF TG_OP = 'UPDATE' THEN NEW.rota_id := OLD.rota_id; NEW.autor_id := OLD.autor_id; END IF;
  NEW.updated_at := now();
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_pernoites_validar ON public.rota_pernoites;
CREATE TRIGGER trg_pernoites_validar BEFORE INSERT OR UPDATE ON public.rota_pernoites
  FOR EACH ROW EXECUTE FUNCTION public.fn_pernoites_validar();

-- 3. Paradas: dia = dia realizado (BRT), sai da lista de planejamento; pernoite novo como parada é recusado
CREATE OR REPLACE FUNCTION public.fn_paradas_protecao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE r public.rotas; planejamento boolean; admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; prestou boolean:=false;
BEGIN
 IF TG_OP='UPDATE' AND NEW.rota_id IS DISTINCT FROM OLD.rota_id THEN RAISE EXCEPTION 'Não é permitido transferir paradas entre rotas.'; END IF;
 SELECT * INTO r FROM public.rotas WHERE id=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END FOR UPDATE;
 IF NOT FOUND THEN IF TG_OP='DELETE' THEN RETURN OLD; END IF; RAISE EXCEPTION 'Rota não encontrada.'; END IF;
 IF NOT admin AND r.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'Paradas de uma rota encerrada não podem ser alteradas.'; END IF;
 IF TG_OP='INSERT' AND NEW.tipo='pernoite' THEN RAISE EXCEPTION 'Pernoites são registrados durante a viagem, não no planejamento.'; END IF;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.organizacao_id,NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.organizacao_id,OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id); END IF;
 IF planejamento AND NOT admin AND r.status='aprovada' AND coalesce(r.data_fim,r.data_rota)<hoje THEN RAISE EXCEPTION 'O plano de uma viagem passada não pode ser alterado. Preste contas.'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF (TG_OP='INSERT' AND (NEW.visitada IS NOT NULL OR NEW.resultado IS NOT NULL OR NEW.motivo_nao_visita IS NOT NULL)) OR (TG_OP='UPDATE' AND ROW(NEW.visitada,NEW.resultado,NEW.motivo_nao_visita) IS DISTINCT FROM ROW(OLD.visitada,OLD.resultado,OLD.motivo_nao_visita)) THEN
   IF NOT admin AND (r.status<>'aprovada' OR coalesce(r.data_inicio,r.data_rota)>hoje) THEN RAISE EXCEPTION 'Preste contas somente na data de uma viagem aprovada.'; END IF;
   prestou:=true;
   NEW.informada_em:=CASE WHEN NEW.visitada IS NULL THEN NULL ELSE now() END;
 ELSIF TG_OP='UPDATE' THEN NEW.informada_em:=OLD.informada_em; ELSE NEW.informada_em:=NULL; END IF;
 -- dia realizado: o banco grava; admin pode corrigir
 IF admin AND TG_OP='UPDATE' AND NEW.dia IS DISTINCT FROM OLD.dia AND NOT prestou THEN
   NULL; -- correção manual do admin
 ELSIF prestou THEN
   NEW.dia := CASE WHEN NEW.visitada IS NULL THEN NULL
                   ELSE least(greatest(hoje, coalesce(r.data_inicio,r.data_rota)), coalesce(r.data_fim,r.data_rota)) END;
 ELSIF TG_OP='UPDATE' THEN NEW.dia := OLD.dia;
 ELSE NEW.dia := NULL; END IF;
 IF NEW.dia IS NOT NULL AND (NEW.dia < coalesce(r.data_inicio,r.data_rota) OR NEW.dia > coalesce(r.data_fim,r.data_rota)) THEN RAISE EXCEPTION 'O dia da parada precisa estar dentro do período da viagem.'; END IF;
 IF NEW.valor_diaria_est IS NOT NULL AND NEW.valor_diaria_est < 0 THEN RAISE EXCEPTION 'Valor da diária inválido.'; END IF;
 RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.fn_paradas_reaprovacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE rid uuid; planejamento boolean;
BEGIN
 rid:=CASE WHEN TG_OP='DELETE' THEN OLD.rota_id ELSE NEW.rota_id END;
 planejamento:=TG_OP IN ('INSERT','DELETE');
 IF TG_OP='UPDATE' THEN planejamento:=ROW(NEW.organizacao_id,NEW.oportunidade_id,NEW.cidade,NEW.estado,NEW.ordem,NEW.objetivo,NEW.tipo,NEW.latitude,NEW.longitude,NEW.atividade_id) IS DISTINCT FROM ROW(OLD.organizacao_id,OLD.oportunidade_id,OLD.cidade,OLD.estado,OLD.ordem,OLD.objetivo,OLD.tipo,OLD.latitude,OLD.longitude,OLD.atividade_id); END IF;
 IF planejamento THEN UPDATE public.rotas SET status='aguardando_aprovacao' WHERE id=rid AND status='aprovada' AND coalesce(data_fim,data_rota)>=(now() AT TIME ZONE 'America/Sao_Paulo')::date; END IF;
 RETURN NULL;
END $function$;

-- 4. Período: validar diária média
CREATE OR REPLACE FUNCTION public.fn_rotas_periodo() RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $function$
DECLARE servico boolean := coalesce(current_setting('request.jwt.claim.role', true),'') = 'service_role'
  OR coalesce((nullif(current_setting('request.jwt.claims', true),'')::jsonb)->>'role','') = 'service_role';
BEGIN
  IF TG_OP='INSERT' THEN
    NEW.data_inicio := coalesce(NEW.data_inicio, NEW.data_rota);
  ELSIF NEW.data_inicio IS NOT DISTINCT FROM OLD.data_inicio AND NEW.data_rota IS DISTINCT FROM OLD.data_rota THEN
    NEW.data_fim := coalesce(NEW.data_fim, OLD.data_fim) + (NEW.data_rota - OLD.data_rota);
    NEW.data_inicio := NEW.data_rota;
  END IF;
  IF NEW.data_inicio IS NULL THEN RAISE EXCEPTION 'Informe a data de início da viagem.'; END IF;
  NEW.data_rota := NEW.data_inicio;
  NEW.data_fim := coalesce(NEW.data_fim, NEW.data_inicio);
  IF NEW.data_fim < NEW.data_inicio THEN RAISE EXCEPTION 'A data de fim não pode ser antes do início.'; END IF;
  IF NEW.data_fim - NEW.data_inicio > 14 THEN RAISE EXCEPTION 'Uma viagem pode ter no máximo 15 dias.'; END IF;
  IF NEW.alimentacao_dia_estimada IS NOT NULL AND NEW.alimentacao_dia_estimada < 0 THEN RAISE EXCEPTION 'Alimentação estimada inválida.'; END IF;
  IF NEW.diaria_media_est IS NOT NULL AND NEW.diaria_media_est < 0 THEN RAISE EXCEPTION 'Diária média inválida.'; END IF;
  IF NOT servico THEN
    IF TG_OP='INSERT' THEN
      NEW.custo_pedagio_est:=NULL; NEW.pedagio_consultado_em:=NULL; NEW.pedagio_assinatura:=NULL; NEW.pedagio_detalhe:=NULL;
    ELSE
      NEW.custo_pedagio_est:=OLD.custo_pedagio_est; NEW.pedagio_consultado_em:=OLD.pedagio_consultado_em;
      NEW.pedagio_assinatura:=OLD.pedagio_assinatura; NEW.pedagio_detalhe:=OLD.pedagio_detalhe;
    END IF;
  END IF;
  RETURN NEW;
END $function$;

-- 5. Autorização: diária média entra em "período mudou"; envio exige diária em viagem com noites;
--    regra antiga de hotel por pernoite sai; encerramento continua exigindo todas as paradas informadas.
CREATE OR REPLACE FUNCTION public.fn_rotas_autorizacao() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE admin boolean:=coalesce(public.has_role(auth.uid(),'admin'),false); pendente date; hoje date:=(now() AT TIME ZONE 'America/Sao_Paulo')::date; periodo_mudou boolean;
BEGIN
 IF TG_OP='DELETE' THEN
  IF NOT admin AND OLD.status NOT IN ('rascunho','reprovada','cancelada') THEN RAISE EXCEPTION 'Esta rota não pode ser apagada. Preste contas da viagem.'; END IF;
  RETURN OLD;
 END IF;
 IF NEW.status NOT IN ('rascunho','aguardando_aprovacao','aprovada','reprovada','concluida','cancelada') THEN RAISE EXCEPTION 'Status de rota inválido.'; END IF;
 IF TG_OP='INSERT' THEN
  IF NEW.status<>'rascunho' THEN RAISE EXCEPTION 'Novas rotas devem nascer como rascunho.'; END IF;
  NEW.enviada_em:=NULL; NEW.aprovada_em:=NULL; NEW.aprovada_por:=NULL; NEW.motivo_reprovacao:=NULL; NEW.prestacao_concluida_em:=NULL;
  RETURN NEW;
 END IF;
 IF NEW.vendedor_id IS DISTINCT FROM OLD.vendedor_id THEN RAISE EXCEPTION 'O vendedor da rota não pode ser alterado.'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(NEW.vendedor_id::text,731));
 IF NOT admin AND OLD.status IN ('concluida','cancelada') THEN RAISE EXCEPTION 'Esta rota está encerrada e não pode ser alterada.'; END IF;
 NEW.enviada_em:=OLD.enviada_em; NEW.aprovada_em:=OLD.aprovada_em; NEW.aprovada_por:=OLD.aprovada_por; NEW.prestacao_concluida_em:=OLD.prestacao_concluida_em;
 IF NOT admin THEN NEW.motivo_reprovacao:=OLD.motivo_reprovacao; END IF;
 periodo_mudou := NEW.data_inicio IS DISTINCT FROM OLD.data_inicio OR NEW.data_fim IS DISTINCT FROM OLD.data_fim
   OR NEW.veiculo_id IS DISTINCT FROM OLD.veiculo_id OR NEW.diaria_media_est IS DISTINCT FROM OLD.diaria_media_est;
 IF OLD.status='aprovada' AND periodo_mudou THEN
  IF coalesce(OLD.data_fim,OLD.data_rota)<hoje THEN RAISE EXCEPTION 'Preste contas antes de alterar uma viagem passada.'; END IF;
  NEW.status:='aguardando_aprovacao';
 END IF;
 IF NOT admin AND OLD.status='aguardando_aprovacao' AND periodo_mudou AND NEW.status<>'rascunho' THEN RAISE EXCEPTION 'Volte para rascunho antes de editar a data.'; END IF;
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  IF NEW.status IN ('aprovada','reprovada') THEN
   IF NOT admin THEN RAISE EXCEPTION 'Somente admin pode aprovar ou reprovar uma rota.'; END IF;
   IF OLD.status<>'aguardando_aprovacao' THEN RAISE EXCEPTION 'A rota precisa estar aguardando aprovação.'; END IF;
   IF NEW.status='aprovada' THEN
    IF NEW.data_fim<hoje THEN RAISE EXCEPTION 'Não é possível aprovar uma viagem com data passada.'; END IF;
    IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite') OR EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite' AND (nullif(btrim(objetivo),'') IS NULL OR (tipo='visita' AND organizacao_id IS NULL))) THEN RAISE EXCEPTION 'Complete o plano antes de aprovar.'; END IF;
    NEW.aprovada_em:=now(); NEW.aprovada_por:=auth.uid(); NEW.motivo_reprovacao:=NULL;
   ELSIF nullif(btrim(NEW.motivo_reprovacao),'') IS NULL THEN RAISE EXCEPTION 'Informe o motivo da reprovação.';
   END IF;
  ELSIF NEW.status='aguardando_aprovacao' THEN
   IF OLD.status NOT IN ('rascunho','reprovada','aprovada') THEN RAISE EXCEPTION 'Esta rota não pode ser enviada para aprovação.'; END IF;
   IF NEW.data_fim<hoje THEN RAISE EXCEPTION 'A data da rota deve ser hoje ou uma data futura.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite') THEN RAISE EXCEPTION 'Adicione ao menos uma parada.'; END IF;
   IF EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite' AND nullif(btrim(objetivo),'') IS NULL) THEN RAISE EXCEPTION 'Preencha o objetivo de todas as paradas.'; END IF;
   IF EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo='visita' AND organizacao_id IS NULL) THEN RAISE EXCEPTION 'Toda visita deve ter uma organização.'; END IF;
   IF NEW.data_fim > NEW.data_inicio AND NEW.diaria_media_est IS NULL THEN RAISE EXCEPTION 'Informe a diária média estimada da hospedagem.'; END IF;
   SELECT min(coalesce(data_fim,data_rota)) INTO pendente FROM public.rotas WHERE vendedor_id=NEW.vendedor_id AND id<>NEW.id AND status='aprovada' AND coalesce(data_fim,data_rota)<hoje;
   IF pendente IS NOT NULL THEN RAISE EXCEPTION 'Preste contas da rota de % antes de pedir nova viagem.',to_char(pendente,'DD/MM'); END IF;
   NEW.enviada_em:=now(); NEW.aprovada_em:=NULL; NEW.aprovada_por:=NULL; NEW.motivo_reprovacao:=NULL;
  ELSIF NEW.status='concluida' THEN
   IF OLD.status<>'aprovada' OR NEW.data_inicio>hoje THEN RAISE EXCEPTION 'Só é possível prestar contas de uma rota aprovada cuja data chegou.'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite') OR EXISTS(SELECT 1 FROM public.rota_paradas WHERE rota_id=NEW.id AND tipo<>'pernoite' AND (visitada IS NULL OR (visitada AND nullif(btrim(resultado),'') IS NULL) OR (NOT visitada AND nullif(btrim(motivo_nao_visita),'') IS NULL))) THEN RAISE EXCEPTION 'Informe todas as paradas: resultado da visita ou motivo de não visita.'; END IF;
   NEW.prestacao_concluida_em:=now();
  ELSIF NEW.status='rascunho' THEN
   IF OLD.status NOT IN ('aguardando_aprovacao','reprovada') THEN RAISE EXCEPTION 'Uma viagem aprovada não pode voltar para rascunho. Preste contas.'; END IF;
  ELSIF NEW.status='cancelada' THEN
   IF OLD.status='concluida' OR (OLD.status='aprovada' AND NOT admin) THEN RAISE EXCEPTION 'Somente admin pode cancelar uma viagem aprovada.'; END IF;
  END IF;
 END IF;
 NEW.updated_at:=now(); RETURN NEW;
END $function$;

-- 6. Dados existentes (depois das funções, para não disparar reaprovação)
-- 6a. Paradas pendentes perdem o dia planejado
UPDATE public.rota_paradas SET dia = NULL WHERE visitada IS NULL AND dia IS NOT NULL;
-- 6b. Paradas já prestadas recebem o dia real (data BRT da prestação)
UPDATE public.rota_paradas p SET dia = (p.informada_em AT TIME ZONE 'America/Sao_Paulo')::date
  WHERE p.visitada IS NOT NULL AND p.informada_em IS NOT NULL
    AND p.dia IS DISTINCT FROM (p.informada_em AT TIME ZONE 'America/Sao_Paulo')::date;
-- 6c. Pernoites planejados viram diária média da viagem (não apaga as paradas)
UPDATE public.rotas r SET diaria_media_est = s.media
  FROM (SELECT rota_id, round(avg(valor_diaria_est),2) media FROM public.rota_paradas
        WHERE tipo='pernoite' AND valor_diaria_est IS NOT NULL GROUP BY rota_id) s
  WHERE r.id = s.rota_id AND r.diaria_media_est IS NULL;
```

Observação: os passos 6a e 6b alteram só `dia` e `informada_em` não muda, então os gatilhos não mandam nada de volta para aprovação. A proteção mantém `dia` porque o comando roda sem usuário admin. Por isso esses dois passos precisam rodar dentro da migration, que dispensa os gatilhos de usuário. Antes de aplicar, vou confirmar isso com um teste de banco. Se a proteção barrar o passo, uso `SET LOCAL session_replication_role = replica` apenas nesses dois UPDATEs.

## Impacto nos dados existentes
- A viagem aprovada (3 paradas, nenhuma prestada) fica com as 3 paradas pendentes e sem dia. Ela continua aprovada, porque `dia` deixou de ser planejamento. O custo e o pedágio guardados no envio continuam congelados. Como a viagem não tem diária média, a hospedagem real é comparada com a estimativa gravada (R$ 0, sem pernoites).
- Não há pernoites planejados hoje, então o passo 6c não altera nenhuma viagem. Ele fica na migration por segurança.
- Nenhuma linha é apagada. `hotel_nome` e `valor_diaria_est` continuam guardados como dado antigo.

## Perguntas em aberto
1. Valor da **diária média padrão**: usei R$ 200 como provisório. Qual é o valor real?
2. Na viagem de vários dias, a **diária média é obrigatória** no envio? Proposta: sim, aceitando R$ 0 para quem dorme na casa de cliente ou parente.
3. **Fechar o dia** deve ser obrigatório para encerrar a viagem (um pernoite por noite) ou só recomendado? Proposta: só aviso, como o aviso de gastos.
4. **Marcação depois da meia-noite:** uma parada marcada à 00h30 entra no dia seguinte, pela data BRT. Proposta: manter assim. O admin pode corrigir o dia de uma parada.
5. A parada pendente precisa de **ordem livre também no mapa** do "Hoje" (do vendedor até a próxima parada) ou basta o botão Waze em cada parada?
