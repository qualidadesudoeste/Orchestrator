# Checklist GO/NO-GO

## Infraestrutura

- [ ] Servidor Linux ou serviço de containers definido.
- [ ] Domínio de produção definido e certificado HTTPS válido.
- [ ] Proxy reverso encaminhando `Host`, `X-Forwarded-For` e
  `X-Forwarded-Proto`.
- [ ] MySQL, n8n e Playwright MCP acessíveis apenas pela rede privada.
- [ ] Imagem Docker construída e identificada por versão imutável.

## Configuração

- [ ] `.env.production` criado fora do Git.
- [ ] `JWT_SECRET`, `QA_AGENT_API_TOKEN`, `MYSQL_PASSWORD` e
  `MYSQL_ROOT_PASSWORD` são fortes, diferentes e exclusivos do ambiente.
- [ ] `ORCHESTRATOR_PUBLIC_URL` usa o domínio HTTPS definitivo.
- [ ] `TRUST_PROXY` representa exatamente a quantidade de proxies.
- [ ] Chave da OpenAI ativa, com limite financeiro e alertas configurados.

## Banco e recuperação

- [ ] Backup realizado antes da liberação.
- [ ] Arquivo `.sha256` armazenado junto ao backup.
- [ ] Restauração testada em ambiente separado.
- [ ] Migration revisada e executada pelo serviço `migrate`.

## Validação

- [ ] CI aprovada no commit que será implantado.
- [ ] Auditoria de dependências de produção sem vulnerabilidade alta/crítica.
- [ ] `/healthz` e `/readyz` respondem 200.
- [ ] Login, Dashboard e geração de plano passaram no smoke test.
- [ ] Fluxo n8n executou um cenário controlado.
- [ ] Evidência DOCX e card Markdown foram gerados.
- [ ] Preflight terminou com resultado `GO`.

## Operação

- [ ] Monitor consulta `/readyz` e possui destinatário de alerta.
- [ ] Logs JSON são coletados com retenção e acesso restrito.
- [ ] Responsável pelo rollback foi definido.
- [ ] Versão anterior da imagem permanece disponível.
- [ ] Janela de implantação e comunicação à equipe foram confirmadas.

Qualquer item obrigatório não marcado mantém a liberação em **NO-GO**.
