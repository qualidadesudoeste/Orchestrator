import { useState } from "react";
import { phases, totalItems } from "@/data/qaData";
import { X, Maximize2, Minimize2, CheckCircle2, Circle, ChevronRight } from "lucide-react";

interface ChecklistViewModalProps {
  sprintName: string;
  projectName: string;
  clientName: string;
  analystName: string;
  checkedItems: string; // JSON string
  completedItems: number;
  status: string;
  startedAt: Date | string;
  onClose: () => void;
}

export function ChecklistViewModal({
  sprintName, projectName, clientName, analystName,
  checkedItems, completedItems, status, startedAt, onClose
}: ChecklistViewModalProps) {
  const [maximized, setMaximized] = useState(false);
  const [activePhase, setActivePhase] = useState("fase1");

  let checked: Record<string, boolean> = {};
  try { checked = JSON.parse(checkedItems); } catch { /* ignore */ }

  const globalProgress = totalItems > 0 ? Math.round((completedItems / totalItems) * 100) : 0;
  const isCompleted = status === "completed";

  const phaseProgress = phases.map(phase => {
    const items = phase.steps.flatMap(s => s.items);
    const done = items.filter(i => checked[i.id]).length;
    return { phaseId: phase.id, checked: done, total: items.length, percent: items.length > 0 ? Math.round((done / items.length) * 100) : 0 };
  });

  const activePhaseData = phases.find(p => p.id === activePhase);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div
        className="flex flex-col overflow-hidden shadow-2xl"
        style={{
          background: "oklch(0.975 0.006 80)",
          borderRadius: maximized ? "0" : "1rem",
          width: maximized ? "100vw" : "min(900px, 95vw)",
          height: maximized ? "100vh" : "min(680px, 92vh)",
          transition: "all 0.2s cubic-bezier(0.23,1,0.32,1)",
        }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 px-5 py-3 border-b flex-shrink-0" style={{ background: "oklch(0.13 0.015 260)", borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="flex items-center gap-1.5 text-xs flex-1 min-w-0" style={{ color: "oklch(0.55 0.01 260)" }}>
            <span className="font-medium" style={{ color: "oklch(0.75 0.15 264)" }}>{clientName}</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            <span>{projectName}</span>
            <ChevronRight className="w-3 h-3 flex-shrink-0" />
            <span className="text-white font-semibold">{sprintName}</span>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <span className="text-xs px-2 py-0.5 rounded-full font-semibold" style={{
              background: isCompleted ? "oklch(0.20 0.08 145)" : "oklch(0.20 0.05 264)",
              color: isCompleted ? "oklch(0.65 0.18 145)" : "oklch(0.75 0.15 264)"
            }}>
              {isCompleted ? "Concluído" : "Em andamento"} — {globalProgress}%
            </span>
            <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: "oklch(0.22 0.015 260)", color: "oklch(0.55 0.01 260)" }}>
              👁 Visualização — {analystName}
            </span>
            <button onClick={() => setMaximized(m => !m)} className="p-1.5 rounded-lg transition-colors" style={{ color: "oklch(0.55 0.01 260)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.22 0.015 260)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
            <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: "oklch(0.55 0.01 260)" }}
              onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.22 0.015 260)")}
              onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Sidebar de fases */}
          <aside className="w-52 flex-shrink-0 flex flex-col border-r overflow-y-auto" style={{ background: "oklch(0.15 0.015 260)", borderColor: "oklch(0.22 0.015 260)" }}>
            <div className="px-4 pt-4 pb-2">
              <p className="text-xs font-bold uppercase tracking-wider mb-3" style={{ color: "oklch(0.38 0.01 260)" }}>Fases</p>
              {/* Progresso global */}
              <div className="mb-4 p-3 rounded-xl" style={{ background: "oklch(0.13 0.015 260)" }}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-xs font-semibold text-white">Progresso</span>
                  <span className="text-xs font-bold tabular-nums" style={{ color: isCompleted ? "oklch(0.65 0.18 145)" : "oklch(0.75 0.15 264)" }}>{globalProgress}%</span>
                </div>
                <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.22 0.015 260)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${globalProgress}%`, background: isCompleted ? "oklch(0.55 0.18 145)" : "oklch(0.55 0.18 264)" }} />
                </div>
                <p className="text-xs mt-1.5" style={{ color: "oklch(0.40 0.01 260)" }}>
                  {completedItems}/{totalItems} itens
                </p>
              </div>
            </div>
            {/* Lista de fases */}
            <div className="px-2 pb-4 space-y-0.5">
              {phases.map((phase, idx) => {
                const pp = phaseProgress[idx];
                const isActive = activePhase === phase.id;
                return (
                  <button key={phase.id} onClick={() => setActivePhase(phase.id)}
                    className="w-full text-left px-3 py-2.5 rounded-lg transition-all"
                    style={{ background: isActive ? phase.color + "22" : "transparent", borderLeft: isActive ? `3px solid ${phase.color}` : "3px solid transparent" }}>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-bold" style={{ color: isActive ? phase.color : "oklch(0.55 0.01 260)" }}>
                        {String(phase.id).padStart(2, "0")}
                      </span>
                      <span className="text-xs font-medium truncate" style={{ color: isActive ? "white" : "oklch(0.55 0.01 260)" }}>{phase.title}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1 rounded-full overflow-hidden" style={{ background: "oklch(0.22 0.015 260)" }}>
                        <div className="h-full rounded-full" style={{ width: `${pp?.percent ?? 0}%`, background: phase.color }} />
                      </div>
                      <span className="text-xs tabular-nums" style={{ color: "oklch(0.40 0.01 260)" }}>{pp?.percent ?? 0}%</span>
                    </div>
                  </button>
                );
              })}
            </div>
            {/* Data de início */}
            <div className="px-4 py-3 border-t mt-auto" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
              <p className="text-xs" style={{ color: "oklch(0.38 0.01 260)" }}>Iniciado em</p>
              <p className="text-xs font-medium text-white">{new Date(startedAt).toLocaleDateString("pt-BR")}</p>
            </div>
          </aside>

          {/* Conteúdo da fase */}
          <main className="flex-1 overflow-y-auto p-5">
            {activePhaseData && (
              <>
                <div className="flex items-center gap-3 mb-5">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ background: activePhaseData.color }}>
                    {activePhaseData.id}
                  </div>
                  <div>
                    <h2 className="font-bold text-gray-900 text-base">{activePhaseData.title}</h2>
                    <p className="text-xs text-gray-500">{activePhaseData.subtitle}</p>
                  </div>
                  {/* Badge somente leitura */}
                  <span className="ml-auto text-xs px-2 py-1 rounded-full font-medium" style={{ background: "oklch(0.93 0.02 80)", color: "oklch(0.45 0.02 80)" }}>
                    🔒 Somente leitura
                  </span>
                </div>
                <div className="space-y-4">
                  {activePhaseData.steps.map(step => (
                    <div key={step.id} className="rounded-xl border overflow-hidden" style={{ borderColor: activePhaseData.color + "44" }}>
                      <div className="px-4 py-2.5 flex items-center gap-2" style={{ background: activePhaseData.color + "15" }}>
                        <span className="text-xs font-bold" style={{ color: activePhaseData.color }}>{step.id}</span>
                        <span className="text-sm font-semibold text-gray-800">{step.title}</span>
                      </div>
                      <div className="divide-y" >
                        {step.items.map(item => {
                          const isDone = !!checked[item.id];
                          return (
                            <div key={item.id} className="flex items-start gap-3 px-4 py-3"
                              style={{ background: isDone ? "oklch(0.97 0.01 145)" : "white", opacity: 1 }}>
                              {isDone
                                ? <CheckCircle2 className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.50 0.18 145)" }} />
                                : <Circle className="w-4 h-4 mt-0.5 flex-shrink-0" style={{ color: "oklch(0.75 0.01 260)" }} />
                              }
                              <div className="flex-1 min-w-0">
                                <p className="text-sm" style={{ color: isDone ? "oklch(0.35 0.01 145)" : "oklch(0.25 0.01 260)", textDecoration: isDone ? "line-through" : "none" }}>
                                  {item.text}
                                </p>
                                {item.tags && item.tags.length > 0 && (
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {item.tags.map((tag: string) => (
                                      <span key={tag} className="text-xs px-1.5 py-0.5 rounded font-medium"
                                        style={{ background: "oklch(0.92 0.02 264)", color: "oklch(0.40 0.12 264)" }}>
                                        {tag}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
