import { phases } from "@/data/qaData";
import { cn } from "@/lib/utils";

interface SidebarProps {
  activePhase: string;
  onSelectPhase: (id: string) => void;
  phaseProgress: { phaseId: string; total: number; checked: number; percent: number }[];
  globalProgress: number;
  checkedCount: number;
  totalItems: number;
  onReset: () => void;
}

export function Sidebar({
  activePhase,
  onSelectPhase,
  phaseProgress,
  globalProgress,
  checkedCount,
  totalItems,
  onReset,
}: SidebarProps) {
  return (
    <aside className="fixed left-0 top-0 h-screen w-72 flex flex-col z-20 overflow-hidden"
      style={{ background: "oklch(0.13 0.015 260)" }}>
      {/* Logo area */}
      <div className="px-6 pt-6 pb-4 border-b" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
        <div className="flex items-center gap-3 mb-4">
          <img
            src="/manus-storage/qa-logo_f79c34a2.png"
            alt="QA Logo"
            className="w-9 h-9 object-contain"
          />
          <div>
          <div className="text-white font-bold text-sm leading-tight" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
              Guia de QA
            </div>
            <div className="text-xs" style={{ color: "oklch(0.6 0.01 260)" }}>
              Procedimento Operacional
            </div>
          </div>
        </div>
        {/* Global progress */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center">
            <span className="text-xs font-medium" style={{ color: "oklch(0.7 0.01 260)" }}>
              Progresso Geral
            </span>
            <span className="text-xs font-bold text-white">{globalProgress}%</span>
          </div>
          <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.22 0.015 260)" }}>
            <div
              className="h-full rounded-full transition-all duration-500"
              style={{ width: `${globalProgress}%`, background: "oklch(0.65 0.18 264)" }}
            />
          </div>
          <div className="text-xs" style={{ color: "oklch(0.55 0.01 260)" }}>
            {checkedCount} de {totalItems} itens concluídos
          </div>
        </div>
      </div>

      {/* Phase nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
        {phases.map((phase) => {
          const prog = phaseProgress.find((p) => p.phaseId === phase.id);
          const isActive = activePhase === phase.id;
          return (
            <button
              key={phase.id}
              onClick={() => onSelectPhase(phase.id)}
              className={cn(
                "w-full text-left px-3 py-3 rounded-lg transition-all duration-200 group",
                isActive
                  ? "text-white"
                  : "text-gray-400 hover:text-white"
              )}
              style={{
                background: isActive ? `${phase.color}25` : "transparent",
                borderLeft: isActive ? `3px solid ${phase.color}` : "3px solid transparent",
                borderRadius: 0,
              }}
            >
              <div className="flex items-center gap-2.5">
                <span className="text-base leading-none">{phase.icon}</span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-xs font-bold uppercase tracking-wider truncate" style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
                        Fase {phase.number}
                      </span>
                    {prog && prog.checked > 0 && (
                      <span className="text-xs font-bold shrink-0" style={{ color: phase.color }}>
                        {prog.percent}%
                      </span>
                    )}
                  </div>
                  <div className="text-xs truncate opacity-70 mt-0.5">{phase.title}</div>
                  {prog && (
                    <div className="h-1 rounded-full mt-1.5 overflow-hidden" style={{ background: "oklch(0.22 0.015 260)" }}>
                      <div
                        className="h-full rounded-full transition-all duration-500"
                        style={{ width: `${prog.percent}%`, background: phase.color }}
                      />
                    </div>
                  )}
                </div>
              </div>
            </button>
          );
        })}
      </nav>

      {/* Reset button */}
      <div className="px-4 py-4 border-t" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
        <button
          onClick={onReset}
          className="w-full py-2 px-3 rounded-lg text-xs font-medium transition-all duration-200 hover:opacity-80 active:scale-95"
          style={{ background: "oklch(0.22 0.015 260)", color: "oklch(0.6 0.01 260)" }}
        >
          ↺ Resetar Sprint
        </button>
      </div>
    </aside>
  );
}
