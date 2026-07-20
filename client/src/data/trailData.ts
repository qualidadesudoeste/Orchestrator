export interface TrailTopic {
  id: string;
  title: string;
  description: string;
  type: "teoria" | "pratica" | "ferramenta" | "certificacao";
  estimatedHours: number;
  resources?: { label: string; url: string }[];
  tags?: string[];
}

export interface TrailLevel {
  id: string;
  level: number;
  title: string;
  subtitle: string;
  color: string;
  bgColor: string;
  borderColor: string;
  icon: string;
  topics: TrailTopic[];
}

export const trailLevels: TrailLevel[] = [
  {
    id: "nivel-1",
    level: 1,
    title: "Nível 1 — Fundamentos",
    subtitle: "Conceitos básicos e base teórica do QA",
    color: "#2563eb",
    bgColor: "#eff6ff",
    borderColor: "#bfdbfe",
    icon: "🎯",
    topics: [
      {
        id: "n1-01",
        title: "Lógica de Programação",
        description: "Algoritmos, estruturas de controle, variáveis e funções. Base para entender o código que será testado.",
        type: "teoria",
        estimatedHours: 20,
        tags: ["base", "programação"],
        resources: [
          { label: "Curso de Lógica — Curso em Vídeo", url: "https://www.cursoemvideo.com/curso/curso-de-algoritmo/" },
        ],
      },
      {
        id: "n1-02",
        title: "Arquitetura Web (Cliente-Servidor)",
        description: "Como funciona HTTP, REST, requisições, respostas, status codes e o ciclo de vida de uma aplicação web.",
        type: "teoria",
        estimatedHours: 10,
        tags: ["web", "http", "rest"],
        resources: [
          { label: "MDN Web Docs — HTTP", url: "https://developer.mozilla.org/pt-BR/docs/Web/HTTP" },
        ],
      },
      {
        id: "n1-03",
        title: "SDLC e Metodologias Ágeis",
        description: "Ciclo de vida de desenvolvimento de software, Scrum, Kanban e o papel do QA em cada fase.",
        type: "teoria",
        estimatedHours: 8,
        tags: ["agile", "scrum", "sdlc"],
        resources: [
          { label: "Scrum Guide (PT-BR)", url: "https://scrumguides.org/docs/scrumguide/v2020/2020-Scrum-Guide-PortugueseBR.pdf" },
        ],
      },
      {
        id: "n1-04",
        title: "Fundamentos de Teste de Software",
        description: "Tipos de teste (funcional, não-funcional, regressão), técnicas de caixa-preta e caixa-branca, ciclo de vida de um bug.",
        type: "teoria",
        estimatedHours: 15,
        tags: ["testes", "fundamentos"],
        resources: [
          { label: "ISTQB Foundation Syllabus", url: "https://www.istqb.org/certifications/certified-tester-foundation-level" },
        ],
      },
      {
        id: "n1-05",
        title: "Certificação ISTQB CTFL",
        description: "Preparação e obtenção da certificação internacional de fundamentos em teste de software.",
        type: "certificacao",
        estimatedHours: 40,
        tags: ["certificação", "istqb"],
        resources: [
          { label: "ISTQB — Certified Tester Foundation Level", url: "https://www.istqb.org/certifications/certified-tester-foundation-level" },
          { label: "Simulados ISTQB", url: "https://www.istqb.org/certifications/certified-tester-foundation-level" },
        ],
      },
      {
        id: "n1-06",
        title: "Escrita de Casos de Teste",
        description: "Como escrever casos de teste eficazes: pré-condições, passos, dados de entrada e resultado esperado.",
        type: "pratica",
        estimatedHours: 12,
        tags: ["casos de teste", "documentação"],
      },
      {
        id: "n1-07",
        title: "Gestão de Bugs e Defeitos",
        description: "Ciclo de vida de um defeito, como registrar um bug de forma clara, severidade vs. prioridade e comunicação com o dev.",
        type: "pratica",
        estimatedHours: 8,
        tags: ["bugs", "defeitos", "comunicação"],
      },
    ],
  },
  {
    id: "nivel-2",
    level: 2,
    title: "Nível 2 — Automação e Ferramentas",
    subtitle: "Linguagens, frameworks e ferramentas de automação",
    color: "#7c3aed",
    bgColor: "#f5f3ff",
    borderColor: "#ddd6fe",
    icon: "⚙️",
    topics: [
      {
        id: "n2-01",
        title: "JavaScript / TypeScript para QA",
        description: "Fundamentos de JS/TS necessários para escrever testes automatizados: tipos, funções, async/await, módulos.",
        type: "teoria",
        estimatedHours: 30,
        tags: ["javascript", "typescript", "programação"],
        resources: [
          { label: "TypeScript Handbook", url: "https://www.typescriptlang.org/docs/handbook/intro.html" },
        ],
      },
      {
        id: "n2-02",
        title: "Playwright — Automação Web",
        description: "Criação de testes end-to-end com Playwright: seletores, assertions, page objects, codegen e relatórios.",
        type: "ferramenta",
        estimatedHours: 25,
        tags: ["playwright", "automação", "e2e"],
        resources: [
          { label: "Playwright Docs", url: "https://playwright.dev/docs/intro" },
          { label: "Playwright Codegen", url: "https://playwright.dev/docs/codegen" },
        ],
      },
      {
        id: "n2-03",
        title: "Testes de API com Postman / Insomnia",
        description: "Criação de coleções de testes de API, variáveis de ambiente, scripts de pré/pós-requisição e automação de contratos.",
        type: "ferramenta",
        estimatedHours: 15,
        tags: ["api", "postman", "rest"],
        resources: [
          { label: "Postman Learning Center", url: "https://learning.postman.com/docs/getting-started/introduction/" },
        ],
      },
      {
        id: "n2-04",
        title: "Cypress — Alternativa ao Playwright",
        description: "Framework de testes e2e focado em DX: time-travel debugging, hot reload e integração com CI.",
        type: "ferramenta",
        estimatedHours: 20,
        tags: ["cypress", "automação", "e2e"],
        resources: [
          { label: "Cypress Docs", url: "https://docs.cypress.io/guides/overview/why-cypress" },
        ],
      },
      {
        id: "n2-05",
        title: "Appium — Testes Mobile",
        description: "Automação de testes em aplicativos iOS e Android com Appium: setup, drivers e estratégias de seleção.",
        type: "ferramenta",
        estimatedHours: 20,
        tags: ["appium", "mobile", "automação"],
        resources: [
          { label: "Appium Docs", url: "https://appium.io/docs/en/2.0/" },
        ],
      },
      {
        id: "n2-06",
        title: "Git e Controle de Versão",
        description: "Comandos essenciais do Git para QA: clone, branch, commit, pull request e resolução de conflitos.",
        type: "ferramenta",
        estimatedHours: 10,
        tags: ["git", "versionamento"],
        resources: [
          { label: "Pro Git Book (PT-BR)", url: "https://git-scm.com/book/pt-br/v2" },
        ],
      },
    ],
  },
  {
    id: "nivel-3",
    level: 3,
    title: "Nível 3 — Qualidade Contínua e DevOps",
    subtitle: "CI/CD, TDD, BDD e testes não-funcionais",
    color: "#059669",
    bgColor: "#ecfdf5",
    borderColor: "#a7f3d0",
    icon: "🔄",
    topics: [
      {
        id: "n3-01",
        title: "TDD — Test Driven Development",
        description: "Ciclo Red-Green-Refactor: escrever o teste antes do código. Benefícios, limitações e quando aplicar.",
        type: "pratica",
        estimatedHours: 15,
        tags: ["tdd", "desenvolvimento", "qualidade"],
      },
      {
        id: "n3-02",
        title: "BDD — Behavior Driven Development",
        description: "Escrita de cenários em Gherkin (Given-When-Then), integração com Cucumber e colaboração com PO/Dev.",
        type: "pratica",
        estimatedHours: 15,
        tags: ["bdd", "gherkin", "cucumber"],
        resources: [
          { label: "Cucumber Docs", url: "https://cucumber.io/docs/guides/overview/" },
        ],
      },
      {
        id: "n3-03",
        title: "CI/CD para QA",
        description: "Integração de testes automatizados em pipelines CI/CD: GitHub Actions, GitLab CI, Jenkins e relatórios automáticos.",
        type: "pratica",
        estimatedHours: 20,
        tags: ["ci/cd", "devops", "github actions"],
        resources: [
          { label: "GitHub Actions Docs", url: "https://docs.github.com/pt/actions" },
        ],
      },
      {
        id: "n3-04",
        title: "Testes de Performance",
        description: "Conceitos de carga, stress e spike testing. Ferramentas: k6, JMeter e Artillery.",
        type: "ferramenta",
        estimatedHours: 15,
        tags: ["performance", "carga", "k6", "jmeter"],
        resources: [
          { label: "k6 Docs", url: "https://k6.io/docs/" },
        ],
      },
      {
        id: "n3-05",
        title: "Testes de Segurança (OWASP)",
        description: "Top 10 OWASP, SQL Injection, XSS, CSRF e ferramentas básicas de pentest: OWASP ZAP e Burp Suite.",
        type: "ferramenta",
        estimatedHours: 20,
        tags: ["segurança", "owasp", "pentest"],
        resources: [
          { label: "OWASP Top 10", url: "https://owasp.org/www-project-top-ten/" },
        ],
      },
      {
        id: "n3-06",
        title: "Testes de Acessibilidade",
        description: "WCAG 2.1, ferramentas Axe e Lighthouse, testes com leitores de tela e critérios de aceite de acessibilidade.",
        type: "pratica",
        estimatedHours: 10,
        tags: ["acessibilidade", "wcag", "axe"],
        resources: [
          { label: "WCAG 2.1 (PT-BR)", url: "https://www.w3.org/Translations/WCAG21-pt-BR/" },
        ],
      },
    ],
  },
  {
    id: "nivel-4",
    level: 4,
    title: "Nível 4 — Soft Skills e Gestão da Qualidade",
    subtitle: "Liderança, métricas e melhoria contínua",
    color: "#d97706",
    bgColor: "#fffbeb",
    borderColor: "#fde68a",
    icon: "🏆",
    topics: [
      {
        id: "n4-01",
        title: "Comunicação Técnica e Documentação",
        description: "Como escrever relatórios de teste claros, comunicar bugs de forma eficaz e criar documentação útil para o time.",
        type: "pratica",
        estimatedHours: 10,
        tags: ["comunicação", "documentação", "soft skill"],
      },
      {
        id: "n4-02",
        title: "Métricas de Qualidade (KPIs)",
        description: "Defect Density, Test Coverage, DRE (Defect Removal Efficiency), MTTR e como apresentar métricas para gestores.",
        type: "teoria",
        estimatedHours: 12,
        tags: ["métricas", "kpi", "qualidade"],
      },
      {
        id: "n4-03",
        title: "Pensamento Crítico e Exploratório",
        description: "Técnicas de teste exploratório, heurísticas de teste (SFDPOT, HICCUPPS) e como pensar como um usuário malicioso.",
        type: "pratica",
        estimatedHours: 15,
        tags: ["exploratório", "heurísticas", "pensamento crítico"],
      },
      {
        id: "n4-04",
        title: "Gestão de Qualidade em Times Ágeis",
        description: "Papel do QA no refinamento, Definition of Done, retrospectivas de qualidade e como influenciar a cultura de qualidade.",
        type: "teoria",
        estimatedHours: 10,
        tags: ["agile", "qualidade", "gestão"],
      },
      {
        id: "n4-05",
        title: "Resolução de Problemas e Debugging",
        description: "Estratégias de isolamento de bugs, análise de logs, uso de DevTools e como reproduzir problemas intermitentes.",
        type: "pratica",
        estimatedHours: 15,
        tags: ["debugging", "devtools", "resolução de problemas"],
      },
      {
        id: "n4-06",
        title: "Certificação ISTQB Avançado (CTAL-TA)",
        description: "Preparação para o nível avançado de automação de testes da ISTQB.",
        type: "certificacao",
        estimatedHours: 60,
        tags: ["certificação", "istqb", "avançado"],
        resources: [
          { label: "ISTQB CTAL-TA", url: "https://www.istqb.org/certifications/test-automation-engineer" },
        ],
      },
    ],
  },
];

export const totalTrailTopics = trailLevels.reduce((acc, level) => acc + level.topics.length, 0);

export const typeLabels: Record<TrailTopic["type"], string> = {
  teoria: "Teoria",
  pratica: "Prática",
  ferramenta: "Ferramenta",
  certificacao: "Certificação",
};

export const typeColors: Record<TrailTopic["type"], string> = {
  teoria: "#2563eb",
  pratica: "#059669",
  ferramenta: "#7c3aed",
  certificacao: "#d97706",
};
