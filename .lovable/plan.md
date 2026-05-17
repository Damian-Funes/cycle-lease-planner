# Regra de equipamentos contidos no desenho

## Objetivo

Quando um equipamento "pai" já representa visualmente outros no desenho (ex: dosador de líquido 0506 já contém caixa de contenção e tombador de IBC 1101), o item filho não deve aparecer no layout — mesmo que continue no orçamento/proposta com sua quantidade original.

A regra precisa valer em dois momentos:
1. **Ao gerar o layout** a partir de proposta/orçamento (não cria o filho).
2. **No editor**, em tempo real (se o usuário adicionar manualmente, o filho some quando o pai existir; se remover o pai, o filho reaparece como permitido).

## Decisão de arquitetura

Vou usar uma **nova tabela `equipamento_contidos`** no banco (pai → filho), administrada pela tela do **Catálogo** (área protegida por senha que já existe).

Justificativa (já que pediu para eu escolher sem errar):
- Cadastrar no próprio equipamento (coluna array) funcionaria, mas relacionar via tabela é mais limpo, audita melhor, evita duplicidade e permite mostrar "este código está contido em X" nos dois lados.
- Fixar no código foi descartado: você pediu para "não cometer erros" e disse que provavelmente surgirão mais pares no futuro — toda alteração exigiria deploy.
- Reaproveitar a tela do Catálogo evita criar nova rota e mantém a gestão de equipamentos num lugar só.

## O que será feito

### 1. Banco (migration)

Nova tabela `equipamento_contidos`:
- `equipamento_pai_id` (FK lógica para `equipamentos.id`)
- `equipamento_filho_id` (FK lógica para `equipamentos.id`)
- UNIQUE (pai, filho), CHECK pai ≠ filho
- RLS: admin gerencia, usuários aprovados leem.

### 2. Catálogo (admin)

Na linha/edição de cada equipamento, adicionar seção **"Itens já inclusos no desenho"**:
- Multi-select de outros equipamentos do catálogo.
- Salvar grava em `equipamento_contidos`.
- Mostra também o caminho inverso ("este item está contido em: …") só como info.

### 3. Geração de layout (`src/pages/Layouts.tsx`)

No fluxo "Novo Layout":
- Carregar todos os pares `(pai, filho)` cujos pais estão nos itens da proposta/orçamento.
- Construir o conjunto de `equipamento_id` "ocultos" = filhos cujos pais estão presentes.
- Pular esses itens no loop de inserts — quantidade do orçamento é ignorada **só para o desenho**.
- Toast informativo: "N item(s) ocultado(s) por já estarem representados: 1101, 0318M30…".

### 4. Editor de Layout (`src/pages/LayoutEditor.tsx`)

- Carregar pares uma vez ao abrir.
- Calcular `ocultos` reativo a `items`: filho oculto sse pai presente.
- Render 2D/3D e lista de items filtram por `!ocultos.has(equipamento_id)`.
- Ao adicionar manualmente um filho cujo pai já está na cena: bloquear com toast ("Já está representado por 0506").
- Ao remover o pai, filhos previamente "ocultos" voltam a aparecer automaticamente (continuam existindo no banco).

### 5. Pares iniciais

Migration popula a tabela com:
- `0506` → `1101`
- (máquina pai dos `0318M30` e `0318M35` — preciso confirmar qual código é antes de inserir; deixo um TODO se não souber)

## Detalhes técnicos

- Origem da verdade: `equipamento_contidos`. O orçamento/proposta **não** é modificado — preço e quantidades seguem como estão.
- Performance: 1 query extra por abertura do editor / geração; cache em memória.
- Conexões (`layout_conexoes`) envolvendo um item oculto deixam de ser desenhadas enquanto o filho estiver oculto (filtro no render, sem deletar do banco).
- Backwards compat: layouts existentes que já têm o filho inserido continuam mostrando-o; a regra só age quando há também o pai no mesmo layout. Opcional: botão "Limpar duplicados" no editor que apaga os filhos cobertos (proponho deixar para depois).

## Pontos abertos para confirmar depois

- Qual é o código do "pai" que já contém `0318M30` e `0318M35`? (para semear na migration)
- Deve existir botão "Limpar itens duplicados" para sanear layouts antigos?
