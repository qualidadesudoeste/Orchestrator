# Operação em produção

## Pré-requisitos

- Docker Engine ou Docker Desktop com Compose;
- domínio HTTPS apontando para um proxy reverso;
- backup externo ao servidor;
- credenciais diferentes das usadas em desenvolvimento.

## Primeira implantação

1. Copie `.env.production.example` para `.env.production`.
2. Gere valores aleatórios independentes para banco, JWT e agente.
3. Configure `ORCHESTRATOR_PUBLIC_URL` com o endereço HTTPS final.
4. Valide a configuração sem iniciar os serviços:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml config
```

5. Construa e inicie:

```powershell
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build
```

O serviço `migrate` aplica somente migrations versionadas antes de liberar o
container da aplicação. Não execute `db:generate` no servidor.

## Proxy e HTTPS

O container publica por padrão apenas em `127.0.0.1:3000`. Use Nginx, Caddy ou
o proxy corporativo para TLS, encaminhando `Host`, `X-Forwarded-For` e
`X-Forwarded-Proto`. Configure `TRUST_PROXY=1` somente quando houver exatamente
um proxy confiável. Não exponha MySQL, n8n ou Playwright MCP à internet.

## Saúde e observabilidade

- `GET /healthz`: processo Node ativo;
- `GET /readyz`: aplicação pronta e banco migrado;
- logs: uma linha JSON por requisição, sem corpo, cookies ou tokens;
- `X-Request-Id`: devolvido em cada resposta para rastreamento.

Configure o monitor para consultar `/readyz` a cada minuto e alertar após três
falhas consecutivas. Colete stdout/stderr do container em uma ferramenta com
retenção e acesso restrito.

## Preflight de liberação

Execute antes de cada publicação:

```powershell
node .\automation\production\release-preflight.cjs `
  --base-url https://qa.seudominio.com.br `
  --env-file .env.production `
  --image orchestrator-platform:VERSAO
```

O comando grava um relatório JSON em `artifacts/release`. Somente o resultado
`GO` autoriza a publicação. `ATENCAO` indica verificações puladas e `NO_GO`
indica falha. Complete também o
[`RELEASE_CHECKLIST.md`](RELEASE_CHECKLIST.md).

## Backup

Execute diariamente e copie o `.zip` e o `.sha256` para armazenamento externo:

```powershell
.\automation\production\backup-database.ps1 `
  -Container orchestrator-platform-mysql-1 `
  -RetentionDays 14
```

Teste a restauração mensalmente em um ambiente separado:

```powershell
.\automation\production\restore-database.ps1 `
  -BackupFile .\artifacts\backups\orchestrator_YYYYMMDD_HHMMSS.zip `
  -Container orchestrator-homolog-mysql-1 `
  -ConfirmRestore
```

Nunca teste restauração diretamente no banco de produção. Um backup só é
considerado válido depois de restaurado e conferido.

## Atualização e retorno

1. Gere backup.
2. Registre a versão atual (`docker compose images`).
3. Faça `git pull`, revise a migration e execute `up -d --build`.
4. Aguarde `/readyz` e realize o smoke test.
5. Em falha de aplicação, volte à imagem anterior. Em falha de migration, não
   reverta SQL manualmente: isole o serviço e restaure o backup validado.
