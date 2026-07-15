import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { CheckCircle2, Clock } from "lucide-react";
import { totalItems } from "@/data/qaData";
import AppLayout from "@/components/AppLayout";
import { ChecklistModal } from "@/components/ChecklistModal";

export default function HistoryPage() {
  const { isAuthenticated } = useAuth();
  const [modalSprint, setModalSprint] = useState<{ id: number; name: string; projectName: string; clientName: string } | null>(null);
  const { data: history } = trpc.checklists.myHistory.useQuery(undefined, { enabled: isAuthenticated });
  const { data: sprints } = trpc.sprints.list.useQuery({ projectId: undefined }, { enabled: isAuthenticated });
  const { data: projects } = trpc.projects.list.useQuery({ clientId: undefined }, { enabled: isAuthenticated });
  const { data: clients } = trpc.clients.list.useQuery(undefined, { enabled: isAuthenticated });

  const sprintMap = Object.fromEntries((sprints ?? []).map(s => [s.id, s]));
  const allProjects = projects ?? [];
  const allClients = clients ?? [];

  const openChecklist = (sprintId: number) => {
    const sprint = (sprints ?? []).find(s => s.id === sprintId);
    if (!sprint) return;
    const project = allProjects.find(p => p.id === sprint.projectId);
    const client = allClients.find(c => c.id === project?.clientId);
    setModalSprint({ id: sprint.id, name: sprint.name, projectName: project?.name ?? "—", clientName: client?.name ?? "—" });
  };

  return (
    <AppLayout>
      {modalSprint && (
        <ChecklistModal
          sprintId={modalSprint.id}
          sprintName={modalSprint.name}
          projectName={modalSprint.projectName}
          clientName={modalSprint.clientName}
          onClose={() => setModalSprint(null)}
        />
      )}
      <main className="container py-8 max-w-2xl">
        {history?.length === 0 && <p className="text-sm text-center text-gray-400 py-12">Nenhum checklist executado ainda.</p>}
        <div className="space-y-3">
          {history?.map(item => {
            const progress = totalItems > 0 ? Math.round((item.completedItems / totalItems) * 100) : 0;
            const isCompleted = item.status === "completed";
            const sprintName = sprintMap[item.sprintId]?.name ?? `Sprint #${item.sprintId}`;
            return (
              <Card key={item.id} className="cursor-pointer hover:shadow-md transition-shadow" onClick={() => openChecklist(item.sprintId)}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full flex items-center justify-center" style={{ background: isCompleted ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)", opacity: 0.15 + 0.85 }}>
                        {isCompleted ? <CheckCircle2 className="w-4 h-4 text-white" style={{ color: "oklch(0.50 0.18 145)" }} /> : <Clock className="w-4 h-4" style={{ color: "oklch(0.55 0.18 264)" }} />}
                      </div>
                      <div>
                        <p className="font-semibold text-sm">{sprintName}</p>
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
  </AppLayout>
  );
}
