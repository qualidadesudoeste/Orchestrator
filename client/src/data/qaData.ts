export interface CheckItem {
  id: string;
  text: string;
  detail?: string;
  link?: { label: string; url: string };
  code?: string;
  tags?: string[];
}

export interface Phase {
  id: string;
  number: number;
  title: string;
  subtitle: string;
  color: string;
  bgLight: string;
  borderColor: string;
  icon: string;
  steps: {
    id: string;
    stepNumber: string;
    title: string;
    items: CheckItem[];
  }[];
}

export const phases: Phase[] = [
  {
    id: "fase1",
    number: 1,
    title: "Análise e Refinamento",
    subtitle: "Entender o que será testado",
    color: "#7C3AED",
    bgLight: "#F5F3FF",
    borderColor: "#DDD6FE",
    icon: "🔍",
    steps: [
      {
        id: "1.1",
        stepNumber: "1.1",
        title: "Escolha da Sprint",
        items: [
          {
            id: "1.1.1",
            text: "Verificar cliente preferencial do QA na fila",
            detail: "Critério de priorização: Cliente preferencial do QA x Sistema mais antigo na fila (SLA 16h úteis).",
          },
          {
            id: "1.1.2",
            text: "Confirmar SLA de 16h úteis para o sistema mais antigo na fila",
          },
          {
            id: "1.1.3",
            text: "Definir qual sprint será testada com base no critério de priorização",
          },
        ],
      },
      {
        id: "1.2",
        stepNumber: "1.2",
        title: "Iniciar o Teste no SIG",
        items: [
          {
            id: "1.2.1",
            text: "Clicar em \"Iniciar teste\" no SIG para a sprint selecionada",
          },
        ],
      },
      {
        id: "1.3",
        stepNumber: "1.3",
        title: "Análise e Validação de Critérios de Aceite",
        items: [
          {
            id: "1.3.1",
            text: "Ler e analisar todas as Histórias de Usuário (HUs) e requisitos da sprint",
          },
          {
            id: "1.3.2",
            text: "Validar os critérios de aceite de cada HU — garantir que estão claros e testáveis",
            detail: "Use IA para auxiliar no entendimento e na extração de casos de exceção.",
            tags: ["IA"],
          },
          {
            id: "1.3.3",
            text: "Identificar e registrar qual é a equipe de desenvolvimento responsável",
          },
        ],
      },
    ],
  },
  {
    id: "fase2",
    number: 2,
    title: "Preparação do Plano",
    subtitle: "Estruturar a estratégia de testes",
    color: "#0891B2",
    bgLight: "#ECFEFF",
    borderColor: "#A5F3FC",
    icon: "📋",
    steps: [
      {
        id: "2.1",
        stepNumber: "2.1",
        title: "Exportação e Importação de Cards",
        items: [
          {
            id: "2.1.1",
            text: "Exportar todos os cards da sprint em JSON no SIG",
          },
          {
            id: "2.1.2",
            text: "Baixar todos os requisitos (HUs) da sprint",
          },
          {
            id: "2.1.3",
            text: "Importar o JSON dos cards e as HUs no Assistente Gerador de Plano de Testes",
            link: { label: "Abrir Gerador de Plano de Testes", url: "http://136.248.115.65:4500/qa" },
            tags: ["IA", "Ferramenta"],
          },
        ],
      },
      {
        id: "2.2",
        stepNumber: "2.2",
        title: "Seleção do Card e Estratégia de Automação",
        items: [
          {
            id: "2.2.1",
            text: "Escolher o card no SIG que será testado e dar play",
          },
          {
            id: "2.2.2",
            text: "Projetos com automação existente ou Códex + MCP Playwright: disparar automação para cobrir regressão",
            tags: ["Automação"],
          },
          {
            id: "2.2.3",
            text: "Novos projetos: criar automação rápida com Playwright Codegen",
            detail: "Execute npx playwright codegen <url> no terminal. Navegue no sistema e o Playwright gera o script automaticamente.",
            code: "npx playwright codegen <url-do-sistema>",
            tags: ["Automação", "Novo Projeto"],
          },
          {
            id: "2.2.4",
            text: "Testes manuais: focar em testes exploratórios de novas funcionalidades e validações visuais",
            tags: ["Manual"],
          },
        ],
      },
    ],
  },
  {
    id: "fase3",
    number: 3,
    title: "Execução e Não Conformidades",
    subtitle: "Executar, evidenciar e registrar defeitos",
    color: "#DC2626",
    bgLight: "#FEF2F2",
    borderColor: "#FECACA",
    icon: "⚡",
    steps: [
      {
        id: "3.1",
        stepNumber: "3.1",
        title: "Execução dos Cenários",
        items: [
          {
            id: "3.1.1",
            text: "Executar cenário a cenário conforme o plano de testes gerado",
          },
          {
            id: "3.1.2",
            text: "Excluir cenários repetitivos ou sem sentido para o momento do projeto ou negócio",
          },
        ],
      },
      {
        id: "3.2",
        stepNumber: "3.2",
        title: "Evidências de Sucesso",
        items: [
          {
            id: "3.2.1",
            text: "Capturar print de cada cenário executado com sucesso",
          },
          {
            id: "3.2.2",
            text: "Inserir todas as evidências no plano de testes",
          },
        ],
      },
      {
        id: "3.3",
        stepNumber: "3.3",
        title: "Registro de Erros (Corretivas) e Triagem",
        items: [
          {
            id: "3.3.1",
            text: "Evidenciar o erro encontrado com print/vídeo imediatamente — não esperar o final do teste",
            detail: "Registrar imediatamente ao encontrar o erro, sem aguardar o fim da sprint.",
            tags: ["Urgente"],
          },
          {
            id: "3.3.2",
            text: "Criar card corretivo no SIG usando o Assistente Criador de Cards",
            link: { label: "Abrir Criador de Cards SIG", url: "https://chatgpt.com/g/g-67db4af8bc78819196ba7da5b1d85e67-criador-de-cards-sig-oficial" },
            tags: ["IA", "Ferramenta"],
          },
          {
            id: "3.3.3",
            text: "Associar o card corretivo ao card pai que gerou a corretiva",
          },
          {
            id: "3.3.4",
            text: "Classificar a criticidade no SIG: Baixa / Média / Alta / Urgente",
            detail: "O campo de prioridade no SIG serve como indicador de criticidade para orientar a equipe de desenvolvimento.",
            tags: ["Criticidade"],
          },
          {
            id: "3.3.5",
            text: "Colocar impedimento no card pai e movê-lo para Backlog",
          },
          {
            id: "3.3.6",
            text: "Inserir o número do card corretivo criado no plano de testes",
          },
        ],
      },
      {
        id: "3.4",
        stepNumber: "3.4",
        title: "Retorno para Correção",
        items: [
          {
            id: "3.4.1",
            text: "Após finalizar todos os cenários, retornar o ciclo da sprint para correção do time de desenvolvimento",
          },
        ],
      },
    ],
  },
  {
    id: "fase4",
    number: 4,
    title: "Validação e Reteste",
    subtitle: "Confirmar correções e liberar cards",
    color: "#059669",
    bgLight: "#ECFDF5",
    borderColor: "#A7F3D0",
    icon: "✅",
    steps: [
      {
        id: "4.1",
        stepNumber: "4.1",
        title: "Validação das Corretivas",
        items: [
          {
            id: "4.1.1",
            text: "Ao receber a sprint para reteste, verificar se todos os cards de correção foram corrigidos",
          },
          {
            id: "4.1.2",
            text: "Capturar print de evidência de cada correção validada",
          },
          {
            id: "4.1.3",
            text: "Inserir as evidências de validação no plano de testes",
          },
        ],
      },
      {
        id: "4.2",
        stepNumber: "4.2",
        title: "Reteste do Card Pai",
        items: [
          {
            id: "4.2.1",
            text: "Retestar o card pai que estava com impedimento após validar a correção",
          },
          {
            id: "4.2.2",
            text: "Remover o impedimento do card pai após validação bem-sucedida",
          },
          {
            id: "4.2.3",
            text: "Mover o card pai para \"Concluído\" no SIG",
          },
        ],
      },
    ],
  },
  {
    id: "fase5",
    number: 5,
    title: "Encerramento e Melhoria",
    subtitle: "Liberar a sprint e registrar aprendizados",
    color: "#D97706",
    bgLight: "#FFFBEB",
    borderColor: "#FDE68A",
    icon: "🏁",
    steps: [
      {
        id: "5.1",
        stepNumber: "5.1",
        title: "Definition of Done (DoD)",
        items: [
          {
            id: "5.1.1",
            text: "Confirmar que todos os cenários de todos os cards foram validados e aprovados pelo QA",
            detail: "Um card só é considerado finalizado quando todos os cenários foram validados e aprovados.",
          },
        ],
      },
      {
        id: "5.2",
        stepNumber: "5.2",
        title: "Liberação da Sprint",
        items: [
          {
            id: "5.2.1",
            text: "Confirmar que a evidência de testes está completa no plano de testes",
          },
          {
            id: "5.2.2",
            text: "Liberar formalmente a sprint para produção",
          },
        ],
      },
      {
        id: "5.3",
        stepNumber: "5.3",
        title: "Retrospectiva de QA",
        items: [
          {
            id: "5.3.1",
            text: "Participar da retrospectiva conduzida pelo gerente",
          },
          {
            id: "5.3.2",
            text: "Apresentar dados coletados: total de bugs, bugs por HU, taxa de aprovação no primeiro reteste",
            tags: ["Métricas"],
          },
          {
            id: "5.3.3",
            text: "Registrar aprendizados e ações de melhoria para a próxima sprint",
          },
        ],
      },
    ],
  },
];

export const totalItems = phases.reduce(
  (acc, phase) =>
    acc + phase.steps.reduce((sacc, step) => sacc + step.items.length, 0),
  0
);
