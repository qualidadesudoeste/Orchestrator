# QA Platform TODO

- [x] Upgrade para full-stack (db, server, user)
- [x] Schema do banco: clients, projects, sprints, checklists, users
- [x] Criar tabelas no banco via SQL
- [x] server/db.ts com todos os helpers
- [x] server/routers.ts com todos os endpoints tRPC
- [x] Tela de login com Manus OAuth
- [x] Layout adaptado ao tema QA com header e navegação por perfil
- [x] Página de cadastro de Clientes (admin)
- [x] Página de cadastro de Projetos (admin)
- [x] Página de cadastro de Sprints (admin)
- [x] Página do Checklist associado a sprint com persistência no banco
- [x] Histórico de checklists do analista
- [x] Painel do Coordenador: visão geral de todos os analistas
- [x] Gerenciamento de usuários e perfis (admin)
- [x] Testes vitest (auth.logout passando)

## Correções de UX (v2)
- [x] Tela de boas-vindas/login clara para usuários não autenticados com explicação do sistema
- [x] Fluxo de onboarding: explicar como novos analistas acessam (login via conta Manus)
- [x] Home: botão "Abrir Checklist" visível diretamente nos cards de sprint
- [x] Tela da Sprint: exibir o checklist completo do procedimento ao clicar em uma sprint
- [x] Checklist da sprint: mostrar as 5 fases e todos os itens do procedimento (igual ao guia original)
- [x] Sprints: mostrar lista de sprints com botão "Abrir Checklist" em cada uma (analistas também veem)
- [x] Usuários: tela acessível ao coordenador para gerenciar perfis
