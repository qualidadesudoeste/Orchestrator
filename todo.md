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

## Reestruturação Hierárquica (v3)
- [x] Atualizar Home/Dashboard: cards de sprint mostram cliente e projeto vinculados
- [x] Unificar layout: AppLayout como único wrapper, checklist como modal
- [x] Criar WorkspacePage: hierarquia Cliente > Projeto > Sprint em drill-down numa única tela
- [x] Transformar ChecklistPage em ChecklistModal com contexto Cliente/Projeto/Sprint no topo
- [x] Remover rotas /clients, /projects, /sprints separadas — unificar em /workspace
- [x] Atualizar sidebar: substituir Clientes/Projetos/Sprints por "Workspace"

## Módulo Trilha do Conhecimento
- [x] Criar tabela trail_progress no banco de dados
- [x] Criar dados estáticos da trilha (4 níveis, tópicos, recursos)
- [x] Criar endpoints backend: getProgress, saveProgress, adminView
- [x] Criar TrailPage com 4 níveis progressivos e progresso interativo
- [x] Adicionar Trilha no menu lateral
- [x] Visão do administrador: progresso de todos os analistas na trilha

## Autenticação Própria (substituir Manus OAuth)
- [x] Schema: adicionar username, passwordHash; tornar openId nullable
- [x] Migração SQL aplicada via webdev_execute_sql
- [x] Backend: auth.login com bcrypt (publicProcedure)
- [x] Backend: auth.me retorna usuário da sessão JWT local
- [x] Backend: auth.logout limpa cookie
- [x] Backend: users.create (admin cria usuário com perfil)
- [x] Backend: users.update (admin edita nome/email/perfil)
- [x] Backend: users.delete (admin remove usuário)
- [x] Backend: users.resetPassword (admin redefine senha)
- [x] Seed: usuário admin inicial via SQL (admin / admin123)
- [x] Frontend: LoginPage com formulário usuário/senha
- [x] Frontend: useAuth sem referência ao Manus OAuth
- [x] Frontend: main.tsx sem startLogin/manus-cookie
- [x] Frontend: AppLayout sem tela de "Entrar com Manus"
- [x] Frontend: UsersPage para admin cadastrar/editar/deletar usuários
- [x] Frontend: App.tsx com rota /login
- [x] Testes vitest: auth.login local (4/4 passando)
