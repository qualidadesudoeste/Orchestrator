# Sandbox neutra de QA

Aplicação local determinística para homologar o executor sem usar sistemas ou
dados de clientes. Ela cobre carregamento, validação de formulário, criação e
consulta de registro e download de evidência.

Execute:

```powershell
npm.cmd run sandbox:smoke
```

O comando inicia a sandbox em uma porta local aleatória, abre o Chrome pelo
`playwright-core`, executa cada cenário isoladamente e grava o relatório em
`artifacts/qa-sandbox`. Defina `PLAYWRIGHT_CHROME_EXECUTABLE_PATH` somente se o
Chrome não estiver no local padrão.

Para validar também planejamento, ferramentas, contrato Gherkin, verificador e
sanitização com a IA configurada na plataforma, execute:

```powershell
npm.cmd run sandbox:agent-smoke
```

Essa segunda suíte consome o provedor de IA ativo e grava traces somente em
`artifacts/qa-sandbox-agent`.
