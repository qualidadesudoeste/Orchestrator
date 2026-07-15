# Guia Interativo de QA — Design Ideas

## Abordagens Consideradas

### Opção A — "Terminal Precision" (prob: 0.04)
Estética de terminal/código, fundo escuro, fontes mono, verde neon. Muito técnico, pode afastar usuários não-devs.

### Opção B — "Blueprint Engineering" (prob: 0.07)
Azul escuro tipo blueprint de engenharia, linhas de grade, tipografia técnica. Sólido mas genérico demais.

### Opção C — "Operational Command" (prob: 0.06)
Fundo off-white quente, tipografia expressiva, sidebar fixa com navegação por fases, elementos de progresso visuais fortes.

---

## Design Escolhido: **"Operational Command"**

### Design Movement
Functional Brutalism com toque editorial — clareza operacional acima de tudo, sem ornamentos desnecessários.

### Core Principles
1. **Clareza hierárquica:** cada fase tem identidade visual própria com cor de acento distinta.
2. **Progresso visível:** barra de progresso global e por fase, sempre em destaque.
3. **Densidade informacional controlada:** muito conteúdo, mas nunca sufocante — espaçamento generoso.
4. **Ação imediata:** checkboxes grandes, feedback visual instantâneo ao marcar.

### Color Philosophy
- Fundo: `#F7F6F2` (off-white quente, não cansativo)
- Texto principal: `#1A1A1A` (quase preto, não puro)
- Acento primário: `#1D4ED8` (azul cobalto — confiança, precisão)
- Fase 1: `#7C3AED` (violeta — análise/inteligência)
- Fase 2: `#0891B2` (ciano — planejamento/estratégia)
- Fase 3: `#DC2626` (vermelho — execução/urgência)
- Fase 4: `#059669` (verde — validação/aprovação)
- Fase 5: `#D97706` (âmbar — encerramento/melhoria)

### Layout Paradigm
Sidebar fixa à esquerda com navegação por fases + área de conteúdo principal com scroll. Header fixo com barra de progresso global. Layout assimétrico 280px + 1fr.

### Signature Elements
1. Numeração de passos com círculos coloridos por fase
2. Barra de progresso animada no topo
3. Cards de ferramentas com links diretos (SIG, Gerador de Plano, Criador de Cards)

### Typography System
- Display/Títulos: `Syne` (bold, geométrico, forte)
- Corpo: `Inter` (legível, profissional)
- Código: `JetBrains Mono` (para comandos técnicos como o codegen)

### Brand Essence
"O manual de operações do QA moderno — preciso, ágil e sem desculpas."
Personalidade: **Preciso. Ágil. Confiável.**

### Brand Voice
- Headline: "Cada sprint testada com método. Cada bug registrado com rastreabilidade."
- CTA: "Iniciar ciclo de testes"

## Style Decisions
- Checkboxes marcados mudam o card para estado "concluído" com fundo levemente colorido e texto riscado suave
- Progresso por fase mostrado como "X/Y passos concluídos"
- Botão "Resetar Sprint" para limpar todos os checks
- Links para ferramentas externas abrem em nova aba com ícone de link externo
