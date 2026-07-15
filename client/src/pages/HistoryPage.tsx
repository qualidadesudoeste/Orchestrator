import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, CheckCircle2, Clock } from "lucide-react";
import { totalItems } from "@/data/qaData";

export default function HistoryPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { data: history } = trpc.checklists.myHistory.useQuery(undefined, { enabled: isAuthenticated });
  const { data: sprints } = trpc.sprints.list.useQuery({ projectId: undefined }, { enabled: isAuthenticated });

  const sprintMap = Object.fromEntries((sprints ?? []).map(s => [s.id, s.name]));

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.975 0.006 80)" }}>
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur-sm" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
        <div className="container flex items-center gap-3 h-14">
          <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar</button>
          <span className="text-gray-300">|</span>
          <h1 className="font-bold text-sm">Meu Histórico de Checklists</h1>
        </div>
      </header>
      <main className="container py-8 max-w-2xl">
        {history?.length === 0 && <p className="text-sm text-center text-gray-400 py-12">Nenhum checklist executado ainda.</p>}
        <div className="space-y-3">
          {history?.map(item => {
            const progress = totalItems > 0 ? Math.round((item.completedItems / totalItems) * 100) : 0;
            const isCompleted = item.status === "completed";
            return (
              <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => navigate(`/checklist/${item.sprintId}`)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: isCompleted ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)", opacity: 0.15 + 0.85 }}>
                        {isCompleted ? <CheckCircle2 className="w-4 h-4 text-white" style={{ color: "oklch(0.50 0.18 145)" }} /> : <Clock className="w-4 h-4" style={{ color: "oklch(0.55 0.18 264)" }} />}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{sprintMap[item.sprintId] ?? `Sprint #${item.sprintId}`}</p>
                        <p className="text-xs text-gray-400">{new Date(item.startedAt).toLocaleDateString("pt-BR")} · {item.completedItems}/{totalItems} itens</p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-lg font-bold tabular-nums" style={{ color: isCompleted ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)" }}>{progress}%</div>
                      <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: isCompleted ? "oklch(0.50 0.18 145)22" : "oklch(0.55 0.18 264)22", color: isCompleted ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)" }}>
                        {isCompleted ? "Concluído" : "Em andamento"}
                      </span>
                    </div>
                  </div>
                  <div className="h-1.5 rounded-full mt-3 overflow-hidden" style={{ background: "oklch(0.88 0.008 80)" }}>
                    <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: isCompleted ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)" }} />
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </div>
  );
}
