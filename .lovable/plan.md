# Júlia: salvar o switch e ligar automaticamente

## O que já está confirmado
- **O salvar de combustível não apaga o switch.** O botão "Salvar" do topo grava só `preco_diesel` e `preco_gasolina` em `viagem_parametros`, mais os veículos. A regra do banco nessa tabela só valida os preços e não mexe em `ligacao_ativa`.
- **O PATCH das 18:23 foi do botão errado.** Ele veio do "Salvar" do topo, e não do "Salvar Júlia". O switch ficou só na tela e nunca foi enviado.
- **"Salvar Júlia" já foi corrigido na rodada anterior, mas ainda não foi publicado.**
  - Mostra na tela o motivo de o botão estar indisponível.
  - Mostra o erro de horário ou de celular com o nome do vendedor.
  - Confere que a gravação aconteceu (sem permissão = erro na tela).
  - Mostra "Salvo no sistema: LIGADAS/DESLIGADAS".

## 1. Salvar sem confusão
**Recomendação: o switch salva sozinho ao tocar, e os dois botões ganham nomes claros.** Não recomendo um único Salvar para a página toda: um erro num veículo travaria a Júlia.

- **Switch "Ligações automáticas":**
  - ao tocar, grava na hora só `ligacao_ativa`;
  - mostra o aviso "Ligações automáticas LIGADAS";
  - em caso de erro, volta à posição anterior e mostra o erro na tela.
  - Ao ligar, pede confirmação: "A Júlia vai ligar de verdade para os vendedores em viagem."
- **Horário de contato e celulares:** continuam no botão, que passa a se chamar "Salvar horário e celulares". Grava só esses campos.
- **Botão do topo:** passa a se chamar "Salvar combustível e veículos". Continua gravando só os preços e os veículos (como já faz).
- **Aviso de alterações não salvas:** um aviso "Alterações não salvas" perto de cada botão quando o campo foi mexido e ainda não gravado.

## 2. Ligações automáticas: quem faz e o agendamento
**A discagem é feita por `julia-viagem-ligar` no modo `cron`.** `viagem-sincronizar-pendencias` só atualiza o sininho e não disca.

```text
a cada 10 min (15h50–22h e 9h–9h10, Brasília)
 -> julia-viagem-ligar {modo:"cron"}, com segredo x-cron-secret
    - sai se ligacao_ativa=false
    - só rotas aprovadas com hoje entre data_inicio e data_fim
    - só se houver pendência (noite sem "onde dormi" ou parada pendente no último dia)
    - a partir de contato_hora: 1 ligação 'inicial' por vendedor por dia
      (reserva única no banco) + escolha de horário pelo WhatsApp
    - disca as ligações que já venceram, com trava atômica (nunca duas vezes)
    - religar fica com as regras já existentes (webhook/retentativas)
    - não disca depois das 22h
 9h: avisa "dia aberto" das viagens de ontem
```

**Janela até 21h:** hoje o código para às 22h (21h59). Recomendo manter, porque é a regra aprovada. Se o CEO quiser parar às 21h, isso exige mudar uma linha na função e no cron. **Confirme qual prefere.**

**Agendamento:** usar a proposta pronta `docs/sql/julia-viagem-cron-proposta.sql`, com um único job `julia-viagem-fechamento`.
- **Frequência:** cerca de 54 verificações por dia, e só umas 39 chamam a função.
- **Atraso máximo:** 10 minutos.
- **Custo:** a verificação gasta recursos do banco mesmo quando não há trabalho. Um intervalo maior atrasaria o "Agora" e os retornos.

**Pré-requisito do CEO (o SQL se recusa a rodar sem isso):**
1. Em Supabase → Edge Functions → Secrets, trocar `JULIA_CRON_SECRET` por um valor forte que ele conheça.
2. Em Project Settings → Vault, criar um segredo com o mesmo nome e o mesmo valor.

**Depois de aplicar, eu confiro:**
- `cron.job` com o job novo;
- as respostas 200 da função, com `desativada:false`;
- 1 ligação inicial por vendedor no dia.

**SQL e cron só depois da sua aprovação.**

## 3. Para hoje
1. Publicar o app.
2. Abrir a viagem do Flávio em Viagens → Acompanhar e tocar **"Ligar agora"**. Depois fazer o mesmo na viagem do Renan.

Funciona até 21h59, sem depender do switch nem do cron. Se a Júlia não puder discar (sem pendência, celular ou fora do período), a tela mostra o motivo, e os admins recebem aviso no sininho se der falha.

## Riscos
- **Ligações e WhatsApp reais:** ligar o switch com o cron ativo faz a Júlia ligar e mandar WhatsApp de verdade no mesmo dia, se já passou do horário de contato.
- **Segredo diferente entre a função e o Vault:** o cron recebe 401 em silêncio. A conferência depois de aplicar detecta isso.
- **Mais custo de ElevenLabs/telefonia:** com as ligações diárias.
- **Salvar ao tocar:** um toque sem querer liga as ligações. A confirmação ao ligar evita isso.

## Detalhes técnicos
- **Arquivos alterados:**
  - `src/components/viagens/JuliaConfiguracao.tsx`: o switch chama o update de `ligacao_ativa` com `.select().maybeSingle()` e desfaz a mudança se der erro.
  - `src/pages/ConfiguracoesViagens.tsx`: só o nome do botão.
- **Sem mudanças em:** funções, regras e tabelas.
- **Cron:** roda por SQL direto (`cron.schedule` + `net.http_post`), não por migração.
