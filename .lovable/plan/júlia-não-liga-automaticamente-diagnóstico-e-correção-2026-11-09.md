# Júlia não liga automaticamente — diagnóstico e correção

## O que já confirmei no banco e no código
- `viagem_parametros`: a política de escrita só exige papel admin, e o papel `authenticated` tem permissão de UPDATE. **A correção de segurança de ontem não mexeu nisso.**
- Celulares atuais (Damian, Flávio, Murilo, Renan) são todos válidos no formato +55. A Vanessa (admin) não aparece na lista.
- Nenhum job da Júlia em `cron.job`. A proposta `docs/sql/julia-viagem-cron-proposta.sql` existe, mas **nunca foi executada**. Ela depende do segredo `JULIA_CRON_SECRET` também guardado no Vault do Supabase, e não consigo ler o Vault.
- O botão "Ligar agora" (admin) chama `julia-viagem-ligar` no modo manual. Esse modo **não depende** de `ligacao_ativa` nem do cron.

## 1. Por que o "Salvar Júlia" não enviou nada
**Causa ainda não confirmada.** Não consigo abrir a tela logado. Pelo código, o clique pode terminar sem enviar nada em 4 situações, e em nenhuma delas a tela explica direito o que houve:
- **Botão desabilitado sem explicação:** acontece quando a lista de celulares ainda está carregando ou deu erro, ou quando os parâmetros não carregaram.
- **"Celular inválido":** o aviso some rápido e não diz de qual vendedor é.
- **Horário fora de 15h50–21h59:** no iPhone, o campo de hora pode devolver um formato diferente, e a comparação de texto pode falhar.
- **Botão errado:** o "Salvar" do topo da página só grava combustível e veículos. É fácil confundir os dois no celular.

Há ainda um risco silencioso: se o banco recusar a gravação pelas regras de acesso, ele responde "0 linhas" sem erro, e a tela mostra "salvo" mesmo assim.

**Correção (só na tela, sem mudar regras):**
- **Avisos fixos na tela, em vez de só toast:**
  - mostrar por que o botão está desabilitado;
  - dizer qual vendedor tem o celular inválido;
  - avisar quando o horário está fora da faixa.
- **Horário:** normalizar o valor do campo (HH:MM) antes de validar.
- **Gravação:** primeiro gravar o switch e o horário, depois os celulares, e só os que mudaram.
- **Conferir o retorno:** ler de volta a linha gravada. Se voltar vazia, mostrar o erro "Sem permissão para salvar (precisa ser admin)".
- **Ao lado do switch:** mostrar o status salvo ("Ligações automáticas: LIGADAS desde …").
- **Verificação:** um teste local da validação de horário e celular, e o CEO tenta salvar de novo no iPhone.

## 2. Como deveria funcionar o automático
```text
cron (a cada 10 min, 15h50–22h e 9h–9h10 BRT)
  -> julia-viagem-ligar {modo:"cron"} com x-cron-secret
     - sai se ligacao_ativa=false ou fora da janela
     - rotas aprovadas com data de hoje entre data_inicio e data_fim
     - só se houver pendência (noite sem "onde dormi" ou parada pendente no último dia)
     - a partir de contato_hora: reserva 1 ligação 'inicial' por vendedor/dia (unicidade no banco)
       e manda ao vendedor a escolha de horário (agora/18h/19h/20h/app)
     - disca as ligações agendadas que já venceram (claim atômico, nunca duas vezes)
     - nada disca depois de 22h
  9h: avisa "dia aberto" das viagens de ontem
```
- Religar quando cai ou não atende fica com as regras que já existem (webhook e retentativas). Nada muda nelas.
- `viagem-sincronizar-pendencias` só sincroniza os avisos do sininho e não disca.
- **Atenção:** se nenhum horário for escolhido, a ligação automática fica para no mínimo 17h, mesmo com contato_hora 16:00. O código já é assim e não vou mudar.

**Agendamento proposto:** aplicar a proposta que já existe, um único job `julia-viagem-fechamento` a cada 10 minutos.
- **Frequência:** cerca de 54 verificações por dia, e só cerca de 39 chamam a função, dentro das janelas.
- **Atraso:** até 10 minutos.
- **Custo:** gasta recursos do banco mesmo quando não há trabalho. Um intervalo maior atrasaria o "Agora" e os retornos.

**Pré-requisito do CEO, antes do SQL:**
1. Em Supabase → Edge Functions → Secrets, trocar `JULIA_CRON_SECRET` por um valor forte que ele conheça.
2. Em Supabase → Project Settings → Vault, criar um segredo com o mesmo nome `JULIA_CRON_SECRET` e o mesmo valor.

O SQL se recusa a criar o job se o segredo não estiver no Vault. **SQL e cron só depois da sua aprovação.**

**Verificação depois:** conferir `cron.job` e `net._http_response` (deve responder 200, `desativada` false), e ver em `ligacoes_viagem` 1 inicial por vendedor no dia.

## 3. Para HOJE (agora são cerca de 18h20 em Brasília)
- O CEO abre a viagem do Flávio e depois a do Renan, em Viagens → Acompanhar, e toca **"Ligar agora"**. Funciona até 21h59, sem o switch e sem o cron.
- Se não houver pendência, a tela diz o motivo ("Não foi possível discar: …").
- Quando der erro, os admins recebem aviso no sininho.

## Riscos
- **Causa do item 1 não confirmada sem sessão logada:** a correção cobre todas as hipóteses e passa a mostrar o motivo na tela.
- **Segredo diferente entre a função e o Vault:** o cron recebe 401 em silêncio. A verificação por `net._http_response` detecta isso.
- **Ligações e WhatsApps reais:** ao ligar o switch com o cron ativo, a Júlia começa a ligar e a mandar WhatsApp de verdade no mesmo dia, se já passou do contato_hora.
- **Custo de ElevenLabs/telefonia:** sobe com as ligações diárias.

## Detalhes técnicos
- **Arquivo alterado:** só `src/components/viagens/JuliaConfiguracao.tsx`, mais um pequeno helper puro de validação com teste.
- **Gravação conferida:** `update(...).eq('id','padrao').select().single()` para detectar 0 linhas.
- **Sem mudanças em:** `julia-viagem-ligar`, regras e tabelas.
- **Cron:** sai de `docs/sql/julia-viagem-cron-proposta.sql`, executado por SQL direto (não por migração), porque a URL e a chave são deste projeto.
