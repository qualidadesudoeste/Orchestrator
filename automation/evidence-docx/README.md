# Gerador de evidências DOCX

Gera um relatório Word a partir do JSON consolidado produzido pelo workflow `Agente QA — Playwright MCP`.

## Executar

Na raiz do projeto:

```powershell
npm run evidence:docx -- --input .\automation\evidence-docx\examples\execution.sample.json --output .\artifacts\evidence-docx\evidencias-exemplo.docx
```

O JSON deve conter `resultados`, com um item por cenário. Screenshots locais informadas em `resultado_teste.evidencias[].caminho` são incorporadas ao documento. URLs remotas e arquivos ausentes são registrados como observações, sem conteúdo inventado.

## Saída

O documento contém:

- identificação da execução, projeto, cliente, sprint e sistema;
- status geral e totais por classificação;
- Gherkin, resultado observado e passos de cada cenário;
- falhas funcionais separadas de falhas de automação;
- screenshots com legenda e texto alternativo.

Os status aceitos são `PASSOU`, `FALHOU`, `BLOQUEADO` e `ERRO_AUTOMACAO`.

## Integração automática com n8n

O workflow `automation/n8n/Agente_QA_Playwright_MCP.json` envia o resultado
consolidado para:

```text
POST http://host.docker.internal:3000/api/qa/evidence-docx
Authorization: Bearer <QA_AGENT_API_TOKEN>
```

Configure o mesmo `QA_AGENT_API_TOKEN` no `.env` da raiz do Orchestrator e no
arquivo `automation/n8n/.env`. Configure também `ORCHESTRATOR_PUBLIC_URL` como
`http://localhost:3000` e `ORCHESTRATOR_API_URL` como
`http://host.docker.internal:3000`. A resposta contém
`evidence_docx.download_url`, um link protegido e válido por sete dias.
