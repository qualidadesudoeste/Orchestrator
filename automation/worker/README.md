# Worker Windows

O worker é o único processo que abre Chrome, controla VPNs e consome a fila de
execuções. Ele deve acessar o mesmo MySQL da API, mas não precisa receber tráfego
HTTP público.

## Instalação

Use uma pasta local não sincronizada, por exemplo
`C:\Desenvolvimento\RPA\orchestrator-platform`. Não mantenha `node_modules` no
Google Drive, OneDrive ou compartilhamentos de rede.

```powershell
Set-Location C:\Desenvolvimento\RPA\orchestrator-platform
npm.cmd ci
npm.cmd run check
npm.cmd test
npm.cmd run build
```

Configure no `.env` o mesmo `DATABASE_URL` e as mesmas chaves da API. Instale o
Google Chrome ou defina:

```dotenv
PLAYWRIGHT_CHROME_EXECUTABLE_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe
```

Cada chamada ao provedor de IA é limitada por `LLM_REQUEST_TIMEOUT_MS` (padrão:
3 minutos), e cada cenário completo por `QA_SCENARIO_TIMEOUT_MS` (padrão: 15
minutos). Um timeout registra `ERRO_AUTOMACAO` somente no cenário afetado e o
worker continua os demais. Após queda ou reinício, o checkpoint integralmente
criptografado é salvo no MySQL e também em
`artifacts/agent-executions/<execução>`. Outro worker pode retomar o plano sem
repetir cenários já concluídos; o arquivo local funciona como redundância.

Quando API e worker estiverem em máquinas diferentes, configure no `.env` do
worker `ORCHESTRATOR_API_URL` com a URL HTTPS ou privada da API. Screenshots,
downloads e traces serão enviados com `QA_AGENT_API_TOKEN`; a API gera e serve
o relatório HTML e o DOCX em seu próprio volume. Deixe a variável vazia apenas
quando API e worker compartilham o mesmo diretório `artifacts`.

Inicie com `npm.cmd run start:worker`. O preflight encerra imediatamente quando
o sistema não é Windows, o Chrome não existe ou a configuração de produção é
inválida. Para desenvolvimento, use `npm.cmd run dev:worker`.

Registre `node dist/worker.js` em um gerenciador de serviços Windows de sua
preferência, com diretório de trabalho na raiz do projeto, reinício automático
e uma conta com apenas as permissões necessárias às VPNs e aos artefatos.

Para uma instalação local com o Agendador de Tarefas, use
`run-production-process.ps1 -Mode api` e `run-production-process.ps1 -Mode worker`.
O script fixa `NODE_ENV=production`, resolve a raiz do checkout sem depender do
diretório atual e mantém logs separados em `artifacts/runtime`.

## Empacotamento

`npm run build` produz entradas independentes:

- `dist/index.js`: API/frontend, usado pelo container Linux;
- `dist/worker.js`: fila, Playwright, Chrome e VPN no Windows;
- `automation/evidence-docx`: gerador copiado para a imagem da API e acessível
  ao worker quando ambos usam o mesmo checkout.

Depois de atualizar o código, execute novamente `npm.cmd ci` e `npm.cmd run
build`; nunca copie uma pasta `node_modules` de outro sistema operacional.
