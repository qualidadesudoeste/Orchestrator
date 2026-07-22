# Automação local — n8n e Playwright MCP

## Pré-requisitos

- Docker Desktop em execução.
- n8n disponível em `http://localhost:5678`.
- Node.js e `npx.cmd` disponíveis no Windows.
- Google Chrome instalado no Windows (a configuração usa o canal local `chrome`).
- Plugin `n8n-nodes-mcp` instalado no n8n.
- Variável `N8N_COMMUNITY_PACKAGES_ALLOW_TOOL_USAGE=true` no container do n8n.

## 1. Iniciar o Playwright MCP

Na raiz do projeto, execute:

```powershell
powershell -ExecutionPolicy Bypass -File .\automation\playwright\start-playwright-mcp.ps1
```

O endpoint esperado é `http://localhost:8931/mcp`. O n8n acessa esse mesmo serviço por `http://host.docker.internal:8931/mcp`.

O script passa o diretório de artefatos como caminho absoluto para garantir que screenshots e snapshots sejam gravados em `artifacts/playwright-mcp`, independentemente de como o `npx` resolver seu diretório de trabalho.

As entradas de host na configuração incluem também a porta `:8931`. A versão atual do servidor valida o cabeçalho `Host` completo; sem essas entradas, o cliente pode apresentar 403 como um erro genérico de autenticação.

## 2. Importar o workflow

Importe `automation/n8n/Agente_QA_Playwright_MCP.json` no n8n e, no nó **GPT-4o**, selecione a credencial OpenAI já cadastrada. Não coloque a chave diretamente no JSON.

## 3. Teste de fumaça

1. Execute o workflow manualmente.
2. Confirme que o agente abre `https://example.com`.
3. Confirme que o título contém `Example`.
4. Confirme que há screenshot em `artifacts/playwright-mcp`.
5. Confirme que o resultado diferencia falha funcional de erro de automação.

## Diagnóstico rápido

```powershell
Get-NetTCPConnection -LocalPort 8931 -State Listen
Invoke-WebRequest -Uri http://localhost:8931/mcp -Headers @{ Accept = "text/event-stream" }
docker ps
```

O transporte correto é **HTTP Streamable** no endpoint `/mcp`. O endpoint `/sse` é legado.
