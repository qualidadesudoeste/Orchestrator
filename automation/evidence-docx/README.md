# Gerador de evidências DOCX

Gera um relatório Word a partir do JSON consolidado produzido pelo executor
Playwright direto.

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

## Integração automática

O backend pode enviar o resultado consolidado para:

```text
POST http://localhost:3000/api/qa/evidence-docx
Authorization: Bearer <QA_AGENT_API_TOKEN>
```

Configure `QA_AGENT_API_TOKEN` e `ORCHESTRATOR_PUBLIC_URL` no `.env` da raiz do
Orchestrator. A resposta contém
`evidence_docx.download_url`, um link protegido e válido por sete dias.
