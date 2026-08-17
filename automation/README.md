# Automação local — executor Playwright direto

O Orchestrator executa os cenários em um processo Windows separado da API. A
API persiste a solicitação; a fila reserva um worker compatível com a rede/VPN,
e `server/directQaExecutionService.ts` inicia o agente Playwright.

## Fluxo

```text
Botão Iniciar testes
  → fila de execuções
  → worker e preflight de VPN
  → Playwright direto
  → Dado/Quando/Então em ordem
  → screenshots, trace, resultado e relatório web
  → histórico e dashboard
```

O executor impede conclusão com passos pendentes, exige screenshot e calcula o
status pelo registro das etapas. Credenciais são descriptografadas somente no
processo local e não entram no prompt, trace ou relatório.

## Executar localmente

Na raiz do projeto:

```powershell
npm ci
npm run db:push
npm run dev
```

Em outro terminal Windows, execute `npm run dev:worker`. Em produção, siga o
guia dedicado em [`worker/README.md`](worker/README.md).

Acesse `http://localhost:3000`, configure projeto, ambientes e VPN quando
necessário, gere ou abra um plano e use **Iniciar testes**. A tela **Fila de
Execuções** mostra o andamento e permite pausar, retomar ou encerrar.

## Artefatos

- `artifacts/agent-executions/<execution_id>`: screenshots e traces.
- `artifacts/reliability-reports`: relatórios HTML com evidências incorporadas.
- `artifacts/evidence-docx`: documentos Word gerados.
- `artifacts/non-functional`: resultados de k6, ZAP e axe-core.

## Validação

```powershell
npm run check
npm test
npm run build
```

O n8n foi removido da arquitetura ativa. Playwright MCP também não é necessário;
somente o worker importa `playwright-core`. A API e sua imagem Docker não iniciam
o agendador nem dependem de um navegador instalado.
