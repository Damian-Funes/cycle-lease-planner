# Júlia: gasto das ligações recusadas + Damian como admin

O filtro no Twilio foi descartado. A `julia-viagem-entrada` continua sendo a única barreira.

## Parte 1: monitorar o gasto

### Onde guardar
Recomendo uma **tabela própria `julia_ligacoes_recusadas`**, e não `ligacoes_viagem`.
- `ligacoes_viagem` exige um vendedor e alimenta o placar e o acompanhamento dos vendedores. Misturar estranhos ali poluiria as métricas e todos os filtros que já existem.
- Colunas: `id`, `recebida_em`, `telefone_mascarado` (4 últimos), `telefone_hash` (SHA-256 com sal, para agrupar o mesmo número sem guardar o número), `call_sid`, `conversation_id`, `duracao_s`, `custo_creditos`, `custo_estimado_brl`, `motivo` (`nao` ou `ocupado`).
- Só o admin lê. Só o servidor grava.

### Como preencher
1. A `julia-viagem-entrada`, ao decidir `nao`, grava a linha com `call_sid` e o número mascarado. A gravação não pode atrasar a resposta: se falhar, só loga.
2. Ela também devolve uma variável nova, `recusa_id`, para a ElevenLabs.
3. O `julia-viagem-webhook`, quando `permitido=nao`, atualiza essa linha pelo `recusa_id`. Se não houver `recusa_id`, usa o `metadata.phone_call.call_sid`. Grava `conversation_id`, `duracao_s` e o custo, e não chama `julia_finalizar_ligacao`.

### Campos de duração e custo
- **Conferido no código**: hoje o webhook só lê `metadata.call_duration_secs`. O resto passa sem ser lido.
- **Ainda não confirmado**: a ElevenLabs costuma mandar também `metadata.cost` (créditos) e `metadata.charging` (com preço da IA e da chamada), mas não confirmei isso nos nossos eventos.
- **Primeiro passo da implementação**: registrar só os nomes das chaves de `metadata` de um evento real, sem valores.
- **Custo em R$**: créditos vezes um "R$ por crédito" configurável. Se não houver custo no evento, usa minutos vezes um "R$ por minuto" configurável.

### Gasto total da Júlia
- As ligações de vendedores (entrada e saída) já gravam `duracao_s` em `ligacoes_viagem`.
- Adicionar ali a coluna `custo_creditos`, preenchida pelo mesmo webhook.
- Ligações com `teste=true` (Damian hoje) ficam numa linha separada, chamada "Admin/teste".

### Painel (admin)
Um cartão novo **"Gasto da Júlia"** na tela de configuração da Júlia, ao lado de Ligações:
- Recusadas: quantidade, minutos e custo estimado para hoje, 7 dias e 30 dias.
- Ranking dos 10 números mascarados que mais ligam, com quantidade, minutos e última vez.
- Vendedores (entrada e saída): minutos e custo para hoje, 7 dias e 30 dias, mais a linha Admin/teste e o total geral.
- Os números vêm de uma função SQL `fn_julia_gasto_resumo(dias)`, só para admin. Não lê as linhas soltas no navegador.

### Alerta no sininho
- Limites configuráveis em `app_flags`, editáveis no cartão:
  - `julia_recusadas_max_dia` (padrão 5);
  - `julia_recusadas_min_dia` (padrão 10);
  - `julia_reais_por_credito` / `julia_reais_por_minuto`.
- O webhook, depois de gravar uma recusa, soma o dia (horário de Brasília). Se passar de algum limite, cria uma notificação para cada admin.
- A notificação usa a chave `julia-recusadas:AAAA-MM-DD`, então sai no máximo um aviso por dia, que é atualizado com os números do momento.

## Parte 2: Damian como admin na Júlia

### Quem é admin
- O teste deixa de ser "é o Damian". Passa a ser o papel `admin` em `user_roles`.
- O Damian continua sendo o único admin aceito por telefone (lista fixa de admins com Júlia), para um admin qualquer não ganhar acesso por voz por engano.
- `teste` deixa de ser verdadeiro só por ele ligar. As ligações dele recebem a marca `papel_ligacao='admin'`, nova coluna em `ligacoes_viagem`, e saem do placar dos vendedores.
- A ligação de teste manual pela tela continua como está.
- O atendimento do admin é sempre o modo livre, com "Oi, Damian! Em que posso te ajudar?". Ele não pega a viagem de outro vendedor.

### O que o admin pode fazer por voz
| Ação | Admin | Vendedor |
|---|---|---|
| criar_compromisso | para si ou para um vendedor (`vendedor_nome`) | sempre para si; o campo é ignorado, com aviso |
| registrar_contato_cliente | em nome próprio ou de um vendedor | sempre para si |
| completar_organizacao / completar_contato | sim, autor = admin | como hoje |
| listar_atividades_vencidas | de um vendedor (`vendedor_nome`) ou as próprias | as próprias |
| resolver_atividade | **só as próprias**; as do vendedor ficam com o vendedor | as próprias |
| buscar/vincular_organizacao | sem limite de responsável | como hoje |

### Casamento do nome do vendedor
- Mesma lógica dos contatos: nome completo, depois primeiro nome único, depois aproximado com 1 letra de diferença.
- Vale só entre perfis com papel comercial, rtv ou gerente_comercial.
- Ambíguo ou não encontrado: não grava nada e devolve `confirmar_vendedor` com as opções, para a Júlia perguntar.

### Trava no servidor
- O SQL `julia_criar_compromisso` e o `julia_registrar_contato` recebem `p_responsavel`.
- Se o autor da ligação não for admin, o responsável é forçado para o próprio autor, seja qual for o valor recebido.
- A atividade guarda `criado_por = admin` e `responsavel_id = vendedor`, e o vendedor recebe uma notificação: "Damian marcou: visitar Cocari qui 09:00".

### Variáveis novas
- `eh_admin` ("sim"/"não").
- `vendedores`: lista de primeiros nomes do time comercial, por exemplo "Flávio, Renan, Marcos".
- `recusa_id`, da Parte 1.
- As três precisam ser declaradas no agente, com padrão vazio.

### Campos novos nas ferramentas da ElevenLabs
```json
[
  {"ferramenta":"criar_compromisso","campo":"vendedor_nome","tipo":"string","obrigatorio":false,
   "llm_prompt":"Só se {{eh_admin}}=sim e o admin pediu para outro vendedor. Primeiro nome falado (um de {{vendedores}}). Vazio = o próprio admin."},
  {"ferramenta":"registrar_contato_cliente","campo":"vendedor_nome","tipo":"string","obrigatorio":false,
   "llm_prompt":"Só se {{eh_admin}}=sim e o contato foi feito por um vendedor. Primeiro nome. Vazio = o próprio admin."},
  {"ferramenta":"listar_atividades_vencidas","campo":"vendedor_nome","tipo":"string","obrigatorio":false,
   "llm_prompt":"Só se {{eh_admin}}=sim e ele perguntou pelas atividades de um vendedor. Vazio = as do próprio admin."},
  {"variavel_dinamica":"eh_admin","tipo":"string","padrao":""},
  {"variavel_dinamica":"vendedores","tipo":"string","padrao":""},
  {"variavel_dinamica":"recusa_id","tipo":"string","padrao":""}
]
```
Junto vai um trecho de prompt:
- se `eh_admin=sim`, perguntar "para você ou para algum vendedor?" quando não estiver claro;
- se vier `confirmar_vendedor`, ler as opções;
- nunca dizer que resolveu uma atividade de um vendedor.

## Riscos
- **Custo não vem no evento**: aí o painel mostra só a estimativa por minuto, sinalizada como "estimado".
- **A ligação recusada não chega ao webhook** (ElevenLabs não manda o evento quando a ligação é muito curta): a linha fica com duração vazia e conta 1 ligação com 0 min. O painel mostra "sem duração".
- **Privacidade**: não se guarda o número completo de estranhos. Com o sal, o hash não é revertido por tabela pronta, mas também não deixa ligar de volta. Se o CEO quiser bloquear um número no Twilio, terá de pegar o número no próprio Twilio.
- **Admin por voz é poder alto**: quem clonar o número do Damian poderia criar tarefas para vendedores. Mitigações:
  - nada destrutivo por voz (não resolve atividades dos outros, não descarta);
  - toda ação do admin notifica o vendedor afetado.
- **Nome de vendedor errado**: uma tarefa poderia ir para a pessoa errada. Mitigações:
  - sem casamento único, não grava;
  - a mensagem de retorno sempre diz o nome usado, para a Júlia confirmar em voz.
- **Mudar o `teste` do Damian**: tirar o `teste=true` muda a forma como as ligações dele aparecem.
  - O placar passa a excluir as ligações com `papel_ligacao='admin'`. Isso exige revisar as consultas de métricas.
  - O antigo "teste não agenda retorno" continua valendo para admin.
- **Atualização do agente**: as variáveis novas precisam ser declaradas no agente antes do deploy. Sem isso, o agente ignora os valores, sem quebrar nada.

## SQL (só com aprovação)
- Tabela `julia_ligacoes_recusadas`, com GRANT para service_role, RLS e SELECT só para admin.
- `ligacoes_viagem`: novas colunas `custo_creditos` e `papel_ligacao` (`vendedor` | `admin`, padrão `vendedor`).
- Chaves novas em `app_flags`.
- `fn_julia_gasto_resumo` (só admin).
- `fn_casar_vendedor(_nome)`.
- `julia_criar_compromisso` e `julia_registrar_contato` com `p_responsavel` e a trava de admin.
- `julia_listar_vencidas` com o alvo validado.

O SQL vai para `docs/sql/julia-gasto-admin-proposta.sql` e só é aplicado depois da aprovação.

## Detalhes técnicos
- Regra única de quem liga e com qual papel em `_shared/vendedorTelefone.ts`, usada pela entrada.
- Casamento do vendedor espelhado em `_shared/vendedores.ts`, com testes: Flávio/Flavio, ambíguo e vendedor tentando atribuir a outro.
- Teste da trava: um vendedor que manda `vendedor_nome` fica como responsável.
- Teste do webhook: recusa com e sem `recusa_id`.
- Tela: `JuliaGastoCard` dentro de `JuliaConfiguracao`, mais o hook `useJuliaGasto`.
