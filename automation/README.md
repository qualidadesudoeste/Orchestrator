# Automação local — n8n e Playwright MCP

## Pré-requisitos

- Docker Desktop em execução.
- Node.js e `npx.cmd` disponíveis no Windows.
- Google Chrome instalado no Windows (a configuração usa o canal local `chrome`).

O workflow usa o **MCP Client nativo do n8n**. O plugin comunitário `n8n-nodes-mcp` pode permanecer instalado por compatibilidade, mas não é necessário para este fluxo.

## 1. Iniciar o n8n

Na primeira execução, crie o volume persistente:

```powershell
docker volume create n8n_data
```

Depois, inicie a versão fixada no projeto:

```powershell
docker compose -f .\automation\n8n\docker-compose.yml up -d
```

O n8n fica disponível em `http://localhost:5678`. Credenciais, workflows e histórico são preservados no volume `n8n_data`.

## 2. Iniciar o Playwright MCP

Na raiz do projeto, execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\automation\playwright\start-playwright-mcp.ps1
```

O endpoint esperado é `http://localhost:8931/mcp`. O n8n acessa esse mesmo serviço por `http://host.docker.internal:8931/mcp`.

O script passa o diretório de artefatos como caminho absoluto para garantir que screenshots e snapshots sejam gravados em `artifacts/playwright-mcp`, independentemente de como o `npx` resolver seu diretório de trabalho.

As entradas de host na configuração incluem também a porta `:8931`. A versão atual do servidor valida o cabeçalho `Host` completo; sem essas entradas, o cliente pode apresentar 403 como um erro genérico de autenticação.

## 3. Importar os workflows

Importe estes arquivos no n8n:

- `automation/n8n/Agente_QA_Playwright_MCP.json`: agente principal.
- `automation/n8n/Diagnostico_MCP.json`: verificação do lote Gherkin e do MCP sem IA e sem consumo de créditos.

No agente principal, confirme que o nó **GPT-4o** usa a credencial OpenAI cadastrada. Não coloque a chave diretamente no JSON. A conta da API precisa ter crédito disponível; uma assinatura do ChatGPT não inclui automaticamente créditos da API.

## 4. Teste de conexão sem IA

1. Abra o workflow **Diagnóstico — Lote Gherkin e Playwright MCP**.
2. Execute-o manualmente.
3. Confirme que o nó **Loop do Diagnóstico** processou `DIAG-001` e `DIAG-002` separadamente.
4. Confirme que as duas execuções retornaram a URL `https://example.com/` e o título `Example Domain`.
5. Confirme que **Consolidar Diagnóstico** retornou `PASSOU`, com 2 cenários aprovados.
6. Confirme a criação dos dois snapshots em `artifacts/playwright-mcp`.

Esse teste valida o caminho n8n → Docker → host Windows → Playwright MCP e o processamento sequencial, sem depender da OpenAI.

## 5. Preparar uma execução Gherkin

No workflow principal, abra o nó **Definir Execução** e preencha:

- `projeto`: nome do cliente ou projeto.
- `sprint`: identificação da sprint.
- `sistema_url`: endereço autorizado para o teste.
- `cenarios_gherkin`: um ou mais blocos iniciados por `Cenário:` ou `Scenario:`.
- `diretorio_evidencias`: pasta absoluta onde os prints serão gravados.

O nó **Preparar Cenários** gera automaticamente um identificador como `CT-001-validar-login`. O **Loop Sobre Cenários** usa lote 1, portanto cada cenário termina antes do seguinte começar.

Para cada cenário, o agente deve gerar uma screenshot final e, se houver falha, uma screenshot adicional do estado da falha. Os nomes usam o padrão:

```text
n8n-ID-CT-NNN-titulo-final.png
n8n-ID-CT-NNN-titulo-falha.png
```

O resultado consolidado contém `total_cenarios`, totais por status e a lista `resultados`. Os status permitidos são:

- `PASSOU`: comportamento esperado confirmado.
- `FALHOU`: defeito funcional real.
- `BLOQUEADO`: pré-condição ou acesso impediu a execução.
- `ERRO_AUTOMACAO`: problema de IA, infraestrutura, seletor ou formato da resposta.

Erros de um cenário não interrompem o restante do lote.

## 6. Teste do agente completo

1. Execute o workflow manualmente.
2. Confirme que o agente abre `https://example.com`.
3. Confirme que o título contém `Example`.
4. Confirme que há screenshot em `artifacts/playwright-mcp`.
5. Confirme que o resultado diferencia falha funcional de erro de automação.

## 7. Gerar o documento de evidências

O resultado do nó **Consolidar Execução** já possui o formato aceito pelo gerador DOCX. Salve esse resultado como JSON e execute:

```powershell
npm run evidence:docx -- --input .\caminho\execucao.json --output .\artifacts\evidence-docx\evidencias.docx
```

O gerador incorpora screenshots locais, cria o resumo da execução e mantém falhas funcionais separadas de falhas de automação. Consulte [`evidence-docx/README.md`](evidence-docx/README.md) para o contrato completo e um exemplo executável.

## Diagnóstico rápido

```powershell
Get-NetTCPConnection -LocalPort 8931 -State Listen
Invoke-WebRequest -Uri http://localhost:8931/mcp -Headers @{ Accept = "text/event-stream" }
docker ps
```

O transporte correto é **HTTP Streamable** no endpoint `/mcp`. O endpoint `/sse` é legado.

### Erros conhecidos

- `Authentication failed`: confirme `/mcp`, transporte **HTTP Streamable**, Playwright MCP ativo e `host.docker.internal`.
- `Insufficient quota`: a conexão MCP não é a causa; adicione crédito/billing à conta OpenAI vinculada ao n8n.
- `model.value`: reimporte a versão atual do workflow, que usa o novo formato de seleção de modelo do n8n.

## Resultado validado da Fase 1

Em 22/07/2026, o workflow de diagnóstico foi executado com sucesso no n8n 2.31.4. O Playwright abriu `https://example.com/`, retornou o título `Example Domain` e gerou o snapshot esperado. O agente completo alcançou a API OpenAI, que respondeu apenas com bloqueio de quota.

## Resultado validado da Fase 2

Em 22/07/2026, o workflow principal separou dois cenários Gherkin, processou ambos sequencialmente e consolidou os dois resultados. Como a API OpenAI estava sem quota, cada item foi corretamente classificado como `ERRO_AUTOMACAO` e o lote continuou até o fim. No diagnóstico sem IA, os dois cenários chamaram o Playwright MCP e foram aprovados com dois snapshots independentes.

## Código de regressão Playwright

Depois de gerar o DOCX, o workflow envia os códigos TypeScript produzidos pelo
agente para `POST /api/qa/regression-code`. O Orchestrator:

- aceita arquivos `.spec.ts` e `.test.ts`;
- exige importação de `@playwright/test`;
- bloqueia `page.locator`, XPath e outros seletores frágeis;
- limita quantidade e tamanho dos arquivos;
- salva o código sem executá-lo;
- devolve links assinados válidos por sete dias.

Se nenhum código confiável for gerado — por exemplo, em bloqueio de quota — o
nó registra o erro e preserva o relatório DOCX já criado.

## Cards Markdown para o SIG

Depois de gerar o DOCX, o nó **Gerar Cards Markdown** envia o resultado
consolidado para `POST /api/qa/defect-cards`. O Orchestrator:

- cria um card somente quando o cenário está como `FALHOU` e possui uma falha
  funcional real;
- não transforma `ERRO_AUTOMACAO`, bloqueios ou testes aprovados em defeitos;
- remove senhas, tokens e cabeçalhos de autorização do conteúdo;
- mantém o identificador do card estável quando a mesma execução é reenviada;
- disponibiliza o Markdown para copiar ou baixar no Dashboard;
- fornece um link assinado de download, válido por sete dias, para cada `.md`.

O painel **Cards de defeito para o SIG** mostra severidade, status, projeto,
sprint e cenário. Use **Copiar** para levar o conteúdo direto ao SIG ou **.md**
para baixar o arquivo.

### Ciclo de vida dos cards

Cada card possui um histórico permanente com data, responsável, origem e motivo
da alteração. Os estados operacionais são:

- `ABERTO`: defeito novo criado automaticamente pelo agente;
- `COPIADO`: Markdown copiado pelo Dashboard para envio ao SIG;
- `RESOLVIDO`: correção confirmada pela equipe;
- `REABERTO`: problema voltou a ocorrer ou o reteste falhou;
- `DESCARTADO`: card inválido, duplicado ou fora do escopo.

O Dashboard oferece as ações **Resolver**, **Reabrir**, **Descartar** e
**Histórico**. A aplicação valida as transições permitidas e impede alterações
incoerentes, como mudar diretamente um card resolvido para aberto. Quando uma
execução é reenviada pelo n8n, o estado operacional já registrado é preservado.

## Reteste, flaky tests e relatório de confiabilidade

O agente registra a primeira tentativa de cada cenário. Quando a tentativa
resulta em `FALHOU` ou `ERRO_AUTOMACAO`, ele restaura o estado inicial e executa
uma única vez novamente. Cada resultado contém `resultado_teste.tentativas`,
limitado a duas tentativas.

O nó **Gerar Relatório de Confiabilidade** envia a execução para
`POST /api/qa/reliability-reports` e classifica os cenários:

- `ESTAVEL`: todas as tentativas passaram;
- `FLAKY`: houve resultado aprovado e pelo menos uma tentativa diferente;
- `FALHA_REAL`: todas as tentativas falharam funcionalmente;
- `INCONCLUSIVO`: bloqueio ou erro de automação não permitiu confirmar o
  comportamento.

O relatório HTML **Extent QA — Relatório de Confiabilidade** mantém as falhas
reais na lista principal e apresenta os testes flaky em uma seção separada.
Somente `FALHA_REAL` entra no Fail Rate, na contagem de defeitos e na geração de
cards Markdown. O Dashboard mostra Flaky Rate, quantidade por módulo e um link
`HTML` nas execuções recentes.

O relatório é nativo da stack Node.js/TypeScript. O projeto oficial
[ExtentReports](https://github.com/extent-framework) mantém implementações para
Java e .NET, sem adaptador oficial atual para Playwright/TypeScript.

## Memória especialista persistente

Antes de cada cenário, o nó **Carregar Memória Especialista** consulta
`POST /api/qa/agent-memory/context`. O escopo usa projeto e host do sistema,
permitindo reaproveitar conhecimento entre sprints sem misturar aplicações.
Depois do cenário, **Salvar Aprendizado** envia o resultado para
`POST /api/qa/agent-memory/learn`.

O agente pode registrar:

- regras de negócio;
- seletores semânticos confiáveis;
- riscos conhecidos;
- observações reutilizáveis;
- defeitos confirmados de forma consistente.

Aprendizados repetidos são reforçados em vez de duplicados. O Orchestrator
registra quantidade de ocorrências, confiança, sprint de origem e última
utilização. Falhas flaky, mensagens transitórias de infraestrutura e erros de
quota não viram conhecimento permanente.

Senhas, tokens, cabeçalhos de autorização, HTML e caracteres de controle são
removidos antes da persistência. A memória é enviada ao modelo como dado de
referência não confiável: comandos eventualmente contidos nela não devem ser
executados. O comportamento observado na interface atual sempre prevalece.

O Dashboard apresenta a seção **Memória especialista do agente**, com projeto,
sistema, categoria, confiança, ocorrências e sprint de origem.

O Docker Compose define `N8N_BLOCK_ENV_ACCESS_IN_NODE=false` para permitir que
os nós HTTP leiam somente as variáveis usadas pelo fluxo
(`ORCHESTRATOR_API_URL` e `QA_AGENT_API_TOKEN`). Como workflows podem acessar
variáveis do contêiner, restrinja a edição do n8n a administradores confiáveis.

## Persistência e Dashboard

O nó **Registrar Execução** envia o lote consolidado para
`POST /api/qa/test-executions`. O endpoint usa `execution_id` como chave
idempotente, grava a execução em `test_executions` e substitui seus cenários em
`test_results` quando recebe um reenvio. Falhas funcionais e falhas de automação
permanecem separadas para não distorcer os indicadores do Dashboard.

## Testes não funcionais

O workflow `Testes_Nao_Funcionais.json` aciona um executor local autenticado e
consolida k6, OWASP ZAP Baseline e axe-core. Inicie o executor com:

```powershell
npm run nonfunctional:runner
```

O resultado é enviado para `POST /api/qa/non-functional-runs`, usando `run_id`
como chave idempotente. As métricas e os achados prioritários aparecem no
Dashboard. Consulte
[`non-functional/README.md`](non-functional/README.md) para limites, segurança e
configuração.

## Resultado validado do gerador DOCX

O gerador produziu um relatório com dois cenários e duas screenshots incorporadas. A auditoria estrutural confirmou página Letter, margens de 1 polegada, tabelas com geometria fixa e zero achados de acessibilidade. A renderização automática por LibreOffice depende da instalação local desse aplicativo.
