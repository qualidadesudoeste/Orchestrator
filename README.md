# Orchestrator — Plataforma de Qualidade

Hub web para planejamento, execução e acompanhamento das atividades de QA. A plataforma reúne clientes, projetos, sprints, checklist do POP, trilha de conhecimento, geração de cenários por IA e análise de cobertura.

O agente de execução usa Playwright diretamente no worker da plataforma. Os
detalhes ficam em [`automation/`](automation/README.md).

## Arquitetura atual

- Frontend: React 19, TypeScript, Vite, TailwindCSS e shadcn/ui.
- Backend: Node.js, Express e tRPC.
- Banco: MySQL com Drizzle ORM.
- IA: OpenAI API (`gpt-5.6-terra`) para geração e análise de cenários.
- Automação: fila de workers, agente direto e `playwright-core`.

## Pré-requisitos

- Node.js 20.19 ou superior.
- npm.
- MySQL acessível local ou remotamente.
- Google Chrome ou Chromium compatível com Playwright.
- Chave da OpenAI API com faturamento/créditos habilitados.

## Instalação local no Windows

```powershell
Copy-Item .env.example .env
npm install
npm run check
npm test
npm run build
npm run dev
```

A aplicação inicia por padrão em `http://localhost:3000`. Antes de iniciar,
preencha no `.env` pelo menos `DATABASE_URL`, `JWT_SECRET`, `OPENAI_API_KEY`,
`LLM_API_URL=https://api.openai.com` e `LLM_MODEL=gpt-5.6-terra`. A assinatura
do ChatGPT não inclui créditos da API.

O projeto usa npm como gerenciador oficial.

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

O teste de integração com IA roda quando `OPENAI_API_KEY` está configurada. Os
testes locais de autenticação utilizam mocks e não dependem de um banco
existente.

## Executor Playwright direto

Consulte [`automation/README.md`](automation/README.md) para configurar o worker,
executar cenários pela interface e localizar screenshots e traces.

## Testes não funcionais

O Orchestrator consolida performance com k6, segurança passiva com OWASP ZAP e
acessibilidade com axe-core. O executor autenticado, os limites padrão e o
fluxo direto estão documentados em
[`automation/non-functional/README.md`](automation/non-functional/README.md).

## Produção

A implantação com Docker, validação de segredos, migrations, health checks,
backup, restauração e procedimento de atualização está documentada em
[`automation/production/README.md`](automation/production/README.md).

Endpoints operacionais:

- `GET /healthz`: processo da aplicação ativo;
- `GET /readyz`: aplicação pronta e banco acessível/migrado.

Antes de publicar uma versão, execute `npm run security:audit`, `npm run check`,
`npm test` e `npm run build`. O workflow de CI executa essas verificações e
também constrói a imagem Docker.

## Segurança

- Nunca versionar `.env`, tokens, senhas ou evidências com dados pessoais.
- Use segredos diferentes para JWT, banco e integração do agente.
- Exponha somente o proxy HTTPS; MySQL e workers Playwright devem permanecer em
  rede privada.
- Produção deve ser somente leitura para o agente.
- Scans ativos e testes de carga exigem ambiente e autorização específicos.
- Screenshots, relatórios e logs são gravados em `artifacts/`, que não é versionado.

## Estado do roadmap

- Geração de cenários e análise de cobertura: concluídas.
- Executor Playwright direto integrado à fila: concluído.
- Contrato literal por cenário Gherkin e separação de falhas: concluídos.
- Disparo pelo frontend com ambientes e credenciais parametrizados: concluído.
- Acompanhamento em tempo real por cenário, etapa e ambiente no frontend: concluído.
- Captura rastreável de screenshots e execução completa pelo agente: validadas ponta a ponta.
- Execução real via VPN COGEL, incluindo login e cenário funcional: validada.
- Gerador Node.js de evidências DOCX com screenshots: concluído.
- Geração automática do DOCX pelo executor direto e link no histórico: concluída.
- Persistência de execuções e dashboard operacional: concluídos.
- k6, OWASP ZAP, axe-core e dashboard não funcional: concluídos.
- Cards Markdown de defeitos reais, com cópia e download pelo Dashboard: concluídos.
- Reteste, classificação de flaky tests e relatório HTML de confiabilidade: concluídos.
- Memória especialista persistente por projeto, sistema e sprint: concluída.
- Aprendizado automático de rotas, telas, elementos semânticos e fluxos aprovados: concluído.
- Ciclo de vida dos cards de defeito, com histórico e rastreabilidade: concluído.
- Preparação de produção, segurança HTTP, health checks, CI e backups: concluída.
- Preflight GO/NO-GO e runtime mínimo de homologação: concluídos.
