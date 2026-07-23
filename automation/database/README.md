# Banco MySQL local

1. Copie `.env.example` para `.env` e troque as duas senhas.
2. Configure `DATABASE_URL` no `.env` da raiz do Orchestrator.
3. Inicie o banco:

```powershell
docker compose --env-file .env up -d
```

4. Na raiz do projeto, aplique as migrations:

```powershell
npm run db:push
```

O volume `orchestrator_mysql_data` preserva os dados entre reinicializações.
