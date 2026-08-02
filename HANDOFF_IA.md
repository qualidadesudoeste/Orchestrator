# Handoff para continuidade — Orchestrator e Agente QA Autônomo

Atualizado em **27/07/2026**.

## 1. Local correto do projeto

Use este diretório como fonte principal:

```text
C:\Users\jessi\Documents\Orchestrator\orchestrator-platform
```

Repositório remoto:

```text
https://github.com/qualidadesudoeste/Orchestrator.git
```

- Branch atual: `main`
- Último commit existente: `d8b2791 feat: automatiza configuracao e primeiro administrador`
- O arquivo canônico do agente n8n está em:
  `automation/n8n/Agente_QA_Playwright_MCP.json`
- Não continuar a partir de cópias antigas em `Downloads` ou
  `C:\Desenvolvimento\...`.

## 2. Instruções obrigatórias para a próxima IA

1. Comece executando `git status --short` dentro do diretório correto.
2. Preserve as alterações locais descritas neste documento. Não use
   `git reset --hard`, `git checkout --` ou outra operação que as descarte.
3. Não imprima, copie para o chat ou versione valores de `.env`, tokens,
   senhas, chaves OpenAI ou credenciais de sistemas testados.
4. Use somente contas e ambientes explicitamente autorizados para automação.
5. A usuária não é desenvolvedora. Priorize operação simples pelo frontend e
   evite exigir acesso manual ao n8n.
6. Por enquanto o uso deve continuar **local**. Servidor e domínio foram
   adiados deliberadamente.

## 3. O que é o projeto

O Orchestrator é um hub full-stack para o processo de Quality Assurance. Ele
centraliza:

- clientes, projetos e sprints;
- checklist do POP de Qualidade;
- trilha de capacitação;
- geração de casos BDD/Gherkin com IA;
- análise de cobertura e risco;
- execução automatizada via n8n + Playwright MCP;
- screenshots e evidências DOCX;
- código de regressão Playwright + TypeScript;
- cards de defeito Markdown para o SIG;
- reteste e classificação de testes flaky;
- relatório HTML de confiabilidade;
- memória especialista por projeto/sistema/sprint;
- dashboard funcional e não funcional;
- k6, OWASP ZAP e axe-core.

Stack:

- Frontend: React 19, TypeScript, Vite, TailwindCSS e shadcn/ui.
- Backend: Node.js, Express e tRPC.
- Banco: MySQL com Drizzle ORM.
- IA da plataforma: API OpenAI por `server/_core/llm.ts`.
- Agente: n8n 2.31.4, OpenAI Chat Model e Playwright MCP.

## 4. Desenvolvimento mais recente

Foi implementado o fluxo solicitado pela usuária:

1. A pessoa gera o plano de testes no Orchestrator.
2. Clica em **Iniciar testes**.
3. Informa URL de login, usuário de testes e senha.
4. Confirma que o ambiente está autorizado.
5. O backend converte os casos para Gherkin e chama automaticamente o webhook
   do n8n.
6. O agente executa os cenários no Playwright.
7. Evidências, resultados, relatórios, cards e código de regressão voltam para
   o Orchestrator.
8. A pessoa acompanha pelo Dashboard, sem abrir o n8n.

Também foi corrigida a integração com modelos GPT-5: o wrapper agora usa
`max_completion_tokens` para GPT-5/modelos de raciocínio e mantém
`max_tokens` para modelos antigos/Forge compatíveis.

### Segurança aplicada

- senha mascarada no frontend;
- confirmação explícita de ambiente autorizado;
- senha não é salva em `localStorage` nem no banco do Orchestrator;
- workflow configurado para não persistir dados de sucesso/erro no histórico
  do n8n;
- login e senha são removidos antes de relatórios, memória e callbacks;
- webhook protegido pelo mesmo `QA_AGENT_API_TOKEN`;
- timeout do backend ao chamar o n8n;
- UI informa que as credenciais passam de forma efêmera pelo provedor de IA;
- devem ser usadas somente contas descartáveis de homologação.

### Validação ponta a ponta já realizada

Em 24/07/2026 foi executado um cenário controlado contra
`https://example.com`:

- webhook respondeu com sucesso;
- Playwright executou o cenário;
- status persistido: `PASSOU`;
- relatório DOCX criado;
- relatório de confiabilidade criado;
- código de regressão criado;
- execução registrada no Dashboard;
- busca no payload persistido confirmou ausência do login e da senha usados no
  smoke test.

### Correção de autenticação do agente — 28/07/2026

A execução `web-1785253281309-9bbc377c` confirmou que o sistema SIG estava
acessível, mas o agente falhava antes de enviar o login porque chamava
`browser_fill_form` e `browser_click` com referências incompatíveis. A versão
local do Playwright MCP exige `target`; os campos de `browser_fill_form` exigem
`target`, `name`, `type` e `value`.

O `systemMessage` do nó **Agente QA** agora obriga o fluxo a:

- capturar `browser_snapshot` antes de interagir;
- usar os `target` exatos do snapshot e nunca a propriedade antiga `ref`;
- tentar `browser_type` somente uma vez como fallback;
- confirmar que a tela de login desapareceu antes do cenário autenticado;
- preservar cenários explicitamente sem autenticação;
- classificar credencial recusada, MFA, CAPTCHA ou SSO humano como bloqueio.

O workflow corrigido foi importado, publicado e reativado no n8n local. Um
smoke test direto abriu o SIG e preencheu os campos com valores fictícios sem
enviar o formulário. O teste de contrato `server/n8nWorkflowContract.test.ts`
protege essas instruções contra regressão.

## 5. Escopo da entrega atual

Arquivos principais desta entrega:

```text
M .env.example
M .env.production.example
M automation/README.md
M automation/n8n/Agente_QA_Playwright_MCP.json
M automation/n8n/docker-compose.yml
M client/src/pages/QAPlannerPage.tsx
M server/_core/env.ts
M server/_core/llm.ts
M server/routers.ts
```

Resumo:

- `QAPlannerPage.tsx`: formulário de URL/login/senha e botão **Iniciar testes**.
- `routers.ts`: mutation `qaPlanner.startAutomatedTests`.
- `_core/env.ts`: configuração `N8N_QA_WEBHOOK_URL`.
- `_core/llm.ts`: compatibilidade de tokens com GPT-5.
- workflow n8n: webhook autenticado, entrada dinâmica, login efêmero,
  sanitização e integração completa.
- compose n8n: estabilização do JS Task Runner.
- exemplos de ambiente e documentação atualizados.

Ao continuar o projeto, confirme o estado efetivamente publicado com `git log`
e `git status`. Não misture este escopo com trabalho não relacionado.

## 6. Estado atual do ambiente local

Em 27/07/2026, Docker Desktop, MySQL, n8n, Playwright MCP e Orchestrator foram
iniciados e validados localmente. O workflow **Agente QA — Playwright MCP** foi
carregado como ativo a partir do volume persistente do n8n.

O `.env` da raiz já contém os nomes de configuração necessários, incluindo:

```text
DATABASE_URL
JWT_SECRET
QA_AGENT_API_TOKEN
ORCHESTRATOR_PUBLIC_URL
BUILT_IN_FORGE_API_URL
BUILT_IN_FORGE_API_KEY
N8N_QA_WEBHOOK_URL
```

Não exibir os valores.

## 7. Como iniciar localmente

Na raiz do projeto:

### Banco

```powershell
docker compose --env-file .\automation\database\.env `
  -f .\automation\database\docker-compose.yml up -d
```

### n8n

Na primeira instalação, garantir que o volume exista:

```powershell
docker volume create n8n_data
```

Depois:

```powershell
docker compose --env-file .\automation\n8n\.env `
  -f .\automation\n8n\docker-compose.yml up -d
```

### Playwright MCP

```powershell
powershell -ExecutionPolicy Bypass `
  -File .\automation\playwright\start-playwright-mcp.ps1
```

### Orchestrator

Modo de desenvolvimento:

```powershell
npm run dev
```

Ou build local:

```powershell
npm run build
node dist/index.js
```

Endereços esperados:

```text
Orchestrator: http://127.0.0.1:3000
n8n:         http://127.0.0.1:5678
Playwright:  http://127.0.0.1:8931/mcp
```

## 8. Validações atuais

Executadas com sucesso em 27/07/2026:

```text
npm run check  -> passou
npm test       -> 37 testes passaram; 1 integração com IA ficou ignorada
npm run build  -> passou
git diff --check -> sem erros
```

Também foi executado um teste ponta a ponta exclusivamente pela interface:

- plano com 10 cenários gerado para `https://example.com`;
- execução `web-1785183129971-badc1f50` aceita pelo webhook;
- 10 sessões Playwright processadas;
- cobertura executada de 100%;
- resultado consolidado no Dashboard;
- evidência DOCX e relatório HTML gerados;
- credenciais fictícias usadas no teste não foram encontradas nos arquivos do
  projeto após a execução.

O Vite apenas alerta que o bundle principal supera 500 kB. Isso não bloqueia o
funcionamento, mas pode virar uma melhoria de performance.

## 9. O que ainda falta

### Próximas melhorias recomendadas

1. **Acompanhamento em tempo real:** hoje o botão confirma que o n8n aceitou a
   execução e oferece acesso ao Dashboard, mas não mostra progresso por cenário.
   Criar estados `QUEUED`, `RUNNING`, `FINISHED` e `FAILED`, polling/SSE e uma
   tela de detalhes da execução.
2. **Testes da nova integração:** adicionar testes unitários da mutation
   `startAutomatedTests` com `fetch` mockado e testes de interface do formulário.
3. **Credenciais mais fortes:** atualmente login e senha passam pelo provedor
   de IA para permitir login dinâmico. Para uso mais sensível, implementar um
   cofre de contas de teste ou etapa determinística de autenticação que não
   exponha a senha ao modelo.
4. **Provisionamento reproduzível do n8n:** automatizar importação/publicação do
   workflow e configuração da credencial OpenAI para instalações novas. A
   sincronização atual está no volume local, não no Git.
5. **Persistir o plano gerado:** os casos do gerador ficam no estado da tela e
   são perdidos ao atualizar a página antes da exportação. Salvar rascunhos por
   projeto/sprint.
6. **Autenticações especiais:** definir tratamento explícito para MFA, CAPTCHA,
   SSO e contas bloqueadas, classificando-as como `BLOQUEADO`, sem tentar
   contornar controles.
7. **Produção:** servidor, domínio, HTTPS e hardening final permanecem adiados a
   pedido da usuária. Não iniciar publicação sem nova autorização.

## 10. Próximo objetivo sugerido

Evoluir o acompanhamento em tempo real da integração **Orchestrator → n8n →
Playwright → Dashboard**, adicionando estados de fila e progresso por cenário,
além de testes automatizados específicos para a mutation e o formulário.

## 11. Texto curto para iniciar outra IA

```text
Continue o projeto Orchestrator no diretório:
C:\Users\jessi\Documents\Orchestrator\orchestrator-platform

Leia primeiro HANDOFF_IA.md, README.md e automation/README.md. Execute
git status --short e preserve todas as alterações locais; não use reset ou
checkout para descartá-las. Não mostre valores do .env.

O sistema é um hub de QA com React/TypeScript, Express/tRPC, MySQL/Drizzle,
OpenAI, n8n e Playwright MCP. A última entrega adicionou ao frontend o botão
Iniciar testes, com URL/login/senha, e o disparo automático de um webhook do
n8n. O fluxo ponta a ponta já passou em um smoke controlado, mas essas mudanças
ainda não foram commitadas.

Primeiro ligue e valide os serviços locais, confirme o fluxo pelo frontend,
adicione testes para qaPlanner.startAutomatedTests, atualize o roadmap obsoleto
do README e prepare um commit limpo. O uso deve continuar local; não publique
servidor ou domínio. Use somente credenciais de homologação e nunca exponha
segredos.
```
