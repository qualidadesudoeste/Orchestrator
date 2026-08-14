# Handoff — Orchestrator e Agente QA

Atualizado em 13/08/2026.

## Objetivo

O Orchestrator é o hub da equipe de QA para clientes, projetos, sprints,
checklists, planos de teste, fila, execuções, evidências, defeitos, dashboard e
memória especialista.

## Arquitetura atual

- Frontend: React, TypeScript, Vite, TailwindCSS e shadcn/ui.
- Backend: Node.js, Express e tRPC.
- Banco: MySQL com Drizzle ORM.
- IA: provedor configurável nos Parâmetros da plataforma.
- Automação: Playwright direto no worker local/servidor.
- Fila: reserva workers por capacidade e pool de rede (`PUBLIC`, `COGEL`,
  `SEFAZ` ou `OUTRA`).

O n8n foi removido. Novas execuções seguem:

```text
Frontend → fila → worker/VPN → agente Playwright direto
         → resultados/evidências → banco → histórico/dashboard
```

## Regra central da execução

`server/qaPilotAgent.ts` converte cada cenário em contrato ordenado. Cada
`Dado`, `Quando`, `Então`, `E` e `Mas` precisa ser registrado individualmente.
O agente não pode pular, agrupar ou reordenar passos, finalizar com passos
pendentes nem escolher livremente o status final.

`server/directQaExecutionService.ts` conecta esse agente à fila real, consulta
memória e contexto do código, persiste progresso, screenshots, traces, relatório
web e DOCX. Após cada cenário, mapas de tela, rotas, elementos semânticos e
fluxos aprovados são gravados na memória do projeto sem valores digitados.
Pausa, retomada e cancelamento são consultados durante a execução.

Fluxos com status `PASSOU` e verificador independente aprovado também geram
uma receita estruturada e versionada (`server/approvedAutomationService.ts`).
Na próxima execução do mesmo Gherkin no mesmo projeto/host, o executor tenta
essa receita antes do loop completo de IA. Senhas não entram na receita, cliques
continuam semânticos e uma chamada curta ao verificador confirma a interface
atual. Se um seletor mudou ou a evidência não confirmar o resultado, o fluxo
faz fallback automático para o agente e reaprende após nova aprovação.

Após a execução real `web-1786631570553-864812c4` revelar bloqueios por
pré-condições e um erro de referência dinâmica, o executor passou a:

- recuperar elementos pelo nome/role quando a referência observada expirar;
- inspecionar tabelas, seções e campos antes de aceitar `Dado` bloqueado;
- capturar downloads reais, com nome, tamanho e arquivo como evidência;
- abrir nova sessão isolada para uma segunda conta parametrizada;
- gerar automaticamente CPF válido, nome, e-mails, telefone, segunda conta,
  senha forte e termos sintéticos sem enviar os valores ao modelo;
- capturar pela interface protocolos, identificadores, campos e links e
  reutilizá-los nos cenários seguintes da mesma execução;
- criar e autenticar uma segunda conta pela interface quando o usuário atual
  possuir essa capacidade;
- limitar o loop exploratório integrado a 18 iterações por cenário.

O usuário não precisa parametrizar massa manualmente. O modelo recebe somente
nomes de chaves locais, e as ferramentas Playwright fazem geração,
preenchimento, captura e reutilização dos valores.

## Execução local

Repositório principal:

```text
G:\Meu Drive\Documentos Jéssica\PC\Codex\Orchestrator\orchestrator-platform
```

Cópia de runtime:

```text
C:\Users\jessi\AppData\Local\Orchestrator\orchestrator-platform-runtime
```

Comandos:

```powershell
npm install
npm run db:push
npm run check
npm test
npm run build
npm run dev
```

A aplicação local fica em `http://localhost:3000`.

## Segurança

- `.env`, credenciais, tokens e artefatos não podem ser versionados.
- Senhas de ambientes e VPNs ficam criptografadas.
- Credenciais não são enviadas à IA nem armazenadas nos traces.
- Workers e banco não devem ser expostos diretamente à internet.

## Validação atual

- TypeScript sem erros.
- 85 testes automatizados aprovados e 1 teste de integração opcional ignorado.
- Build de produção concluído.
- Servidor local disponível em `http://localhost:3000`.
- Ciclo real COGEL validado em 13/08/2026 pela execução
  `web-1786629213598-c3415c0d`: login, cenário literal, screenshot, memória,
  relatório HTML e DOCX concluídos com status `PASSOU`.

## Próximas prioridades

1. Repetir o plano Salvador Segura para validar criação/captura automática de
   dados e identificar quais estados temporais dependem de suporte do sistema alvo.
2. Executar pela interface um cenário já aprovado para medir a economia real
   da receita (esperado: uma chamada curta, em vez do loop de dezenas de chamadas).
3. Persistir e exibir tokens, custo, duração e modo (`AGENT`/`APPROVED_RECIPE`)
   por cenário no dashboard.
4. Validar os pools `PUBLIC`, `COGEL` e `SEFAZ` com concorrência real.
5. Publicar as alterações revisadas no GitHub.
