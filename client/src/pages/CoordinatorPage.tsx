import { useState } from "react";
import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CheckCircle2, Clock, Eye, FileText } from "lucide-react";
import { totalItems } from "@/data/qaData";
import AppLayout from "@/components/AppLayout";
import { ChecklistViewModal } from "@/components/ChecklistViewModal";
import SprintTestPlansModal from "@/components/SprintTestPlansModal";

export default function CoordinatorPage() {
  const { user } = useAuth();
  const isCoordinator = user?.role === "admin";
  const { data: allChecklists } = trpc.checklists.allHistory.useQuery(undefined, { enabled: isCoordinator });
  const { data: allPlans } = trpc.qaPlanner.listPlans.useQuery({}, { enabled: isCoordinator });
  const { data: allUsers } = trpc.users.list.useQuery(undefined, { enabled: isCoordinator });
  const { data: sprints } = trpc.sprints.list.useQuery({ projectId: undefined }, { enabled: isCoordinator });
  const { data: projects } = trpc.projects.list.useQuery({ clientId: undefined }, { enabled: isCoordinator });

  type ChecklistRow = NonNullable<typeof allChecklists>[number];
  const [viewChecklist, setViewChecklist] = useState<ChecklistRow | null>(null);
  type PlanRow = NonNullable<typeof allPlans>[number];
  const [viewPlan, setViewPlan] = useState<PlanRow | null>(null);

  if (!isCoordinator) return <div className="p-8 text-center text-sm text-gray-500">Acesso restrito ao Coordenador.</div>;

  const sprintMap = Object.fromEntries((sprints ?? []).map(sprint => [sprint.id, sprint.name]));
  const projectMap = Object.fromEntries((projects ?? []).map(project => [project.id, project.name]));
  const userMap = Object.fromEntries((allUsers ?? []).map(option => [option.id, option.name ?? option.email ?? `#${option.id}`]));
  const sprintProjectMap = Object.fromEntries((sprints ?? []).map(sprint => [sprint.id, (sprint as any).projectName ?? ""]));
  const sprintClientMap = Object.fromEntries((sprints ?? []).map(sprint => [sprint.id, (sprint as any).clientName ?? ""]));
  const responsibleIds = Array.from(new Set([
    ...(allChecklists ?? []).map(checklist => checklist.responsibleUserId ?? checklist.analystId),
    ...(allPlans ?? []).map(plan => plan.responsibleUserId ?? plan.createdById),
  ]));

  return (
    <AppLayout>
      {viewChecklist && (
        <ChecklistViewModal
          sprintName={sprintMap[viewChecklist.sprintId] ?? `Sprint #${viewChecklist.sprintId}`}
          projectName={sprintProjectMap[viewChecklist.sprintId] ?? "—"}
          clientName={sprintClientMap[viewChecklist.sprintId] ?? "—"}
          analystName={userMap[viewChecklist.responsibleUserId ?? viewChecklist.analystId] ?? `Analista #${viewChecklist.responsibleUserId ?? viewChecklist.analystId}`}
          checkedItems={viewChecklist.checkedItems ?? "{}"}
          completedItems={viewChecklist.completedItems}
          status={viewChecklist.status}
          startedAt={viewChecklist.startedAt}
          onClose={() => setViewChecklist(null)}
        />
      )}
      {viewPlan && (
        <SprintTestPlansModal
          projectId={viewPlan.projectId}
          sprintId={viewPlan.sprintId}
          sprintName={sprintMap[viewPlan.sprintId] ?? ("Sprint #" + viewPlan.sprintId)}
          projectName={projectMap[viewPlan.projectId] ?? ("Projeto #" + viewPlan.projectId)}
          initialPlanId={viewPlan.id}
          readOnly
          onClose={() => setViewPlan(null)}
        />
      )}

      <main className="container py-8">
        <div className="mb-8 grid grid-cols-2 gap-4 md:grid-cols-4">
          {[
            { label: "Responsáveis ativos", value: responsibleIds.length, color: "oklch(0.55 0.18 264)" },
            { label: "Checklists", value: allChecklists?.length ?? 0, color: "oklch(0.50 0.15 45)" },
            { label: "Planos de teste", value: allPlans?.length ?? 0, color: "oklch(0.50 0.18 145)" },
            { label: "Checklists em andamento", value: allChecklists?.filter(item => item.status === "in_progress").length ?? 0, color: "oklch(0.55 0.20 25)" },
          ].map(stat => (
            <Card key={stat.label}>
              <CardContent className="p-4">
                <div className="mb-1 text-2xl font-bold tabular-nums" style={{ color: stat.color }}>{stat.value}</div>
                <div className="text-xs text-gray-500">{stat.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>

        <h2 className="mb-1 text-base font-bold text-slate-900">Gestão de atividades por responsável</h2>
        <p className="mb-4 text-xs text-slate-500">A vinculação abaixo é atualizada pelos campos Responsável dos checklists e planos de teste.</p>
        {responsibleIds.length === 0 && <p className="py-8 text-center text-sm text-gray-400">Nenhuma atividade atribuída ainda.</p>}
        <div className="space-y-4">
          {responsibleIds.map(responsibleId => {
            const responsibleChecklists = (allChecklists ?? []).filter(item => (item.responsibleUserId ?? item.analystId) === responsibleId);
            const responsiblePlans = (allPlans ?? []).filter(item => (item.responsibleUserId ?? item.createdById) === responsibleId);
            const responsibleName = userMap[responsibleId] ?? `Analista #${responsibleId}`;
            return (
              <Card key={responsibleId}>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2 text-sm">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold text-white" style={{ background: "oklch(0.50 0.20 264)" }}>{responsibleName.charAt(0).toUpperCase()}</div>
                    {responsibleName}
                    <span className="ml-auto text-xs font-normal text-gray-400">{responsibleChecklists.length} checklist{responsibleChecklists.length === 1 ? "" : "s"} · {responsiblePlans.length} plano{responsiblePlans.length === 1 ? "" : "s"}</span>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 pt-0">
                  {responsibleChecklists.map(checklist => {
                    const progress = totalItems > 0 ? Math.round((checklist.completedItems / totalItems) * 100) : 0;
                    const completed = checklist.status === "completed";
                    return (
                      <div key={`checklist-${checklist.id}`} className="flex items-center gap-3 rounded border border-slate-100 bg-slate-50 p-2">
                        {completed ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" /> : <Clock className="h-4 w-4 shrink-0 text-blue-600" />}
                        <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">Checklist · {sprintMap[checklist.sprintId] ?? `Sprint #${checklist.sprintId}`}</p><p className="text-xs text-gray-400">Atualizado em {new Date(checklist.updatedAt).toLocaleDateString("pt-BR")}</p></div>
                        <div className="flex shrink-0 items-center gap-2"><div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-200"><div className={`h-full rounded-full ${completed ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${progress}%` }} /></div><span className="w-8 text-right text-xs font-bold">{progress}%</span></div>
                        <button onClick={() => setViewChecklist(checklist)} className="flex items-center gap-1 rounded-lg bg-blue-50 p-1.5 text-xs font-medium text-blue-700"><Eye className="h-3.5 w-3.5" /> Ver</button>
                      </div>
                    );
                  })}
                  {responsiblePlans.map(plan => (
                    <div key={`plan-${plan.id}`} className="flex items-center gap-3 rounded border border-violet-100 bg-violet-50/50 p-2">
                      <FileText className="h-4 w-4 shrink-0 text-violet-600" />
                      <div className="min-w-0 flex-1"><p className="truncate text-xs font-medium">{plan.title}</p><p className="text-xs text-gray-400">{sprintMap[plan.sprintId] ?? `Sprint #${plan.sprintId}`} · atualizado em {new Date(plan.updatedAt).toLocaleDateString("pt-BR")}</p></div>
                      <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-semibold text-violet-700">Plano de teste</span>
                      <button onClick={() => setViewPlan(plan)} className="flex items-center gap-1 rounded-lg bg-violet-100 p-1.5 text-xs font-medium text-violet-700" title="Visualizar plano"><Eye className="h-3.5 w-3.5" /> Ver</button>
                    </div>
                  ))}
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </AppLayout>
  );
}
