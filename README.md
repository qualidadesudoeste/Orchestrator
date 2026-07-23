# Orchestrator — Plataforma de Qualidade

Hub web para planejamento, execução e acompanhamento das atividades de QA. A plataforma reúne clientes, projetos, sprints, checklist do POP, trilha de conhecimento, geração de cenários por IA e análise de cobertura.

O agente de execução utiliza n8n e Playwright MCP. Os artefatos dessa integração ficam em [`automation/`](automation/README.md).

## Arquitetura atual

- Frontend: React 19, TypeScript, Vite, TailwindCSS e shadcn/ui.
- Backend: Node.js, Express e tRPC.
- Banco: MySQL com Drizzle ORM.
- IA: endpoint compatível com OpenAI Chat Completions por meio de `invokeLLM`.
- Automação: n8n 2.31.4 com MCP Client nativo e Playwright MCP.

## Pré-requisitos

- Node.js 20.19 ou superior.
- npm.
- MySQL acessível local ou remotamente.
- Docker Desktop para executar o n8n.
- Google Chrome para o Playwright MCP local.

## Instalação local no Windows

```powershell
Copy-Item .env.example .env
npm install
npm run check
npm test
npm run build
npm run dev
```

A aplicação inicia por padrão em `http://localhost:3000`. Antes de iniciar, preencha no `.env` pelo menos `DATABASE_URL`, `JWT_SECRET` e `BUILT_IN_FORGE_API_KEY`.

O projeto usa npm como gerenciador oficial. O arquivo `.npmrc` mantém compatibilidade temporária com um plugin legado do ambiente Manus que ainda declara suporte somente a versões antigas do Vite.

## Banco de dados

Com `DATABASE_URL` configurada:

```powershell
npm run db:push
```

As alterações de schema devem ser revisadas antes de aplicar migrations em ambientes compartilhados. Nunca use dados reais de produção para testes automatizados.

## Verificações

```powershell
npm run check   # TypeScript
npm test        # Vitest
npm run build   # Frontend e servidor de produção
```

O teste de integração com IA é ignorado quando `BUILT_IN_FORGE_API_KEY` não está configurada. Os testes locais de autenticação utilizam mocks e não dependem de um banco existente.

## n8n e Playwright MCP

Consulte [`automation/README.md`](automation/README.md) para iniciar o MCP, importar o workflow e executar o teste de fumaça. O endpoint usado pelo n8n é:

```text
http://host.docker.internal:8931/mcp
```

## Testes não funcionais

O Orchestrator consolida performance com k6, segurança passiva com OWASP ZAP e
acessibilidade com axe-core. O executor autenticado, os limites padrão e o
workflow n8n estão documentados em
[`automation/non-functional/README.md`](automation/non-functional/README.md).

## Segurança

- Nunca versionar `.env`, tokens, senhas ou evidências com dados pessoais.
- Produção deve ser somente leitura para o agente.
- Scans ativos e testes de carga exigem ambiente e autorização específicos.
- Screenshots, relatórios e logs são gravados em `artifacts/`, que não é versionado.

## Estado do roadmap

- Geração de cenários e análise de cobertura: concluídas.
- Configuração e smoke test do Playwright MCP: concluídos.
- Conexão n8n → Playwright MCP com workflow de diagnóstico: concluída.
- Loop sequencial por cenário Gherkin, consolidação e separação de falhas: concluídos.
- Captura rastreável de screenshots pelo agente: configurada; teste funcional aguarda crédito na API OpenAI.
- Execução completa pelo agente GPT-4o: tecnicamente configurada; aguarda crédito disponível na conta da API OpenAI.
- Gerador Node.js de evidências DOCX com screenshots: concluído.
- Persistência de execuções e dashboard operacional: concluídos.
- k6, OWASP ZAP, axe-core e dashboard não funcional: concluídos.
- Cards Markdown de defeitos reais, com cópia e download pelo Dashboard: concluídos.
- Reteste, classificação de flaky tests e relatório HTML de confiabilidade: concluídos.
