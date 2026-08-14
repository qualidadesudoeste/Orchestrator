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
