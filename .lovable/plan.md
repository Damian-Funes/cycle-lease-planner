# Júlia: criar_compromisso liga a pessoa confirmada

## Como está hoje (confirmado)
- `julia_criar_compromisso` grava organização, oportunidade aberta (do responsável) e responsável; não lê nenhum contato, então `pessoa_id` sempre fica NULL.
- Atividade `bf01fac0…` ("WhatsApp para o Rennan…"): organização Grupo Morena, oportunidade preenchida, `pessoa_id` NULL.
- Pessoas do Grupo Morena: **Rennan** (Gerente Comercial, `a4454e87…`), **Renan** (Gerente Comercial, `5feadf3a…`) e Winicius Menegaz. Rennan × Renan parece cadastro duplicado — o CEO deve conferir; o casamento exato por "Rennan" é único.

## O que muda
1. Novo campo opcional `contato_nome` (e `contato_novo_confirmado`) em `criar_compromisso`.
2. No SQL, se houver organização e contato_nome, chama a mesma `fn_resolver_contato_org(org, nome, NULL, false, responsável, criar, 'contato')` (exato > primeiro nome > aproximado). Só cria pessoa nova com `contato_novo_confirmado=true`.
3. **Ambíguo ou não encontrado sem confirmação: a atividade é criada mesmo assim**, sem pessoa (recomendado: o compromisso é o essencial; perder a data por causa do nome é pior). A resposta traz `confirmar_contato` + pergunta, igual a `registrar_contato_cliente`, e o vendedor completa depois pelo `completar_contato`.
4. Contato sem organização: ignora o nome e devolve aviso "diga a empresa para ligar o contato".
5. Oportunidade aberta: sem mudança.
6. A edge function reaproveita `respostaContatos` (mesma frase/aviso dos outros fluxos).

## SQL proposto (docs/sql/julia-compromisso-pessoa-proposta.sql — não aplicar sem aprovação)
- `CREATE OR REPLACE julia_criar_compromisso`: igual ao atual + `v_pessoa uuid; v_rc jsonb;`
  ```sql
  IF v_org IS NOT NULL AND nullif(btrim(p_dados->>'contato_nome'),'') IS NOT NULL THEN
    v_rc := fn_resolver_contato_org(v_org, p_dados->>'contato_nome', NULL, false, v_resp,
              coalesce((p_dados->>'contato_novo_confirmado')::boolean,false), 'contato');
    v_pessoa := fn_uuid_seguro(v_rc->>'pessoa_id');
  END IF;
  -- INSERT inclui pessoa_id = v_pessoa
  -- RETURN inclui 'pessoa_id', v_pessoa, 'contatos_resolvidos', CASE WHEN v_rc IS NULL THEN NULL ELSE jsonb_build_array(v_rc) END
  ```
- Correção pontual da atividade existente (só se o casamento for único e exato):
  ```sql
  UPDATE atividades a SET pessoa_id = c.pessoa_id
  FROM fn_casar_pessoa_org_detalhe('637139d1-dc65-4b3c-bd4f-d9f13c92d1d6','Rennan') c
  WHERE a.id = 'bf01fac0-588f-4e99-b7e8-ee1e6f03342a' AND a.pessoa_id IS NULL
    AND NOT c.ambigua AND c.tipo = 'exato' AND c.pessoa_id = 'a4454e87-2800-4b6a-9c37-9887b23ae4b0';
  ```
  Teste antes em BEGIN…ROLLBACK: nome exato liga; "Ren" ambíguo cria atividade sem pessoa e devolve confirmar_contato; nome novo sem confirmação não cria pessoa; com confirmação cria.

## Código
- `schema.ts`: `contato_nome` (2–200) e `contato_novo_confirmado` opcionais em criar_compromisso.
- `index.ts`: carrega `pessoasDasOrgs` em paralelo, usa `respostaContatos` quando vier `contatos_resolvidos`, devolve `confirmar_contato`.
- Teste Deno do schema (campo aceito/opcional).

## JSON ElevenLabs (criar_compromisso)
```json
{
  "type": "webhook",
  "name": "criar_compromisso",
  "description": "Cria um compromisso (Ligação, Visita, Reunião, Tarefa ou WhatsApp) com data e hora. Se o cliente falou com uma pessoa específica da empresa, envie contato_nome.",
  "api_schema": {
    "url": "https://sycqtlxoidsbsvrsvqes.supabase.co/functions/v1/julia-viagem-ferramentas",
    "method": "POST",
    "request_headers": {
      "x-julia-secret": { "secret_id": "jbsvUFnmcxkQB7jA69OB" },
      "x-region": "sa-east-1"
    },
    "request_body_schema": {
      "type": "object",
      "properties": {
        "acao": { "type": "string", "description": "", "dynamic_variable": "", "constant_value": "criar_compromisso", "value_type": "constant", "required": true },
        "ligacao_id": { "type": "string", "description": "", "dynamic_variable": "ligacao_id", "constant_value": "", "value_type": "dynamic_variable", "required": true },
        "rota_id": { "type": "string", "description": "", "dynamic_variable": "rota_id", "constant_value": "", "value_type": "dynamic_variable", "required": false },
        "vendedor_nome": { "type": "string", "description": "Só para admin: primeiro nome do vendedor que fará o compromisso. Vazio = quem está ligando.", "dynamic_variable": "", "constant_value": "", "value_type": "llm_prompt", "required": false },
        "organizacao_id": { "type": "string", "description": "ID da empresa (vindo de buscar_organizacao ou do contexto).", "dynamic_variable": "", "constant_value": "", "value_type": "llm_prompt", "required": false },
        "contato_nome": { "type": "string", "description": "Nome da pessoa da empresa com quem será o compromisso, como o vendedor falou. Só se ele citar alguém.", "dynamic_variable": "", "constant_value": "", "value_type": "llm_prompt", "required": false },
        "contato_novo_confirmado": { "type": "boolean", "description": "true só se o vendedor confirmou que é uma pessoa nova, ainda não cadastrada.", "dynamic_variable": "", "constant_value": "", "value_type": "llm_prompt", "required": false },
        "titulo": { "type": "string", "description": "Título curto, ex.: WhatsApp para o Rennan.", "dynamic_variable": "", "constant_value": "", "value_type": "llm_prompt", "required": true },
        "tipo": { "type": "string", "description": "Ligação, Visita, Reunião, Tarefa ou WhatsApp.", "dynamic_variable": "", "constant_value": "", "value_type": "llm_prompt", "required": true },
        "data": { "type": "string", "description": "AAAA-MM-DD, hoje ou futuro.", "dynamic_variable": "", "constant_value": "", "value_type": "llm_prompt", "required": true },
        "hora": { "type": "string", "description": "HH:MM (24h). Vazio = 09:00.", "dynamic_variable": "", "constant_value": "", "value_type": "llm_prompt", "required": false },
        "descricao": { "type": "string", "description": "Detalhes opcionais.", "dynamic_variable": "", "constant_value": "", "value_type": "llm_prompt", "required": false }
      },
      "required": ["acao", "ligacao_id", "titulo", "tipo", "data"]
    }
  }
}
```

## Linha para o prompt
"Ao criar compromisso com uma pessoa da empresa, envie contato_nome; se a resposta trouxer confirmar_contato, faça a pergunta e depois use completar_contato — o compromisso já ficou salvo."

## Riscos
- Duplicata Rennan/Renan: "Renan" falado casa exato com o outro cadastro; "Ren" fica ambíguo (correto, sem gravar).
- Pessoa nova só com confirmação explícita; erro de LLM mandando `true` cria cadastro — mesmo risco dos outros fluxos.
- Atividades antigas além da bf01fac0 continuam sem pessoa (não há correção em massa).
