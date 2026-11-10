# Júlia: dias anteriores, avisos de fechamento, completar_contato e seletor no iPad

O agendamento `julia-viagem-fechamento` e o switch não serão tocados.

## 1. Júlia cobre os dias anteriores da viagem
**Hoje:** `montarPendencias` só cobra a noite de hoje (`pernoite_noite` para a data atual). Não olha noites anteriores nem dias sem visita. A rota do Renan só tem pernoite de 09/11, e a noite de 08/11 nunca foi cobrada.

**Depois:**
- **Novas pendências, sempre antes das de hoje, da mais antiga para a mais nova:**
  - `pernoite_noite` para **cada** noite de `data_inicio` até ontem sem registro, com o texto "noite de domingo, 08/11".
  - `dia_sem_registro` para cada dia passado sem nenhuma parada contabilizada (`rota_paradas.dia`) e sem marcação de "dia sem visita".
- **Dia só de deslocamento:** nova tabela `rota_dias_sem_visita` (rota, dia, motivo: deslocamento/folga/outro, observação, quem registrou). Assim o dia some das pendências. Ela é validada por gatilho: o dia precisa estar dentro da viagem e já ter passado, só o dono da rota ou o admin registra, e o dia não pode já ter visita.
- **Nova ferramenta da Júlia `registrar_dia_sem_visita`** (data, motivo, observação). No app, um botão na tela da viagem faz o mesmo.
- **`registrar_pernoite` ganha o campo opcional `noite`** (AAAA-MM-DD). Sem ele, vale a noite de hoje, como já acontece. O banco recusa uma noite fora da viagem ou no futuro.
- **Visita esquecida de um dia anterior:** a Júlia usa o `registrar_visita` de hoje. O dia realizado continua sendo o da contabilização, regra que não muda.
- **Variáveis da ligação:** `pendencias_texto` passa a listar os dias antigos primeiro. Entra a variável nova `dias_atrasados`, por exemplo "domingo, 08/11".
- **O que vou entregar:** o trecho do prompt ("resolva um dia antigo por vez, depois hoje") e o JSON completo de `registrar_pernoite` (campo `noite`) e de `registrar_dia_sem_visita`, no formato de webhook que já usamos.
- **Ligações automáticas:** passam a ver as pendências antigas, então a Júlia liga mesmo quando o dia de hoje já está fechado e falta um dia anterior.

## 2. Avisos aos admins sobre o fechamento
Os avisos vão para o sininho e viram push, com uma chave única por vendedor e dia.

- **a) "✓ Renan fechou o dia: 3 visitas (Cocari, Morena, Andreis), pernoite em Cascavel"**
  - **Quando:** a última pendência da viagem até hoje foi resolvida, pela Júlia ou pelo app.
  - **Chave:** `fechou:<rota>:<dia>`.
  - **Recomendação:** push, mas **respeitando o silêncio** (às 21h50 chega às 7h). É uma informação, não exige ação.
- **b) "⚠ Flávio: ligação caiu, falta: onde dormiu, 1 parada"**
  - **Quando:** substitui o aviso atual de "caiu" quando ainda há pendências. Se a ligação caiu mas não falta nada, vira o aviso (a).
  - **Chave:** `caiu:<ligacao>`, como hoje.
  - **Recomendação:** push **fora do silêncio**, até 21h59, porque o admin ainda pode tocar em "Ligar agora".
- **c) Às 22h (BRT): "✗ Flávio não fechou o dia, falta: … · tentativas: 3 ligações, 2 não atendidas, 1 caída"**
  - **Chave:** `naofechou:<rota>:<dia>`.
  - **Recomendação:** sininho e push **respeitando o silêncio**, chegando às 7h. À noite o admin não tem o que fazer.
  - **Agendamento:** sem criar outro job. A execução das 22h do agendamento que já existe (`julia-viagem-ligar`, modo cron) gera esse resumo.
- **Onde o fechamento é detectado:** no servidor. A ferramenta da Júlia e a sincronização de pendências do app passam a chamar um único passo "conferir fechamento".
- **Regras de push:** novas entradas em `push_regras` para `fechou:`, `caiu:` e `naofechou:`.

## 3. Bug completar_contato com o ID da parada
**Hoje:** o `confirmar_contato` de `registrar_visita` não traz `organizacao_id`. A Júlia aproveitou o `parada_id` e recebeu 400.

**Depois:**
- **Resposta mais clara:** `confirmar_contato` passa a trazer `organizacao_id` e `organizacao_nome` explícitos em `registrar_visita` e `registrar_contato_cliente`.
- **`completar_contato` aceita `parada_id`:** com ele, o servidor descobre a organização da parada. Se vier um `organizacao_id` que na verdade é o ID de uma parada do vendedor, o servidor também resolve, para não quebrar ligações já em curso.
- **Erro:** se nada casar, a resposta passa a ser "Use o organizacao_id que veio em confirmar_contato".
- **O que vou entregar:** o JSON atualizado de `completar_contato`, com `parada_id` opcional e `organizacao_id` deixando de ser obrigatório.
- **Teste:** um teste novo para o caso real.

## 4. Seletor de organização no iPad/celular (Diagnóstico)
- **Celular e iPad (até 1024 px ou toque):** o seletor abre numa **tela de baixo para cima** (bottom sheet), quase em tela cheia:
  - a busca fica no topo, sem nada cortado atrás do cabeçalho;
  - a lista rola sozinha acima do teclado.
- **Destaque e seleção:**
  - o destaque acompanha só o item sob o dedo;
  - ao abrir, o destaque inicial fica no item selecionado, e não no primeiro da lista (era assim que o Agromave aparecia);
  - o item selecionado ganha ✓ e fundo verde.
- **Computador:** a lista continua abrindo para baixo, com mais espaço.
- **Abrangência:** o mesmo seletor é usado em outras telas, que também melhoram. Só muda a aparência; os dados não mudam.

## Riscos
- **Ligações a mais:** com os dias antigos contando, a Júlia vai ligar hoje para cobrar o domingo do Renan, e isso gasta mais minutos.
- **Dias antigos marcados sem visita:** "dia sem visita" pode esconder visitas esquecidas. O admin vê o motivo na viagem.
- **Prompt pesado:** com muitos dias abertos, a Júlia pode se perder. Vou limitar a 3 dias antigos por ligação; o resto fica para a próxima.
- **Excesso de avisos:** com 4 vendedores, o admin pode receber de 8 a 12 avisos por dia. Se ficar demais, o (a) pode virar só sininho.
- **Seletor:** muda em todas as telas que o usam; vale testar no iPad depois de publicar.
- **ElevenLabs:** até o CEO colar os JSONs novos, `registrar_pernoite` continua gravando só a noite de hoje.

## Detalhes técnicos
- **`_shared/pendenciasDia.ts`:**
  - `ContextoPendencias` ganha `diasSemVisita` e os dias contabilizados das paradas;
  - novo tipo `dia_sem_registro`, e `pernoite_noite` passa a ser gerado por noite;
  - a ordem fica antigos → hoje, com limite de 3;
  - um helper `dataExtenso` em pt-BR;
  - testes Deno/Vitest para o caso do Renan.
- **Ferramentas:** `schema.ts` e `index.ts` de `julia-viagem-ferramentas` (pernoite `noite`, `registrar_dia_sem_visita`, `completar_contato` com `parada_id`, `organizacao_id` em `confirmar_contato`). A variável nova sai de `_shared/variaveisLigacao.ts`.
- **SQL para aprovação** (`docs/sql/julia-dias-anteriores-proposta.sql`), com proposta apenas e nada aplicado sem o seu ok:
  - a tabela `rota_dias_sem_visita` com GRANTs, RLS (`fn_pode_ver_rota`) e o gatilho de validação;
  - a RPC da Júlia para "dia sem visita", só para o servidor;
  - a revisão da RPC de pernoite para aceitar a noite;
  - as linhas de `push_regras` para `fechou`, `caiu` e `naofechou`, com a regra de silêncio de cada uma.
- **Webhook:** `julia-viagem-webhook` monta o texto "falta: …" com `montarPendencias`.
- **Às 22h:** `julia-viagem-ligar` gera o resumo, contando as tentativas a partir de `ligacoes_viagem` (status `nao_atendeu` / `interrompida`).
- **Seletor:** `SeletorOrganizacao`, com Drawer (vaul) no toque e Popover com `side="bottom"` e `avoidCollisions` no desktop. Abre com `value` do cmdk igual ao item selecionado e `scrollIntoView`.
