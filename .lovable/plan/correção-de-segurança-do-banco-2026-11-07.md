# Correção de segurança do banco

## 5. O "1 problema crítico" do painel de publicação
Não é nenhum item da lista A ou B. O verificador da Lovable marca como **crítico** dois itens, e o painel conta os dois como um problema só:
- **`push_regras`**: a regra de leitura `USING (true)` deixa qualquer pessoa logada ver as regras de push. Elas não têm dado de cliente (prefixo, push sim/não, urgente).
- **`pipelines`**: a regra de leitura `USING (true)` deixa qualquer pessoa logada ver todos os funis. Todas as telas do CRM precisam ler os funis.

Os dois são catálogo do sistema, sem dado pessoal, e a leitura aberta a quem está logado é intencional. A correção proposta não muda quem lê nada:
- `push_regras`: leitura só para admin. Só o servidor (push-enviar) e o admin usam essa tabela.
- `pipelines`: manter a leitura e marcar o alerta como "ignorado, intencional", com justificativa.

Os itens A e B não aparecem no verificador da Lovable, só no do Supabase. Mesmo assim são mais graves, porque abrem dados para quem **não está logado**.

## 1. Quem usa cada item
Procurei no código das telas, nas funções do servidor e dentro do próprio banco (funções que chamam outras). Nos registros do servidor dos últimos 7 dias não apareceu nenhuma chamada a esses itens. Mas o registro de uso por função está desligado, então **não dá para garantir que nenhum sistema de fora (n8n/WhatsApp) chame algum deles**.

| Item | Quem usa | Papel necessário | Correção |
|---|---|---|---|
| vw_atividades_usuario | Tela Atividades | logado | security_invoker=true; tirar anon |
| vw_pessoa_perfil_atual | IaInsights | logado | security_invoker=true; tirar anon |
| vw_organizacao_dossie | InteracoesCampo (dossiê) | logado | security_invoker=true; tirar anon |
| vw_dossies_pendentes | Tela Dossiês (desativada) | logado | security_invoker=true; tirar anon |
| vw_dossie_resumo | ninguém no código | nenhum | tirar anon e logado (só servidor) |
| vw_ultima_sessao_telefone | ninguém no código | nenhum | tirar anon e logado (só servidor) |
| fn_oportunidade_rotting | CrmWidgets | logado | tirar só anon |
| fn_proximo_comercial_para_estado | trigger fn_atribuir_responsavel_org | interno | tirar anon e logado |
| buscar_pendencia_ativa, concluir_atividades_dossie, criar_atividade_dossie, criar_evento_agenda, identificar_sementeira, upsert_dossie_por_org | ninguém no código; parecem feitas para o bot de dossiê/WhatsApp (n8n) | servidor | tirar anon e logado (**ver item 3**) |
| fn_conversas_para_perfil, fn_gravar_perfil, fn_match_pessoa_por_telefone | ninguém no código (perfil por IA/WhatsApp) | servidor | tirar anon e logado (**ver item 3**) |
| fn_lgpd_excluir/exportar_dados_pessoa | nenhuma tela; já checam o papel | admin | tirar só anon |
| 27 funções de trigger (handle_new_user, fn_audit_trigger, update_updated_at_column…) | só os triggers | nenhum | tirar anon e logado (triggers continuam funcionando) |
| dossie_pendencias | ninguém no código; trava ligada, sem regra | servidor | tirar anon e logado |
| fn_tel_digitos, fn_tel_chave_match, fn_conversas_para_perfil, fn_gravar_perfil | interno | — | fixar o search_path em `public` |

As duas views de organização (situação atual e completude) já estão protegidas e ficam como estão.

## 2. Correção (SQL em `docs/sql/seguranca-anon-proposta.sql`, aplicado só com aprovação)
```sql
ALTER VIEW public.vw_atividades_usuario SET (security_invoker = true);
-- idem vw_pessoa_perfil_atual, vw_organizacao_dossie, vw_dossies_pendentes
REVOKE SELECT ON public.vw_atividades_usuario, public.vw_pessoa_perfil_atual,
  public.vw_organizacao_dossie, public.vw_dossies_pendentes FROM anon;
REVOKE ALL ON public.vw_dossie_resumo, public.vw_ultima_sessao_telefone,
  public.dossie_pendencias FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION <cada função da tabela> FROM PUBLIC, anon [, authenticated];
GRANT EXECUTE ON FUNCTION public.fn_oportunidade_rotting(...),
  public.fn_lgpd_*(...) TO authenticated;
-- servidor (service_role) mantém acesso em tudo
ALTER FUNCTION public.fn_tel_digitos(...) SET search_path = public; -- e as outras 3
DROP POLICY push_regras_ver ...; CREATE POLICY ... USING (has_role(auth.uid(),'admin'));
```
O SQL tira primeiro o acesso de `PUBLIC`. Sem isso, a função continuaria liberada por herança.

## 3. Sistemas de fora com a chave pública
Só o CEO sabe se algum n8n ou bot de WhatsApp ainda chama as funções de dossiê/perfil com a chave pública. Proposta:
- **Pergunta ao CEO, antes de aplicar:** "Algum fluxo n8n/bot ainda usa essas funções?"
- **Se não usa** (o dossiê está desativado): o SQL vai como está.
- **Se usa:**
  - o primeiro SQL deixa de fora só as funções que esse fluxo usa;
  - crio uma função do servidor `bot-dossie`, protegida por um segredo `BOT_DOSSIE_SECRET`, que chama essas funções com acesso de servidor;
  - o CEO troca a chamada no n8n;
  - depois aplicamos o resto do SQL.
- Nada quebra sem aviso. Se algo parar, voltar atrás é um `GRANT EXECUTE` de uma linha.

## 4. Como testar
1. **Antes, com a chave pública e sem login:** confirmar que cada view e função responde dados. Isso reproduz o problema.
2. **Aplicar o SQL.**
3. **Depois, sem login:** as mesmas chamadas devem responder "permission denied".
4. **Vendedor logado:**
   - Atividades (calendário/lista) e os widgets do CRM (negócio parado) carregam;
   - criar organização: o responsável continua sendo atribuído pelo trigger;
   - criar uma oportunidade grava o histórico.
5. **Admin logado:** a mesma checagem do vendedor, mais o push de teste (o push-enviar lê `push_regras`) e o painel da Júlia.
6. **Em transação desfeita no final:** login de um usuário novo (handle_new_user) e uma atualização com auditoria funcionando.
7. **Verificadores:** rodar de novo o do Supabase e o da Lovable.

## Riscos
- **Sistema de fora:** um n8n/bot que eu não vejo pode parar. A mitigação é o item 3.
- **Mudança na view de atividades:** com security_invoker, `vw_atividades_usuario` passa a respeitar a regra de `atividades`. O vendedor continua vendo as próprias atividades; se a tela mostrava atividades de outras pessoas por causa da brecha, deixa de mostrar. Vou conferir com o login do vendedor.
- **Senha vazada:** a proteção contra senha vazada só existe no plano Pro do Supabase. O CEO liga em Authentication → Policies, se o plano permitir.
- **Teste no navegador:** não consigo testar com login (Supabase externo). Os testes do item 4 serão feitos no banco, simulando cada papel.
