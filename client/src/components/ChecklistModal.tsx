import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { phases, totalItems } from "@/data/qaData";
import { ChevronRight, ClipboardCheck, X, FolderOpen, ExternalLink } from "lucide-react";
import { Maximize2, Minimize2 } from "lucide-react";

type CheckedMap = Record<string, boolean>;

export interface ChecklistModalProps {
  sprintId: number;
  sprintName: string;
  projectName: string;
  clientName: string;
  onClose: () => void;
}

export function ChecklistModal({ sprintId, sprintName, projectName, clientName, onClose }: ChecklistModalProps) {
  const { isAuthenticated } = useAuth();
  const [checked, setChecked] = useState<CheckedMap>({});
  const [activePhase, setActivePhase] = useState(phases[0].id);
  const [maximized, setMaximized] = useState(false);

  const { data: existing } = trpc.checklists.get.useQuery(
    { sprintId }, { enabled: isAuthenticated && sprintId > 0 }
  );
  const saveMutation = trpc.checklists.save.useMutation();
  const utils = trpc.useUtils();

  useEffect(() => {
    if (existing?.checkedItems) {
      try { setChecked(JSON.parse(existing.checkedItems)); } catch { /* ignore */ }
    }
  }, [existing]);

  const completedCount = Object.values(checked).filter(Boolean).length;
  const globalProgress = totalItems > 0 ? Math.round((completedCount / totalItems) * 100) : 0;

  const toggle = useCallback((id: string) => {
    setChecked(prev => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const save = useCallback(async () => {
    const isCompleted = completedCount === totalItems;
    await saveMutation.mutateAsync({
      sprintId,
      checkedItems: JSON.stringify(checked),
      totalItems,
      completedItems: completedCount,
      status: isCompleted ? "completed" : "in_progress",
      completedAt: isCompleted ? new Date() : null,
    });
    utils.checklists.myHistory.invalidate();
    utils.checklists.allHistory.invalidate();
    toast.success("Progresso salvo!");
  }, [checked, completedCount, sprintId, saveMutation, utils]);

  const phaseProgress = phases.map(phase => {
    const items = phase.steps.flatMap(s => s.items);
    const done = items.filter(i => checked[i.id]).length;
    return { phaseId: phase.id, checked: done, total: items.length, percent: items.length > 0 ? Math.round((done / items.length) * 100) : 0 };
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" style={{ background: "rgba(0,0,0,0.72)", backdropFilter: "blur(4px)" }}>
      <div
        className="flex overflow-hidden transition-all duration-300"
        style={{
          background: "oklch(0.975 0.006 80)",
          width: maximized ? "100vw" : "min(92vw, 1100px)",
          height: maximized ? "100vh" : "min(90vh, 820px)",
          borderRadius: maximized ? "0" : "16px",
          boxShadow: maximized ? "none" : "0 24px 80px rgba(0,0,0,0.35)",
        }}
      >
        {/* Sidebar de fases */}
        <aside className="w-64 flex flex-col flex-shrink-0 h-full" style={{ background: "oklch(0.13 0.015 260)" }}>
          {/* Contexto */}
          <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
            {/* Breadcrumb de contexto */}
            <div className="space-y-1 mb-3">
              <div className="flex items-center gap-1.5 text-xs" style={{ color: "oklch(0.45 0.01 260)" }}>
                <FolderOpen className="w-3 h-3" />
                <span className="truncate">{clientName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs pl-1" style={{ color: "oklch(0.50 0.01 260)" }}>
                <ChevronRight className="w-3 h-3" />
                <span className="truncate">{projectName}</span>
              </div>
              <div className="flex items-center gap-1.5 text-xs pl-2" style={{ color: "white" }}>
                <ChevronRight className="w-3 h-3" style={{ color: "oklch(0.55 0.18 264)" }} />
                <span className="font-semibold truncate">{sprintName}</span>
              </div>
            </div>
            {/* Progresso geral */}
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs mb-1">
                <span style={{ color: "oklch(0.6 0.01 260)" }}>Progresso Geral</span>
                <span className="font-bold text-white">{globalProgress}%</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.22 0.015 260)" }}>
                <div className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${globalProgress}%`, background: globalProgress === 100 ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)" }} />
              </div>
              <div className="text-xs mt-1" style={{ color: "oklch(0.5 0.01 260)" }}>{completedCount} de {totalItems} itens</div>
            </div>
          </div>
          {/* Fases */}
          <nav className="flex-1 overflow-y-auto py-2">
            {phases.map(phase => {
              const prog = phaseProgress.find(p => p.phaseId === phase.id)!;
              const isActive = activePhase === phase.id;
              return (
                <button key={phase.id}
                  onClick={() => { setActivePhase(phase.id); document.getElementById(`modal-phase-${phase.id}`)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
                  className="w-full text-left px-4 py-3 transition-all"
                  style={{ background: isActive ? `${phase.color}22` : "transparent", borderLeft: isActive ? `3px solid ${phase.color}` : "3px solid transparent" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{phase.icon}</span>
                      <div>
                        <div className="text-xs font-bold uppercase" style={{ color: isActive ? phase.color : "oklch(0.5 0.01 260)" }}>Fase {phase.number}</div>
                        <div className="text-xs truncate" style={{ color: isActive ? "white" : "oklch(0.6 0.01 260)", maxWidth: "140px" }}>{phase.title}</div>
                      </div>
                    </div>
                    {prog.checked > 0 && <span className="text-xs font-bold" style={{ color: phase.color }}>{prog.percent}%</span>}
                  </div>
                  {prog.total > 0 && (
                    <div className="h-0.5 rounded-full mt-2 overflow-hidden" style={{ background: "oklch(0.22 0.015 260)" }}>
                      <div className="h-full transition-all" style={{ width: `${prog.percent}%`, background: phase.color }} />
                    </div>
                  )}
                </button>
              );
            })}
          </nav>
          {/* Ações */}
          <div className="p-4 border-t space-y-2" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
            <Button onClick={save} disabled={saveMutation.isPending} className="w-full h-8 text-xs font-semibold" style={{ background: "oklch(0.50 0.20 264)" }}>
              {saveMutation.isPending ? "Salvando..." : "Salvar Progresso"}
            </Button>
            <button onClick={() => { setChecked({}); toast.success("Sprint resetada!"); }}
              className="w-full py-1.5 text-xs rounded transition-colors" style={{ background: "oklch(0.22 0.015 260)", color: "oklch(0.6 0.01 260)" }}>
              ↺ Resetar Sprint
            </button>
          </div>
        </aside>

        {/* Conteúdo do checklist */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header do modal */}
          <header className="flex items-center justify-between px-8 py-3 border-b bg-white/95 backdrop-blur-sm flex-shrink-0" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
            <div>
              <div className="flex items-center gap-2 text-xs mb-0.5" style={{ color: "oklch(0.55 0.01 260)" }}>
                <span>{clientName}</span>
                <ChevronRight className="w-3 h-3" />
                <span>{projectName}</span>
                <ChevronRight className="w-3 h-3" />
                <span className="font-semibold" style={{ color: "oklch(0.15 0.01 260)" }}>{sprintName}</span>
              </div>
              <h1 className="text-base font-extrabold flex items-center gap-2" style={{ color: "oklch(0.15 0.01 260)", letterSpacing: "-0.01em" }}>
                <ClipboardCheck className="w-4 h-4" style={{ color: "oklch(0.50 0.20 264)" }} />
                Checklist de Testes QA
              </h1>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-2">
                <div className="w-28 h-2 rounded-full overflow-hidden" style={{ background: "oklch(0.88 0.008 80)" }}>
                  <div className="h-full rounded-full transition-all" style={{ width: `${globalProgress}%`, background: globalProgress === 100 ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)" }} />
                </div>
                <span className="text-sm font-bold tabular-nums" style={{ color: globalProgress === 100 ? "oklch(0.40 0.18 145)" : "oklch(0.40 0.18 264)" }}>{globalProgress}%</span>
              </div>
              <button onClick={() => setMaximized(m => !m)} className="p-1.5 rounded-lg transition-colors" title={maximized ? "Restaurar" : "Maximizar"}
                style={{ color: "oklch(0.50 0.01 260)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.92 0.008 80)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                {maximized ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
              </button>
              <button onClick={onClose} className="p-1.5 rounded-lg transition-colors" style={{ color: "oklch(0.50 0.01 260)" }}
                onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.92 0.008 80)")}
                onMouseLeave={e => (e.currentTarget.style.background = "transparent")}>
                <X className="w-4 h-4" />
              </button>
            </div>
          </header>

          {/* Fases e itens */}
          <div className="flex-1 overflow-y-auto px-8 py-6 space-y-10">
            {phases.map(phase => (
              <section key={phase.id} id={`modal-phase-${phase.id}`}>
                <div className="flex items-center gap-3 mb-4">
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-base" style={{ background: `${phase.color}22` }}>{phase.icon}</div>
                  <div>
                    <div className="text-xs font-bold uppercase tracking-wider" style={{ color: phase.color }}>Fase {phase.number}</div>
                    <h2 className="font-extrabold text-sm" style={{ color: "oklch(0.15 0.01 260)" }}>{phase.title}</h2>
                  </div>
                </div>
                {phase.steps.map(step => (
                  <div key={step.id} className="mb-4">
                    <div className="text-xs font-bold uppercase tracking-wider mb-2 px-1" style={{ color: "oklch(0.50 0.01 260)" }}>{step.title}</div>
                    <div className="space-y-1.5">
                      {step.items.map(item => {
                        const isChecked = !!checked[item.id];
                        return (
                          <button key={item.id} onClick={() => toggle(item.id)}
                            className="w-full text-left flex items-start gap-3 p-3 rounded-xl border transition-all"
                            style={{
                              background: isChecked ? `${phase.color}0d` : "white",
                              borderColor: isChecked ? `${phase.color}44` : "oklch(0.90 0.008 80)",
                              borderLeft: `3px solid ${isChecked ? phase.color : "oklch(0.90 0.008 80)"}`,
                            }}>
                            <div className="w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 mt-0.5 transition-all"
                              style={{ background: isChecked ? phase.color : "transparent", borderColor: isChecked ? phase.color : "oklch(0.75 0.01 260)" }}>
                              {isChecked && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-medium leading-relaxed" style={{ color: isChecked ? "oklch(0.45 0.01 260)" : "oklch(0.20 0.01 260)", textDecoration: isChecked ? "line-through" : "none" }}>
                                {item.text}
                              </p>
                              {item.link && (
                                <a href={item.link.url} target="_blank" rel="noopener noreferrer"
                                  onClick={e => e.stopPropagation()}
                                  className="inline-flex items-center gap-1 mt-1 text-xs font-medium"
                                  style={{ color: "oklch(0.50 0.18 264)" }}>
                                  <ExternalLink className="w-3 h-3" /> {item.link.label}
                                </a>
                              )}
                              {item.tags && item.tags.length > 0 && (
                                <div className="flex flex-wrap gap-1 mt-1.5">
                                  {item.tags.map(tag => (
                                    <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full font-medium"
                                      style={{ background: `${phase.color}18`, color: phase.color }}>
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </section>
            ))}
            <div className="pb-8 pt-2 border-t text-center text-xs" style={{ borderColor: "oklch(0.88 0.008 80)", color: "oklch(0.65 0.01 260)" }}>
              Guia Interativo de QA · Procedimento Operacional Padrão
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
