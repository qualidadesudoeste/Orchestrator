import { useState, useEffect, useRef } from "react";
import { phases, totalItems } from "@/data/qaData";
import { useChecklist } from "@/hooks/useChecklist";
import { Sidebar } from "@/components/Sidebar";
import { PhaseSection } from "@/components/PhaseSection";
import { toast } from "sonner";

export default function Home() {
  const { checked, toggle, reset, globalProgress, checkedCount, phaseProgress } = useChecklist();
  const [activePhase, setActivePhase] = useState(phases[0].id);
  const mainRef = useRef<HTMLDivElement>(null);

  // Scroll to phase when selected from sidebar
  const handleSelectPhase = (id: string) => {
    setActivePhase(id);
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  // Update active phase on scroll
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            setActivePhase(entry.target.id);
          }
        });
      },
      { rootMargin: "-30% 0px -60% 0px" }
    );
    phases.forEach((phase) => {
      const el = document.getElementById(phase.id);
      if (el) observer.observe(el);
    });
    return () => observer.disconnect();
  }, []);

  const handleReset = () => {
    reset();
    toast.success("Sprint resetada! Todos os itens foram desmarcados.");
  };

  return (
    <div className="min-h-screen flex" style={{ background: "oklch(0.975 0.006 80)" }}>
      {/* Sidebar */}
      <Sidebar
        activePhase={activePhase}
        onSelectPhase={handleSelectPhase}
        phaseProgress={phaseProgress}
        globalProgress={globalProgress}
        checkedCount={checkedCount}
        totalItems={totalItems}
        onReset={handleReset}
      />

      {/* Main content */}
      <div className="flex-1 ml-72 flex flex-col min-h-screen">
        {/* Top header */}
        <header
          className="sticky top-0 z-10 border-b px-8 py-4 flex items-center justify-between"
          style={{ background: "rgba(247,246,242,0.96)", backdropFilter: "blur(12px)", borderColor: "oklch(0.82 0.01 80)", borderBottom: "2px solid oklch(0.82 0.01 80)" }}
        >
          <div>
            <h1
              className="text-xl font-extrabold leading-tight tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", color: "#1A1A1A", letterSpacing: "-0.01em" }}
            >
              Procedimento Detalhado de Testes QA
            </h1>
            <p className="text-xs text-gray-500 mt-0.5">
              Versão Consolidada · Equipe de Quality Assurance
            </p>
          </div>

          {/* Global progress pill */}
          <div className="flex items-center gap-3">
            <div className="text-right">
              <div className="text-xs text-gray-500">Progresso</div>
              <div
                className="text-2xl font-extrabold tabular-nums"
                style={{ fontFamily: "Syne, sans-serif", color: globalProgress === 100 ? "#059669" : "#1D4ED8" }}
              >
                {globalProgress}%
              </div>
            </div>
            <div className="w-40 h-3 overflow-hidden bg-gray-200">
              <div
                className="h-full transition-all duration-700"
                style={{
                  width: `${globalProgress}%`,
                  background: globalProgress === 100 ? "#059669" : "#1D4ED8",
                }}
              />
            </div>
          </div>
        </header>

        {/* Hero banner */}
        <div
          className="relative px-8 py-10 overflow-hidden"
          style={{
            background: "linear-gradient(135deg, oklch(0.13 0.015 260) 0%, oklch(0.18 0.04 264) 100%)",
          }}
        >
          <img
            src="/manus-storage/qa-hero-bg_dc7ab739.png"
            alt=""
            className="absolute inset-0 w-full h-full object-cover opacity-10 mix-blend-overlay"
          />
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 mb-3">
              {phases.map((phase) => (
                <div
                  key={phase.id}
                  className="w-3 h-3"
                  style={{ background: phase.color }}
                />
              ))}
            </div>
            <h2
              className="text-4xl font-extrabold text-white leading-tight tracking-tight"
              style={{ fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: "-0.02em", lineHeight: "1.15" }}
            >
              Cada sprint testada com método.<br />
              <span style={{ color: "oklch(0.75 0.15 264)" }}>Cada bug registrado com rastreabilidade.</span>
            </h2>
            <p className="text-sm mt-3" style={{ color: "oklch(0.65 0.01 260)" }}>
              Siga o checklist fase a fase. Marque cada item conforme executa. O progresso é salvo automaticamente.
            </p>
            <div className="flex items-center gap-4 mt-5">
              {phases.map((phase) => {
                const prog = phaseProgress.find((p) => p.phaseId === phase.id);
                return (
                  <button
                    key={phase.id}
                    onClick={() => handleSelectPhase(phase.id)}
                    className="flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-full transition-all hover:opacity-80 active:scale-95"
                    style={{ background: `${phase.color}33`, color: phase.color, border: `1px solid ${phase.color}44` }}
                  >
                    <span>{phase.icon}</span>
                    <span>Fase {phase.number}</span>
                    {prog && prog.percent === 100 && <span>✓</span>}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Phases content */}
        <main ref={mainRef} className="flex-1 px-8 py-8 space-y-14 max-w-3xl">
          {phases.map((phase) => {
            const prog = phaseProgress.find((p) => p.phaseId === phase.id)!;
            return (
              <PhaseSection
                key={phase.id}
                phase={phase}
                checked={checked}
                onToggle={toggle}
                phaseProgress={prog}
                isActive={activePhase === phase.id}
              />
            );
          })}

          {/* Footer */}
          <div className="pb-12 pt-4 border-t" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
            <p className="text-xs text-gray-400 text-center">
              Guia Interativo de QA · Procedimento Operacional Padrão
            </p>
          </div>
        </main>
      </div>
    </div>
  );
}
