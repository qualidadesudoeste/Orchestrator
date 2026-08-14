# Resultado inicial do piloto

Data: 12/08/2026

Referência: execução 14 do projeto CLE. O piloto não alterou o histórico nem os
resultados salvos no Orchestrator.

## Resultados

| Cenário | Executor anterior | Piloto direto | Observação |
|---|---|---|---|
| Exibir estado vazio da fila | PASSOU | PASSOU | Aplicou um filtro sem correspondência, confirmou `Nenhum processo`, ausência de itens e capturou duas evidências. |
| Filtrar por serviço e responsável | ERRO_AUTOMACAO por limite | BLOQUEADO após verificação | Autenticou, abriu a Caixa, selecionou Serviço e Responsável e reduziu a fila a 9 itens. O verificador recusou aprovar porque a tabela não mostra o responsável por linha. |
| Navegar entre páginas da fila | BLOQUEADO | ERRO_AUTOMACAO após verificação | Selecionou 100 itens, mas não coletou uma observação final suficiente para provar 101 itens e a disponibilidade de Próxima. |

## Defeitos concretos encontrados e corrigidos durante o piloto

1. A autenticação procurava os campos antes da hidratação da aplicação React.
2. O snapshot de páginas grandes truncava as referências dos filtros.
3. A conclusão do agente podia usar `BLOQUEADO` para uma limitação da própria automação.
4. O wrapper Chat Completions não preservava `tool_calls` nas mensagens seguintes.
5. `gpt-5.6-terra` com ferramentas no Chat Completions exige `reasoning_effort: none`; planejamento e verificação continuam em chamadas separadas.

## Decisão provisória

O Playwright direto com trace e verificador demonstrou ganho mensurável: o
cenário que antes estourava o limite passou a executar os dois filtros. O piloto
ainda não deve substituir o fluxo atual. Antes disso, precisa:

- consultar elementos por intenção sem depender de snapshots grandes;
- coletar assertions específicas por coluna/detalhe;
- usar Responses API no ciclo de ferramentas;
- repetir a suíte por três rodadas e comparar sucesso, tokens e latência;
- transformar traces aprovados em fluxos reutilizáveis.

## Validação do contrato exato

O cenário `CT-004 - Exibir estado vazio da fila` foi repetido depois da inclusão
do contrato de execução. O executor extraiu e registrou, sem agrupamento:

1. `Dado` - autenticar e preparar a própria fila com filtro sem correspondência;
2. `Quando` - aplicar o filtro informado;
3. `Então` - confirmar `Nenhum processo` e ausência de itens.

As três etapas foram executadas na ordem, com intervalos de trace separados. A
conclusão antecipada foi bloqueada pelo executor e o status `PASSOU` foi calculado
a partir do registro das etapas, não escolhido pelo modelo. O teste automatizado
também cobre tentativa de reordenação, conclusão antecipada e divergência entre
o status sugerido pelo modelo e o status derivado das etapas.
