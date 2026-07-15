import { cn } from "@/lib/utils";
import type { Phase } from "@/data/qaData";
import { ChecklistItem } from "./ChecklistItem";

interface PhaseSectionProps {
  phase: Phase;
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
  phaseProgress: { total: number; checked: number; percent: number };
  isActive: boolean;
}

export function PhaseSection({ phase, checked, onToggle, phaseProgress, isActive }: PhaseSectionProps) {
  return (
    <section
      id={phase.id}
      className={cn("scroll-mt-6 transition-all duration-300", !isActive && "opacity-60")}
    >
      {/* Phase header */}
      <div
        className="p-5 mb-4"
        style={{ background: phase.bgLight, borderLeft: `4px solid ${phase.color}`, borderTop: `1px solid ${phase.borderColor}`, borderRight: `1px solid ${phase.borderColor}`, borderBottom: `1px solid ${phase.borderColor}` }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 flex items-center justify-center text-xl shrink-0"
              style={{ background: phase.color }}
            >
              {phase.icon}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span
                  className="text-xs font-bold uppercase tracking-widest"
                  style={{ color: phase.color }}
                >
                  Fase {phase.number}
                </span>
              </div>
              <h2
                className="text-2xl font-bold leading-tight mt-0.5"
                style={{ fontFamily: "Syne, sans-serif", color: "#1A1A1A" }}
              >
                {phase.title}
              </h2>
              <p className="text-sm text-gray-500 mt-0.5">{phase.subtitle}</p>
            </div>
          </div>

          {/* Phase progress circle */}
          <div className="shrink-0 text-right">
            <div
              className="text-3xl font-bold tabular-nums"
              style={{ fontFamily: "Syne, sans-serif", color: phase.color }}
            >
              {phaseProgress.percent}%
            </div>
            <div className="text-xs text-gray-400">
              {phaseProgress.checked}/{phaseProgress.total}
            </div>
          </div>
        </div>

        {/* Phase progress bar */}
        <div className="mt-4 h-2.5 overflow-hidden" style={{ background: "rgba(255,255,255,0.6)", border: "1px solid rgba(0,0,0,0.06)" }}>
          <div
            className="h-full transition-all duration-700"
            style={{ width: `${phaseProgress.percent}%`, background: phase.color }}
          />
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-5">
        {phase.steps.map((step) => (
          <div key={step.id}>
            <div className="flex items-center gap-2 mb-2.5 px-1">
              <div
                className="w-6 h-6 flex items-center justify-center text-xs font-bold text-white shrink-0"
                style={{ background: phase.color }}
              >
                {step.stepNumber}
              </div>
              <h3
                className="text-sm font-semibold"
                style={{ fontFamily: "Syne, sans-serif", color: "#374151" }}
              >
                {step.title}
              </h3>
            </div>
            <div className="space-y-2 pl-1">
              {step.items.map((item) => (
                <ChecklistItem
                  key={item.id}
                  item={item}
                  checked={!!checked[item.id]}
                  onToggle={onToggle}
                  phaseColor={phase.color}
                />
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
