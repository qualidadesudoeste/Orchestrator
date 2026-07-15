import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, CheckCircle2, Clock } from "lucide-react";
import { totalItems } from "@/data/qaData";
import { Button } from "@/components/ui/button";
import AppLayout from "@/components/AppLayout";

export default function CoordinatorPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isCoordinator = user?.role === "admin";

  const { data: allChecklists } = trpc.checklists.allHistory.useQuery(undefined, { enabled: isCoordinator });
  const { data: allUsers } = trpc.users.list.useQuery(undefined, { enabled: isCoordinator });
  const { data: sprints } = trpc.sprints.list.useQuery({ projectId: undefined }, { enabled: isCoordinator });

  if (!isCoordinator) return <div className="p-8 text-center text-sm text-gray-500">Acesso restrito ao Coordenador.</div>;

  const sprintMap = Object.fromEntries((sprints ?? []).map(s => [s.id, s.name]));
  const userMap = Object.fromEntries((allUsers ?? []).map(u => [u.id, u.name ?? u.email ?? `#${u.id}`]));

  const analystIds = Array.from(new Set((allChecklists ?? []).map(c => c.analystId)));

  return (
    <AppLayout>
      <main className="container py-8">
        {/* Summary cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { label: "Analistas Ativos", value: analystIds.length, color: "oklch(0.55 0.18 264)" },
            { label: "Checklists Totais", value: allChecklists?.length ?? 0, color: "oklch(0.50 0.15 45)" },
            { label: "Concluídos", value: allChecklists?.filter(c => c.status === "completed").length ?? 0, color: "oklch(0.50 0.18 145)" },
            { label: "Em Andamento", value: allChecklists?.filter(c => c.status === "in_progress").length ?? 0, color: "oklch(0.55 0.20 25)" },
          ].map((stat, i) => (
            <Card key={i}>
              <CardContent className="p-4">
                <div className="text-2xl font-bold tabular-nums mb-1" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-xs text-gray-500">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Per-analyst breakdown */}
        <h2 className="font-bold text-base mb-4" style={{ color: "oklch(0.15 0.01 260)" }}>Atividade por Analista</h2>
        {analystIds.length === 0 && <p className="text-sm text-gray-400 py-8 text-center">Nenhum checklist registrado ainda.</p>}
        <div className="space-y-4">
          {analystIds.map(analystId => {
            const analystChecklists = (allChecklists ?? []).filter(c => c.analystId === analystId);
            const completed = analystChecklists.filter(c => c.status === "completed").length;
            return (
              <Card key={analystId}>
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm flex items-center gap-2">
                    <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "oklch(0.50 0.20 264)" }}>
                      {(userMap[analystId] ?? "?").charAt(0).toUpperCase()}
                    </div>
                    {userMap[analystId] ?? `Analista #${analystId}`}
                    <span className="ml-auto text-xs font-normal text-gray-400">{completed}/{analystChecklists.length} concluídos</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="space-y-2">
                    {analystChecklists.map(cl => {
                      const progress = totalItems > 0 ? Math.round((cl.completedItems / totalItems) * 100) : 0;
                      const isCompleted = cl.status === "completed";
                      return (
                        <div key={cl.id} className="flex items-center gap-3 p-2 rounded" style={{ background: "oklch(0.97 0.005 80)" }}>
                          {isCompleted ? <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: "oklch(0.50 0.18 145)" }} /> : <Clock className="w-4 h-4 shrink-0" style={{ color: "oklch(0.55 0.18 264)" }} />}
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-medium truncate">{sprintMap[cl.sprintId] ?? `Sprint #${cl.sprintId}`}</p>
                            <p className="text-xs text-gray-400">{new Date(cl.startedAt).toLocaleDateString("pt-BR")}</p>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <div className="w-20 h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.88 0.008 80)" }}>
                              <div className="h-full rounded-full" style={{ width: `${progress}%`, background: isCompleted ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)" }} />
                            </div>
                            <span className="text-xs font-bold tabular-nums w-8 text-right" style={{ color: isCompleted ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)" }}>{progress}%</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
  </AppLayout>
  );
}
