import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { FolderOpen, Zap, CheckSquare, BarChart2, Shield, ClipboardCheck } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { ChecklistModal } from "@/components/ChecklistModal";

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [modalSprint, setModalSprint] = useState<{ id: number; name: string; projectName: string; clientName: string } | null>(null);

  const { data: sprints } = trpc.sprints.list.useQuery({ projectId: undefined }, { enabled: isAuthenticated });
  const { data: clients } = trpc.clients.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: projects } = trpc.projects.list.useQuery({ clientId: undefined }, { enabled: isAuthenticated });
  const { data: progressData } = trpc.checklists.progressBySprints.useQuery(undefined, { enabled: isAuthenticated });

  const isCoordinator = user?.role === "admin";
  const allSprints = sprints ?? [];
  const allProjects = projects ?? [];
  const allClients = clients ?? [];
  const progressMap = new Map((progressData ?? []).map(p => [p.sprintId, p]));

  const openChecklist = (sprint: typeof allSprints[number]) => {
    const project = allProjects.find(p => p.id === sprint.projectId);
    const client = allClients.find(c => c.id === project?.clientId);
    setModalSprint({
      id: sprint.id,
      name: sprint.name,
      projectName: project?.name ?? "—",
      clientName: client?.name ?? "—",
    });
  };

  const statusLabel: Record<string, string> = { pending: "Pendente", in_progress: "Em Teste", in_review: "Em Revisão", done: "Concluída" };
  const statusColor: Record<string, string> = { pending: "oklch(0.60 0.01 260)", in_progress: "oklch(0.55 0.18 264)", in_review: "oklch(0.55 0.20 45)", done: "oklch(0.50 0.18 145)" };

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
      <main className="px-8 py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold mb-1" style={{ color: "oklch(0.15 0.01 260)", letterSpacing: "-0.02em" }}>
            Olá, {user?.name?.split(" ")[0] ?? "QA"} 👋
          </h1>
          <p className="text-sm" style={{ color: "oklch(0.50 0.01 260)" }}>
            {isCoordinator ? "Coordenador — você tem acesso completo à plataforma." : "Analista — selecione uma sprint para iniciar o checklist."}
          </p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: <FolderOpen className="w-5 h-5" />, label: "Clientes", value: allClients.length, color: "oklch(0.55 0.18 264)" },
            { icon: <Zap className="w-5 h-5" />, label: "Sprints", value: allSprints.length, color: "oklch(0.55 0.20 25)" },
            { icon: <CheckSquare className="w-5 h-5" />, label: "Em Teste", value: allSprints.filter(s => s.status === "in_progress").length, color: "oklch(0.50 0.18 145)" },
            { icon: isCoordinator ? <Shield className="w-5 h-5" /> : <BarChart2 className="w-5 h-5" />, label: isCoordinator ? "Coordenador" : "Analista", value: isCoordinator ? "Admin" : "QA", color: "oklch(0.50 0.15 45)" },
          ].map((stat, i) => (
            <Card key={i} className="border" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ background: stat.color }}>
                    {stat.icon}
                  </div>
                  <div>
                    <div className="text-xl font-bold" style={{ color: "oklch(0.15 0.01 260)" }}>{stat.value}</div>
                    <div className="text-xs" style={{ color: "oklch(0.50 0.01 260)" }}>{stat.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sprints */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base" style={{ color: "oklch(0.15 0.01 260)" }}>Sprints Disponíveis</h2>
            <div className="flex items-center gap-2">
              {allSprints.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => navigate("/workspace")} className="text-xs">
                  {isCoordinator ? "Gerenciar Sprints" : "Ver todas"}
                </Button>
              )}
              {isCoordinator && (
                <Button size="sm" onClick={() => navigate("/workspace")} className="text-xs" style={{ background: "oklch(0.50 0.20 264)" }}>+ Nova Sprint</Button>
              )}
            </div>
          </div>
          {allSprints.length === 0 ? (
            <Card className="border" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
              <CardContent className="p-8 text-center">
                <p className="text-sm" style={{ color: "oklch(0.50 0.01 260)" }}>
                  {isCoordinator ? "Nenhuma sprint cadastrada. Crie clientes, projetos e sprints para começar." : "Nenhuma sprint disponível no momento."}
                </p>
                {isCoordinator && (
                  <Button size="sm" className="mt-4" onClick={() => navigate("/workspace")} style={{ background: "oklch(0.50 0.20 264)" }}>
                    Começar cadastro
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-3">
              {allSprints.map(sprint => {
                const project = allProjects.find(p => p.id === sprint.projectId);
                const client = allClients.find(c => c.id === project?.clientId);
                return (
                  <Card key={sprint.id} className="border hover:shadow-md transition-shadow" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
                    <CardContent className="p-4">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 flex-1 min-w-0">
                          <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "oklch(0.50 0.20 264)22" }}>
                            <ClipboardCheck className="w-4 h-4" style={{ color: "oklch(0.50 0.20 264)" }} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-sm truncate" style={{ color: "oklch(0.15 0.01 260)" }}>{sprint.name}</h3>
                            {(client || project) && (
                              <p className="text-xs mt-0.5 flex items-center gap-1" style={{ color: "oklch(0.55 0.01 260)" }}>
                                {client && <span>{client.name}</span>}
                                {client && project && <span style={{ color: "oklch(0.75 0.01 260)" }}>›</span>}
                                {project && <span>{project.name}</span>}
                              </p>
                            )}
                            {(() => {
                              const prog = progressMap.get(sprint.id);
                              if (!prog || prog.totalItems === 0) return null;
                              const pct = Math.round((prog.completedItems / prog.totalItems) * 100);
                              const barColor = pct === 100 ? "oklch(0.50 0.18 145)" : "oklch(0.55 0.18 264)";
                              return (
                                <div className="flex items-center gap-2 mt-1.5">
                                  <div className="flex-1 h-1.5 rounded-full overflow-hidden" style={{ background: "oklch(0.88 0.008 80)" }}>
                                    <div className="h-full rounded-full transition-all duration-500" style={{ width: `${pct}%`, background: barColor }} />
                                  </div>
                                  <span className="text-xs font-bold tabular-nums flex-shrink-0" style={{ color: barColor, minWidth: "2.5rem", textAlign: "right" }}>{pct}%</span>
                                </div>
                              );
                            })()}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full hidden sm:inline-block" style={{ background: `${statusColor[sprint.status]}22`, color: statusColor[sprint.status] }}>
                            {statusLabel[sprint.status]}
                          </span>
                          <Button size="sm" className="text-xs h-8 font-semibold flex items-center gap-1.5" style={{ background: "oklch(0.50 0.20 264)" }}
                            onClick={() => openChecklist(sprint)}>
                            <ClipboardCheck className="w-3.5 h-3.5" />
                            Abrir Checklist
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
