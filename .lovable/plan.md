# Viagens com custo, pernoite e diário de bordo

Nada será aplicado até a aprovação. O plano do funil e a coluna `coordenada_aproximada` continuam pendentes e fora deste plano.

## Entrega em 3 etapas

| Etapa | O que o vendedor ganha | Usável sozinha? |
|---|---|---|
| 1 | Viagem de vários dias, pernoite com hotel, traçado e km por dia, custo estimado (combustível, pedágio, hotel, alimentação), cadastro de veículos e preço do combustível | Sim |
| 2 | Diário de bordo no celular (texto, foto, localização), prestação da parada no mesmo dia, página "Acompanhar viagem", lista "Viagens em andamento" | Sim |
| 3 | Gastos reais com nota fiscal, comparativo estimado x real, resumo mensal por vendedor | Sim |

---

## Etapa 1 — Vários dias, pernoite e custo estimado

### Banco (migration idempotente, sem apagar dados)
- `rotas`: novas colunas `data_inicio date` e `data_fim date`, preenchidas a partir de `data_rota` nas rotas existentes (todas viram viagens de 1 dia). `data_rota` **fica** e passa a ser sempre igual a `data_inicio`, mantida por trigger. Assim os e-mails "rota de amanhã" e "resumo diário", os testes e as telas atuais continuam funcionando sem mudança. Validação por trigger: `data_fim >= data_inicio`, no máximo 15 dias.
- `rotas`: `veiculo_id`, `alimentacao_dia_estimada numeric` (opcional, sem valor padrão), e o retrato do custo: `custo_combustivel_est`, `custo_pedagio_est`, `custo_hospedagem_est`, `custo_alimentacao_est`, `custo_total_est`, `tempo_total_estimado_s`, `pedagio_consultado_em`, `pedagio_assinatura` (resumo do trajeto consultado) e `pedagio_detalhe jsonb`.
- `rota_paradas`: `dia date` (as paradas atuais recebem a data da rota), e para o tipo novo `pernoite`: `hotel_nome`, `valor_diaria_est`. A parada de pernoite usa `cidade/estado/lat/lng`, não cria atividade de visita e não exige objetivo nem prestação "Visitei/Não visitei".
- Nova tabela `veiculos`: modelo, combustível (`diesel`/`gasolina`), consumo km/L, placa (opcional), vendedor, ativo. Dados iniciais: S10 diesel 11,5 km/L para Flávio e para Renan, Toro gasolina 10 km/L para Murilo. Acesso: todo usuário aprovado pode ver; só o admin altera.
- Nova tabela `viagem_parametros` (uma linha só): preço do diesel e da gasolina. O admin edita; todos podem ver.

### Travas atuais adaptadas para o período (mesmas regras, nova data)
- "Viagem passada não pode ter o plano alterado" passa a valer quando a **data de fim** já passou.
- A prestação de contas é liberada a partir da **data de início** de uma viagem aprovada. Hoje ela já é aceita no dia da viagem, então isso já cobre a prestação "no mesmo dia".
- O bloqueio de nova viagem passa a valer quando existe viagem aprovada com **data de fim** passada sem prestação.
- A reaprovação quando uma rota aprovada é editada continua igual. Alterar dia ou pernoite também conta como edição.
- Em rotas antigas, início = fim = `data_rota`, então o resultado é exatamente o de hoje. Vou rodar os testes de banco atuais (`rotasBanco.test.ts`) mais os novos, com a migration aplicada duas vezes num banco descartável.

### Pedágio (QualP) e uso dos créditos
- Nova edge function `pedagio-viagem`, separada da `rotas-brasil-frete`, que não muda (a Calculadora de Frete fica intacta). A nova função usa o mesmo `QUALP_TOKEN` com veículo de passeio/caminhonete de 2 eixos e sem tabela de frete.
- **Quando consulta:** só quando o vendedor clica em "Enviar para aprovação". A função calcula uma assinatura do trajeto (coordenadas das paradas em ordem, mais base e pernoites). Se a assinatura for igual à da última consulta, ela reaproveita o valor salvo e **não gasta crédito**. Ela só consulta de novo quando o trajeto mudou e a viagem é reenviada. Ao editar, o card mostra "Pedágio: será calculado ao enviar" ou o último valor com o aviso "trajeto mudou".
- **Segurança:** a função confere o login e se a pessoa é dona da rota ou admin, monta os pontos lendo a rota no banco (não aceita pontos enviados pela tela) e grava o resultado com permissão de serviço.
- **Se a QualP falhar:** a viagem é enviada mesmo assim, com "Pedágio indisponível" no custo, e o admin vê esse aviso na aprovação.
- **Pré-requisito:** a chave de serviço do Supabase precisa estar nas Secrets das funções. Hoje ela consta como não configurada.

### Hotéis
- A tela mostra o botão "Sugerir hotéis perto da última parada do dia", que usa o Google Places (`nearbySearch` com tipo `lodging`, raio de 15 km). Se a chave atual não tiver o Places liberado, fica só o campo livre (nome do hotel e cidade). O valor da diária é sempre digitado pelo vendedor.

### Traçado por dia
- Para cada dia, o percurso é: ponto de partida (base no 1º dia, ou o pernoite da véspera) → paradas → pernoite do dia (ou a base, no último dia). Isso reaproveita `calcularRota` uma vez por dia. Km e tempo são mostrados por dia e no total. O aviso "Rota longa para um dia" (mais de 10 h) passa a valer por dia.
- "Otimizar ordem" reordena dentro de cada dia. Google Maps e Waze funcionam por dia.
- "Clientes no caminho" e o mapa de todos os clientes continuam valendo, sobre o traçado do dia escolhido. Uma sugestão adicionada entra no dia mais barato.

### Custo estimado
- Combustível = km total ÷ consumo do veículo × preço do combustível. Pedágio vem da QualP. Hospedagem = soma das diárias dos pernoites. Alimentação = valor por dia × número de dias, só se for preenchido.
- O cálculo fica numa função pura testável. O card "Investimento desta viagem: R$ X", com o detalhamento, aparece no editor, na aprovação (`RotasAprovacoes`/`RotaMapa`) e na lista de viagens. O valor estimado é congelado no envio para aprovação, para o admin aprovar exatamente o que viu.

### Telas
- Editor (`RotaEditor`): período (início e fim), seletor de veículo (o do vendedor já vem escolhido), abas ou seções por dia, botão "Adicionar pernoite" ao fim de cada dia, e o card de custo.
- Nova tela `/configuracoes/viagens` (só admin): veículos e preço do combustível.
- Lista de rotas: mostra o período e o custo.

---

## Etapa 2 — Diário de bordo e acompanhamento

### Banco e arquivos
- Nova tabela `rota_diario`: rota, parada (opcional), organização (opcional), autor, texto, data e hora, lat/lng (opcional), lista de fotos.
- Regras de acesso: o dono da rota escreve durante a viagem aprovada (entre o início e o fim, com 1 dia de tolerância depois). O dono da rota e quem gerencia viagens (admin e gerente comercial) podem ler. Ninguém altera o texto depois de gravado; só o admin apaga.
- Bucket privado `viagens` (fotos do diário e, na etapa 3, notas fiscais). Os arquivos ficam na pasta da rota (`{rota_id}/...`) e as regras de acesso conferem o dono da rota ou o admin/gerente. As fotos são abertas por links temporários.

### Telas pensadas para o celular
- `/viagens/:id/hoje`: as paradas do dia, cada uma com botões grandes "Visitei", "Não visitei" e "Waze", e o botão fixo "+ Informativo" (texto, câmera, ligar a uma parada). Usa o mesmo diálogo de conclusão que já existe.
- `/viagens/:id/acompanhar`: mapa do trajeto, status de cada parada, diário em linha do tempo, custo estimado (e o real, depois da etapa 3).
- "Viagens em andamento" para o admin: viagens aprovadas cujo período inclui hoje, com o progresso das paradas e o último informativo.

### Link público: recomendo não fazer
A página fica **só para usuários logados** (o próprio vendedor e admin/gestor). Um link público exporia nomes de clientes, negociações, valores, fotos e a localização em tempo real do vendedor. Qualquer pessoa com o link encaminhado teria acesso, sem como saber quem viu. Se no futuro for preciso mostrar a viagem a alguém de fora, a alternativa é um link temporário que mostra só o trajeto e as cidades, sem clientes nem valores, e que expira no fim da viagem.

---

## Etapa 3 — Notas fiscais e resumo

- Nova tabela `rota_gastos`: rota, categoria (combustível, pedágio, hotel, alimentação, outros), valor, data, descrição, arquivo da nota (bucket `viagens`), autor. O vendedor lança até o fechamento da prestação. Depois disso, só o admin altera.
- A prestação final passa a pedir também os gastos (dá para concluir com zero gastos lançados, mas aparece um aviso). Os triggers de prestação atuais continuam como a autoridade.
- Comparativo estimado x real por categoria e no total, nas telas de acompanhamento e de aprovação.
- Resumo mensal por vendedor (em `/relatorios`): investido em viagens, número de visitas feitas, custo por visita, deals que mudaram de etapa no período (pelo `historico_oportunidade`) e orçamentos e propostas criados no período. A separação referência/projeto entra quando o plano do funil for aplicado.

---

## Não muda
Calculadora de Frete e a função `rotas-brasil-frete`, Orçamento, CRM, Atividades (além da visita criada como hoje), Diagnóstico e as regras de aprovação. As regras só têm a data adaptada para o período.

## Testes
- Funções puras: custo (combustível, hospedagem, alimentação opcional), divisão do percurso por dia (base → pernoite → base), assinatura do trajeto (muda só quando o trajeto muda).
- Banco: rotas antigas se comportam igual; plano bloqueado depois da data de fim; prestação liberada a partir da data de início; nova viagem bloqueada por viagem com data de fim passada sem prestação; edição de pernoite manda a rota de volta para aprovação; regras de acesso ao diário, aos gastos e aos arquivos (dono e admin sim, outro vendedor não).
- Edge function: sem login é recusada; assinatura igual não chama a QualP.

## Precisa de você
1. Adicionar `SUPABASE_SERVICE_ROLE_KEY` nas Secrets das funções. A função de pedágio precisa dela para gravar o valor.
2. Confirmar se o Google Places está liberado na chave do Maps. Se não estiver, os hotéis ficam só em campo livre.
3. Confirmar quem gerencia viagens além do admin. Proposta: o gerente comercial também aprova e acompanha.
