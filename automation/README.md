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

## Resultado validado do gerador DOCX

O gerador produziu um relatório com dois cenários e duas screenshots incorporadas. A auditoria estrutural confirmou página Letter, margens de 1 polegada, tabelas com geometria fixa e zero achados de acessibilidade. A renderização automática por LibreOffice depende da instalação local desse aplicativo.
