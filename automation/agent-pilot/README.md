# Piloto do Agente QA direto

Este piloto foi usado para comparar o executor legado com um loop controlado
usando Playwright direto. Ele não altera resultados anteriores e não grava o
resultado no banco.

O piloto seleciona três cenários de uma execução existente: um aprovado, um com
erro de automação e um bloqueado. Credenciais são descriptografadas somente no
processo local e nunca são enviadas ao modelo ou gravadas no trace.

```powershell
npm run agent:pilot -- --execution-id 14
```

Para executar apenas um cenário:

```powershell
npm run agent:pilot -- --execution-id 14 --scenario "Filtrar por serviço"
```

Use `--headed` para acompanhar o navegador. Os planos, traces e screenshots
ficam em `artifacts/agent-pilot/`.

O piloto bloqueia cliques destrutivos, limita a navegação aos ambientes
parametrizados e usa um verificador independente antes de aceitar a conclusão.
Quando o ambiente exige VPN, o mesmo preflight seguro do Orchestrator verifica
o túnel antes de consumir a API de IA.

## Contrato de execução do cenário

Cada cenário Gherkin é convertido em uma lista ordenada de etapas. `E` e `Mas`
herdam o tipo da etapa anterior. O agente deve concluir cada etapa, na ordem,
registrando o resultado observado. Ele não pode:

- encerrar enquanto houver etapa pendente;
- pular ou reordenar uma etapa;
- marcar uma etapa como executada sem atividade nova no navegador;
- substituir a ação ou o resultado esperado por uma verificação semelhante;
- escolher livremente o status final.

O executor deriva o status final do registro das etapas e exige screenshot antes
da conclusão. Assim, a IA decide como interagir com a interface, mas não decide
qual parte do cenário cumprir.

## Reaproveitamento de fluxo aprovado

Na fila integrada, um cenário aprovado pelo verificador gera uma receita JSON
de ações semânticas. A repetição do mesmo Gherkin tenta essa receita antes do
agente completo e faz apenas uma verificação curta do resultado atual. A receita
não contém credenciais nem JavaScript executável. Falha de seletor, mudança de
tela ou rejeição do verificador aciona automaticamente o agente exploratório.
