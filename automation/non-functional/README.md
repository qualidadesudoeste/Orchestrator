# Testes não funcionais

O executor consolida três verificações autorizadas:

- **k6**: carga leve e limites de tempo de resposta/taxa de erro.
- **OWASP ZAP Baseline**: análise passiva de segurança, sem ataques ativos.
- **axe-core**: regras WCAG 2 A/AA no Chrome local.

> Execute somente contra sistemas para os quais sua equipe possui autorização.

## Preparação

1. O executor reutiliza por padrão o `QA_AGENT_API_TOKEN` da raiz.
2. Se quiser separar as credenciais, copie `.env.example` para `.env` e
   configure `NON_FUNCTIONAL_RUNNER_TOKEN`.
3. Mantenha `ALLOW_PRIVATE_TARGETS=false`. Ative-o apenas para homologações
   internas controladas.
4. Inicie:

```powershell
powershell -ExecutionPolicy Bypass -File .\automation\non-functional\start-non-functional-runner.ps1
```

O serviço fica em `http://localhost:8940`. O n8n usa
`http://host.docker.internal:8940`.

Na primeira execução, o Docker baixa as imagens fixadas do k6 e do ZAP. Os
relatórios JSON ficam em `artifacts/non-functional/<run_id>`.

## Limites padrão

- k6: 3 usuários virtuais por 10 segundos.
- p95: abaixo de 2.000 ms.
- taxa de falha: abaixo de 5%.
- ZAP: falha quando encontra alerta de risco alto.
- axe-core: falha quando encontra violação crítica ou séria.

Os valores podem ser alterados no payload do workflow sem editar código.
