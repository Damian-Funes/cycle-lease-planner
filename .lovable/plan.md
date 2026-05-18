# Itens avulsos no Orçamento de Venda

Permitir adicionar itens fora do catálogo (ex: haste de agitador, peças, partes de equipamento) dentro de um orçamento, com opção de salvar no catálogo para reutilização.

## Escopo

- Apenas Orçamento de **Venda** (Reforma fica para depois).
- Itens avulsos somam normalmente no total e refletem no valor da oportunidade no CRM (já funciona automaticamente, pois o total do orçamento é o que alimenta o CRM).

## Fluxo

Na seção "Itens do Orçamento", ao lado do botão "+ Adicionar" do seletor de equipamento, adicionar um botão **"+ Item avulso"** que abre um modal com:

- **Código** (obrigatório, auto-uppercase)
- **Descrição** (obrigatório, auto-uppercase)
- **Valor unitário** (obrigatório, formatação pt-BR em tempo real)
- **Quantidade** (default 1)
- Checkbox **"Salvar no catálogo para reutilizar"**

Comportamento:
- Item entra na lista normalmente, marcado visualmente como "avulso" (badge cinza ao lado do código).
- Se "Salvar no catálogo" marcado: cria registro em `equipamentos` com `valor_custo=0`, `valor_venda=<valor>`, `categoria='Peças/Partes'`, `ativo=true`. Próximos orçamentos encontram via seletor normal.

## Estrutura técnica

**Sem migração de schema.** O JSONB `itens` em `orcamentos` já é flexível; adiciona-se um flag opcional:

```ts
interface ItemOrcamento {
  equipamento_id: string;   // "avulso" quando avulso (não vincula a equipamentos)
  codigo: string;
  descricao: string;
  valor_unitario: number;
  quantidade: number;
  sem_preco_venda?: boolean;
  avulso?: boolean;         // NOVO: marca item criado manualmente
}
```

Quando "Salvar no catálogo" estiver marcado, inserir em `equipamentos` antes de adicionar à lista; o `equipamento_id` passa a ser o uuid retornado (e `avulso` fica false, virou catálogo).

## Arquivos a editar

- `src/lib/orcamento.ts` — adicionar campo `avulso?: boolean` na interface.
- `src/components/ItemAvulsoModal.tsx` — novo modal com formulário.
- `src/pages/Orcamento.tsx` — botão "+ Item avulso", integração com modal, badge visual na linha do item avulso.

## Validações

- Código e descrição: trim, uppercase, não vazios, max 100 chars.
- Valor unitário: número > 0.
- Se "Salvar no catálogo": checar duplicidade de código em `equipamentos` antes de inserir; se já existir, avisa e usa o existente.

## Fora de escopo

- Reformas (será feito depois, se solicitado).
- Edição de itens avulsos já adicionados (mantém comportamento atual: remove e re-adiciona).
- Categoria customizável no modal (fica fixa "Peças/Partes" para os salvos).
