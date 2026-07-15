import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { phases, totalItems } from "@/data/qaData";
import { useState, useEffect, useCallback } from "react";
import { useLocation, useParams } from "wouter";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ArrowLeft, CheckSquare, ExternalLink } from "lucide-react";

type CheckedMap = Record<string, boolean>;

export default function ChecklistPage() {
  const { sprintId: sprintIdStr } = useParams<{ sprintId: string }>();
  const sprintId = parseInt(sprintIdStr ?? "0", 10);
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();

  const [checked, setChecked] = useState<CheckedMap>({});
  const [activePhase, setActivePhase] = useState(phases[0].id);

  const { data: sprint } = trpc.sprints.list.useQuery({ projectId: undefined });
  const currentSprint = sprint?.find(s => s.id === sprintId);

  const { data: existing } = trpc.checklists.get.useQuery({ sprintId }, { enabled: isAuthenticated && sprintId > 0 });
  const saveMutation = trpc.checklists.save.useMutation();

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
    toast.success("Progresso salvo com sucesso!");
  }, [checked, completedCount, sprintId, saveMutation]);

  const phaseProgress = phases.map(phase => {
    const phaseItems = phase.steps.flatMap(s => s.items);
    const done = phaseItems.filter(i => checked[i.id]).length;
    return { phaseId: phase.id, checked: done, total: phaseItems.length, percent: phaseItems.length > 0 ? Math.round((done / phaseItems.length) * 100) : 0 };
  });

  if (!isAuthenticated) return null;

  return (
    <div className="min-h-screen flex" style={{ background: "oklch(0.975 0.006 80)" }}>
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col z-20" style={{ background: "oklch(0.13 0.015 260)" }}>
        <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
          <button onClick={() => navigate("/")} className="flex items-center gap-2 text-white/60 hover:text-white text-xs mb-4 transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Voltar
          </button>
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.50 0.20 264)" }}>
              <CheckSquare className="w-3.5 h-3.5 text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-xs">Guia de QA</div>
              <div className="text-xs" style={{ color: "oklch(0.6 0.01 260)" }}>Checklist Operacional</div>
            </div>
          </div>
          <div className="mt-3">
            <div className="flex items-center justify-between text-xs mb-1">
              <span style={{ color: "oklch(0.6 0.01 260)" }}>Progresso Geral</span>
              <span className="font-bold text-white">{globalProgress}%</span>
            </div>
            <div className="h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.22 0.015 260)" }}>
              <div className="h-full rounded-full transition-all duration-500" style={{ width: `${globalProgress}%`, background: globalProgress === 100 ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)" }} />
            </div>
            <div className="text-xs mt-1" style={{ color: "oklch(0.5 0.01 260)" }}>{completedCount} de {totalItems} itens</div>
          </div>
        </div>
        <nav className="flex-1 overflow-y-auto py-2">
          {phases.map(phase => {
            const prog = phaseProgress.find(p => p.phaseId === phase.id)!;
            const isActive = activePhase === phase.id;
            return (
              <button key={phase.id} onClick={() => { setActivePhase(phase.id); document.getElementById(phase.id)?.scrollIntoView({ behavior: "smooth", block: "start" }); }}
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

      {/* Main */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {/* Top header */}
        <header className="sticky top-0 z-10 border-b px-8 py-3 flex items-center justify-between bg-white/95 backdrop-blur-sm" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
          <div>
            <h1 className="text-base font-extrabold" style={{ color: "oklch(0.15 0.01 260)", letterSpacing: "-0.01em" }}>
              {currentSprint?.name ?? "Checklist de Testes QA"}
            </h1>
            <p className="text-xs" style={{ color: "oklch(0.50 0.01 260)" }}>
              {user?.name} · {currentSprint?.description ?? "Procedimento Operacional"}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs" style={{ color: "oklch(0.50 0.01 260)" }}>Progresso</div>
              <div className="text-2xl font-extrabold tabular-nums" style={{ color: globalProgress === 100 ? "oklch(0.50 0.18 145)" : "oklch(0.50 0.20 264)" }}>{globalProgress}%</div>
            </div>
            <div className="w-32 h-2.5 rounded-full overflow-hidden" style={{ background: "oklch(0.88 0.008 80)" }}>
              <div className="h-full rounded-full transition-all duration-700" style={{ width: `${globalProgress}%`, background: globalProgress === 100 ? "oklch(0.50 0.18 145)" : "oklch(0.50 0.20 264)" }} />
            </div>
          </div>
        </header>

        {/* Hero */}
        <div className="px-8 py-8" style={{ background: "linear-gradient(135deg, oklch(0.13 0.015 260) 0%, oklch(0.18 0.04 264) 100%)" }}>
          <div className="flex gap-1.5 mb-3">
            {phases.map(p => <div key={p.id} className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} />)}
          </div>
          <h2 className="text-3xl font-extrabold text-white leading-tight mb-2" style={{ letterSpacing: "-0.02em" }}>
            Cada sprint testada com método.<br />
            <span style={{ color: "oklch(0.75 0.15 264)" }}>Cada bug registrado com rastreabilidade.</span>
          </h2>
          <p className="text-sm" style={{ color: "oklch(0.65 0.01 260)" }}>Siga o checklist fase a fase. O progresso é salvo no servidor.</p>
        </div>

        {/* Phases */}
        <main className="flex-1 px-8 py-8 space-y-12 max-w-3xl">
          {phases.map(phase => {
            const prog = phaseProgress.find(p => p.phaseId === phase.id)!;
            return (
              <section key={phase.id} id={phase.id}>
                {/* Phase header */}
                <div className="p-5 mb-4" style={{ background: phase.bgLight, borderLeft: `4px solid ${phase.color}`, border: `1px solid ${phase.borderColor}`, borderLeftWidth: "4px" }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl" style={{ background: phase.color }}>
                        {phase.icon}
                      </div>
                      <div>
                        <div className="text-xs font-bold uppercase tracking-wider" style={{ color: phase.color }}>Fase {phase.number}</div>
                        <h2 className="text-lg font-bold" style={{ color: "oklch(0.15 0.01 260)" }}>{phase.title}</h2>
                        <p className="text-xs" style={{ color: "oklch(0.50 0.01 260)" }}>{phase.subtitle}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-2xl font-bold tabular-nums" style={{ color: phase.color }}>{prog.percent}%</div>
                      <div className="text-xs" style={{ color: "oklch(0.50 0.01 260)" }}>{prog.checked}/{prog.total}</div>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: "oklch(0.88 0.008 80)" }}>
                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${prog.percent}%`, background: phase.color }} />
                  </div>
                </div>

                {/* Steps */}
                {phase.steps.map(step => (
                  <div key={step.id} className="mb-6">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ background: phase.color, color: "white" }}>{step.stepNumber ?? step.id}</span>
                      <h3 className="text-sm font-semibold" style={{ color: "oklch(0.25 0.01 260)" }}>{step.title}</h3>
                    </div>
                    <div className="space-y-2">
                      {step.items.map(item => (
                        <div key={item.id} className="flex items-start gap-3 p-3 rounded border cursor-pointer transition-all hover:shadow-sm"
                          style={{ background: checked[item.id] ? `${phase.color}0d` : "white", borderColor: checked[item.id] ? phase.color : "oklch(0.88 0.008 80)", borderLeftWidth: "3px", borderLeftColor: checked[item.id] ? phase.color : "oklch(0.88 0.008 80)" }}
                          onClick={() => toggle(item.id)}>
                          <div className="w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 mt-0.5 transition-all"
                            style={{ borderColor: checked[item.id] ? phase.color : "oklch(0.75 0.01 260)", background: checked[item.id] ? phase.color : "transparent" }}>
                            {checked[item.id] && <svg className="w-2.5 h-2.5 text-white" fill="none" viewBox="0 0 12 12"><path d="M2 6l3 3 5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium leading-snug" style={{ color: checked[item.id] ? "oklch(0.50 0.01 260)" : "oklch(0.20 0.01 260)", textDecoration: checked[item.id] ? "line-through" : "none" }}>
                              {item.text}
                            </p>
                            {item.detail && <p className="text-xs mt-0.5" style={{ color: "oklch(0.55 0.01 260)" }}>{item.detail}</p>}
                            {item.code && <code className="block text-xs mt-1 px-2 py-1 rounded font-mono" style={{ background: "oklch(0.13 0.015 260)", color: "oklch(0.75 0.15 264)" }}>{item.code}</code>}
                            {(item.tags || item.link) && (
                              <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                                {item.tags?.map(tag => (
                                  <span key={tag} className="text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: `${phase.color}18`, color: phase.color }}>{tag}</span>
                                ))}
                                {item.link && (
                                  <a href={item.link.url} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                                    className="flex items-center gap-1 text-xs font-medium hover:underline" style={{ color: phase.color }}>
                                    <ExternalLink className="w-3 h-3" />{item.link.label}
                                  </a>
                                )}
                              </div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </section>
            );
          })}
          <div className="pb-12 pt-4 border-t text-center text-xs" style={{ borderColor: "oklch(0.88 0.008 80)", color: "oklch(0.60 0.01 260)" }}>
            Guia Interativo de QA · Procedimento Operacional Padrão
          </div>
        </main>
      </div>
    </div>
  );
}
