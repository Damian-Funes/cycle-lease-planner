

## Implementar Piso Minimo de 40.000 Sacos/Ano

### O que muda

Atualmente, o volume minimo anual e calculado pela formula `Divida / (Tarifa F1 x Soma Fatores)`. Para maquinas pequenas (divida baixa), isso gera volumes muito baixos que nao compensam comercialmente.

A mudanca adiciona um **piso fixo de 40.000 sacos/ano**. O volume calculado pela formula continua existindo, mas se for menor que 40.000, o sistema usa 40.000.

### Como funciona

- Se a formula calcula 120.000 sacos -> usa 120.000 (acima do piso)
- Se a formula calcula 25.000 sacos -> usa 40.000 (piso aplicado)

Quando o piso e aplicado, a Cobertura Fase 1 ficara acima de 100%, significando que o cliente paga mais que a divida nos primeiros 5 anos -- o que e desejavel comercialmente para maquinas pequenas.

### Alteracoes tecnicas

**Arquivo: `src/lib/smartcycle.ts`**
- Adicionar constante `VOLUME_MINIMO_PISO = 40000`
- Na funcao `calcVolumeMinimoAnual`, aplicar `Math.max(resultado, VOLUME_MINIMO_PISO)` ao final do calculo

**Arquivo: `src/components/ParametersTab.tsx`**
- No card "Volume Minimo Calculado", quando o piso estiver ativo (volume calculado < 40.000), exibir um aviso sutil: "Piso minimo de 40.000 sacos/ano aplicado"
- Isso ajuda o comercial a entender por que o volume nao muda mesmo alterando parametros em projetos pequenos

Sao apenas 2 arquivos com mudancas minimas. Toda a logica de projecao 10 anos, proposta e Supabase continua funcionando normalmente, pois todas dependem da funcao `calcVolumeMinimoAnual`.

