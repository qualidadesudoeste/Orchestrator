import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import ProjectConfigurationModal from "@/components/ProjectConfigurationModal";
import SprintTestPlansModal from "@/components/SprintTestPlansModal";
import { ChecklistModal } from "@/components/ChecklistModal";
import { phases, totalItems } from "@/data/qaData";
import {
  ChevronRight, Plus, Pencil, Trash2, ClipboardCheck, X,
  FolderOpen, Zap, CheckSquare, ArrowLeft, ExternalLink, Settings2, FileText
} from "lucide-react";

// ─── Sprint Card ──────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = { pending: "Pendente", in_progress: "Em Teste", in_review: "Em Revisão", done: "Concluída" };
const STATUS_COLOR: Record<string, string> = { pending: "oklch(0.55 0.01 260)", in_progress: "oklch(0.55 0.18 264)", in_review: "oklch(0.55 0.20 45)", done: "oklch(0.50 0.18 145)" };

const WORKSPACE_UI_STORAGE_KEY = "orchestrator-workspace-ui-state";
type WorkspaceUiState = {
  selectedClientId: number | null;
  selectedProjectId: number | null;
  checklistSprint: { id: number; name: string; projectName: string; clientName: string } | null;
  configuringProjectId: number | null;
  plansSprint: { id: number; name: string; projectId: number; projectName: string } | null;
};
const EMPTY_WORKSPACE_UI_STATE: WorkspaceUiState = { selectedClientId: null, selectedProjectId: null, checklistSprint: null, configuringProjectId: null, plansSprint: null };
function loadWorkspaceUiState(): WorkspaceUiState {
  try {
    const saved = sessionStorage.getItem(WORKSPACE_UI_STORAGE_KEY);
    return saved ? { ...EMPTY_WORKSPACE_UI_STATE, ...JSON.parse(saved) } : EMPTY_WORKSPACE_UI_STATE;
  } catch {
    return EMPTY_WORKSPACE_UI_STATE;
  }
}

// ─── WorkspacePage ────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.role === "admin";

  const [initialUiState] = useState(loadWorkspaceUiState);

  const [selectedClientId, setSelectedClientId] = useState<number | null>(initialUiState.selectedClientId);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(initialUiState.selectedProjectId);
  const [checklistSprint, setChecklistSprint] = useState<WorkspaceUiState["checklistSprint"]>(initialUiState.checklistSprint);
  const [configuringProjectId, setConfiguringProjectId] = useState<number | null>(initialUiState.configuringProjectId);
  const [plansSprint, setPlansSprint] = useState<WorkspaceUiState["plansSprint"]>(initialUiState.plansSprint);

  const [newClientName, setNewClientName] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintDesc, setNewSprintDesc] = useState("");
  const [editingClient, setEditingClient] = useState<{ id: number; name: string } | null>(null);
  const [editingProject, setEditingProject] = useState<{ id: number; name: string } | null>(null);
  const [editingSprint, setEditingSprint] = useState<{ id: number; name: string; status: string } | null>(null);

  useEffect(() => {
    const state: WorkspaceUiState = { selectedClientId, selectedProjectId, checklistSprint, configuringProjectId, plansSprint };
    sessionStorage.setItem(WORKSPACE_UI_STORAGE_KEY, JSON.stringify(state));
  }, [selectedClientId, selectedProjectId, checklistSprint, configuringProjectId, plansSprint]);

  const { data: clients = [], refetch: refetchClients } = trpc.clients.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: projects = [], refetch: refetchProjects } = trpc.projects.list.useQuery(
    { clientId: selectedClientId ?? undefined },
    { enabled: isAuthenticated && selectedClientId !== null },
  );
  const { data: sprints = [], refetch: refetchSprints } = trpc.sprints.list.useQuery(
    { projectId: selectedProjectId ?? undefined },
    { enabled: isAuthenticated && selectedProjectId !== null },
  );

  const createClientMut = trpc.clients.create.useMutation({ onSuccess: () => { refetchClients(); setNewClientName(""); toast.success("Cliente criado!"); } });
  const updateClientMut = trpc.clients.update.useMutation({ onSuccess: () => { refetchClients(); setEditingClient(null); toast.success("Cliente atualizado!"); } });
  const deleteClientMut = trpc.clients.delete.useMutation({ onSuccess: () => { refetchClients(); setSelectedClientId(null); setSelectedProjectId(null); toast.success("Cliente removido!"); } });
  const createProjectMut = trpc.projects.create.useMutation({ onSuccess: () => { refetchProjects(); setNewProjectName(""); toast.success("Projeto criado!"); } });
  const updateProjectMut = trpc.projects.update.useMutation({ onSuccess: () => { refetchProjects(); setEditingProject(null); toast.success("Projeto atualizado!"); } });
  const deleteProjectMut = trpc.projects.delete.useMutation({ onSuccess: () => { refetchProjects(); setSelectedProjectId(null); toast.success("Projeto removido!"); } });
  const createSprintMut = trpc.sprints.create.useMutation({ onSuccess: () => { refetchSprints(); setNewSprintName(""); setNewSprintDesc(""); toast.success("Sprint criada!"); } });
  const updateSprintMut = trpc.sprints.update.useMutation({ onSuccess: () => { refetchSprints(); setEditingSprint(null); toast.success("Sprint atualizada!"); } });
  const deleteSprintMut = trpc.sprints.delete.useMutation({ onSuccess: () => { refetchSprints(); toast.success("Sprint removida!"); } });

  const selectedClient = clients.find(client => client.id === selectedClientId);
  const selectedProject = projects.find(project => project.id === selectedProjectId);
  const configuringProject = projects.find(project => project.id === configuringProjectId);

  const selectClient = (id: number) => {
    setSelectedClientId(id);
    setSelectedProjectId(null);
    setEditingProject(null);
  };

  return (
    <AppLayout>
      {checklistSprint && (
        <ChecklistModal
          sprintId={checklistSprint.id}
          sprintName={checklistSprint.name}
          projectName={checklistSprint.projectName}
          clientName={checklistSprint.clientName}
          onClose={() => setChecklistSprint(null)}
        />
      )}
      {configuringProject && (
        <ProjectConfigurationModal
          project={configuringProject}
          onClose={() => setConfiguringProjectId(null)}
          onUpdated={() => refetchProjects()}
        />
      )}
      {plansSprint && (
        <SprintTestPlansModal
          projectId={plansSprint.projectId}
          sprintId={plansSprint.id}
          sprintName={plansSprint.name}
          projectName={plansSprint.projectName}
          onClose={() => setPlansSprint(null)}
        />
      )}

      <main className="min-h-full bg-slate-50/70 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1500px]">
          <header className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Workspace</p>
              <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Cadastro de Projetos</h1>
              <p className="mt-1 text-sm text-slate-500">Organize clientes, projetos, parâmetros de automação e sprints em um só lugar.</p>
            </div>
            <div className="flex items-center gap-2 text-xs text-slate-500">
              <span className="rounded-full border bg-white px-3 py-1.5">{clients.length} cliente{clients.length === 1 ? "" : "s"}</span>
              {selectedClient && <span className="rounded-full border bg-white px-3 py-1.5">{projects.length} projeto{projects.length === 1 ? "" : "s"}</span>}
            </div>
          </header>

          <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
            <aside className="space-y-5">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                <div className="border-b border-slate-100 px-4 py-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-50 text-blue-600"><FolderOpen className="h-4 w-4" /></div>
                      <div><h2 className="text-sm font-semibold text-slate-900">Clientes</h2><p className="text-xs text-slate-400">Selecione para ver os projetos</p></div>
                    </div>
                  </div>
                  {isAdmin && (
                    <div className="mt-3">
                      {editingClient ? (
                        <div className="flex gap-2">
                          <Input value={editingClient.name} onChange={event => setEditingClient({ ...editingClient, name: event.target.value })} className="h-9 text-sm" autoFocus />
                          <Button size="sm" className="h-9" onClick={() => updateClientMut.mutate({ id: editingClient.id, name: editingClient.name })}>Salvar</Button>
                          <Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setEditingClient(null)}><X className="h-4 w-4" /></Button>
                        </div>
                      ) : (
                        <div className="flex gap-2">
                          <Input value={newClientName} onChange={event => setNewClientName(event.target.value)} onKeyDown={event => event.key === "Enter" && newClientName.trim() && createClientMut.mutate({ name: newClientName.trim() })} className="h-9 text-sm" placeholder="Nome do novo cliente" />
                          <Button size="icon" className="h-9 w-9 shrink-0" onClick={() => newClientName.trim() && createClientMut.mutate({ name: newClientName.trim() })}><Plus className="h-4 w-4" /></Button>
                        </div>
                      )}
                    </div>
                  )}
                </div>
                <div className="max-h-72 overflow-y-auto p-2">
                  {clients.length === 0 ? <p className="p-6 text-center text-xs text-slate-400">Nenhum cliente cadastrado.</p> : clients.map(client => {
                    const active = client.id === selectedClientId;
                    return (
                      <button key={client.id} onClick={() => selectClient(client.id)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active ? "bg-blue-50 text-blue-800" : "text-slate-600 hover:bg-slate-50"}`}>
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${active ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-500"}`}>{client.name.charAt(0).toUpperCase()}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{client.name}</span>
                        {isAdmin && <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"><span onClick={event => { event.stopPropagation(); setEditingClient({ id: client.id, name: client.name }); }} className="rounded p-1 hover:bg-white"><Pencil className="h-3.5 w-3.5" /></span><span onClick={event => { event.stopPropagation(); deleteClientMut.mutate({ id: client.id }); }} className="rounded p-1 text-red-400 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></span></span>}
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-opacity ${selectedClient ? "border-slate-200 opacity-100" : "pointer-events-none border-slate-100 opacity-55"}`}>
                <div className="border-b border-slate-100 px-4 py-4">
                  <div className="flex items-center gap-2">
                    <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-50 text-amber-600"><CheckSquare className="h-4 w-4" /></div>
                    <div className="min-w-0"><h2 className="truncate text-sm font-semibold text-slate-900">Projetos{selectedClient ? ` de ${selectedClient.name}` : ""}</h2><p className="text-xs text-slate-400">Escolha o projeto de trabalho</p></div>
                  </div>
                  {isAdmin && selectedClient && (
                    <div className="mt-3">
                      {editingProject ? (
                        <div className="flex gap-2"><Input value={editingProject.name} onChange={event => setEditingProject({ ...editingProject, name: event.target.value })} className="h-9 text-sm" autoFocus /><Button size="sm" className="h-9" onClick={() => updateProjectMut.mutate({ id: editingProject.id, name: editingProject.name })}>Salvar</Button><Button size="icon" variant="outline" className="h-9 w-9" onClick={() => setEditingProject(null)}><X className="h-4 w-4" /></Button></div>
                      ) : (
                        <div className="flex gap-2"><Input value={newProjectName} onChange={event => setNewProjectName(event.target.value)} onKeyDown={event => event.key === "Enter" && newProjectName.trim() && createProjectMut.mutate({ name: newProjectName.trim(), clientId: selectedClientId! })} className="h-9 text-sm" placeholder="Nome do novo projeto" /><Button size="icon" className="h-9 w-9 shrink-0" onClick={() => newProjectName.trim() && createProjectMut.mutate({ name: newProjectName.trim(), clientId: selectedClientId! })}><Plus className="h-4 w-4" /></Button></div>
                      )}
                    </div>
                  )}
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {!selectedClient ? <p className="p-6 text-center text-xs text-slate-400">Selecione um cliente primeiro.</p> : projects.length === 0 ? <p className="p-6 text-center text-xs text-slate-400">Nenhum projeto cadastrado.</p> : projects.map(project => {
                    const active = project.id === selectedProjectId;
                    return (
                      <button key={project.id} onClick={() => setSelectedProjectId(project.id)} className={`group flex w-full items-center gap-3 rounded-xl px-3 py-3 text-left transition-colors ${active ? "bg-amber-50 text-amber-900" : "text-slate-600 hover:bg-slate-50"}`}>
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${active ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-500"}`}>{project.name.charAt(0).toUpperCase()}</span>
                        <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{project.name}</span><span className={`mt-0.5 block text-[11px] ${project.sourceCodeIndexedAt ? "text-emerald-600" : "text-slate-400"}`}>{project.sourceCodeIndexedAt ? "Código analisado" : "Configuração pendente"}</span></span>
                        {isAdmin && <span className="flex gap-1 opacity-0 transition-opacity group-hover:opacity-100"><span onClick={event => { event.stopPropagation(); setEditingProject({ id: project.id, name: project.name }); }} className="rounded p-1 hover:bg-white"><Pencil className="h-3.5 w-3.5" /></span><span onClick={event => { event.stopPropagation(); deleteProjectMut.mutate({ id: project.id }); }} className="rounded p-1 text-red-400 hover:bg-red-50"><Trash2 className="h-3.5 w-3.5" /></span></span>}
                        <ChevronRight className="h-4 w-4 text-slate-300" />
                      </button>
                    );
                  })}
                </div>
              </section>
            </aside>

            <section className="min-w-0">
              {!selectedProject ? (
                <div className="flex min-h-[620px] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white px-6 text-center">
                  <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-50"><FolderOpen className="h-7 w-7 text-blue-500" /></div>
                  <h2 className="mt-4 text-lg font-semibold text-slate-800">Selecione um projeto</h2>
                  <p className="mt-1 max-w-sm text-sm text-slate-500">Escolha um cliente e um projeto ao lado para gerenciar seus parâmetros de automação e sprints.</p>
                </div>
              ) : (
                <div className="space-y-5">
                  <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                    <div className="h-2 bg-gradient-to-r from-blue-600 via-indigo-500 to-violet-500" />
                    <div className="flex flex-col gap-5 p-6 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-xs text-slate-400"><span>{selectedClient?.name}</span><ChevronRight className="h-3 w-3" /><span>Projeto</span></div>
                        <h2 className="mt-2 text-2xl font-bold text-slate-900">{selectedProject.name}</h2>
                        <p className="mt-1 text-sm text-slate-500">{selectedProject.description || "Projeto sem descrição cadastrada."}</p>
                        <div className="mt-4 flex flex-wrap gap-2">
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${selectedProject.repositoryUrl ? "bg-violet-50 text-violet-700" : "bg-slate-100 text-slate-500"}`}>{selectedProject.repositoryUrl ? "Repositório configurado" : "Sem repositório"}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${selectedProject.sourceCodeIndexedAt ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>{selectedProject.sourceCodeIndexedAt ? `${selectedProject.sourceCodeFileCount ?? 0} arquivos analisados` : "Análise de código pendente"}</span>
                          <span className="rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700">{sprints.length} sprint{sprints.length === 1 ? "" : "s"}</span>
                        </div>
                      </div>
                      {isAdmin && <Button className="shrink-0" onClick={() => setConfiguringProjectId(selectedProject.id)}><Zap className="mr-2 h-4 w-4" /> Configurar projeto</Button>}
                    </div>
                  </div>

                  {isAdmin && (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                      <div className="mb-3"><h3 className="text-sm font-semibold text-slate-900">Nova sprint</h3><p className="text-xs text-slate-400">Adicione um ciclo de trabalho ao projeto selecionado.</p></div>
                      <div className="grid gap-2 sm:grid-cols-[minmax(180px,0.8fr)_minmax(220px,1.2fr)_auto]">
                        <Input value={newSprintName} onChange={event => setNewSprintName(event.target.value)} placeholder="Nome da sprint" />
                        <Input value={newSprintDesc} onChange={event => setNewSprintDesc(event.target.value)} placeholder="Descrição opcional" />
                        <Button disabled={!newSprintName.trim() || createSprintMut.isPending} onClick={() => createSprintMut.mutate({ name: newSprintName.trim(), description: newSprintDesc.trim(), projectId: selectedProject.id })}><Plus className="mr-1.5 h-4 w-4" /> Criar sprint</Button>
                      </div>
                    </div>
                  )}

                  <div>
                    <div className="mb-3 flex items-center justify-between"><div><h3 className="text-base font-semibold text-slate-900">Sprints do projeto</h3><p className="text-xs text-slate-400">Acompanhe e abra o checklist de cada sprint.</p></div></div>
                    {sprints.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center"><Zap className="mx-auto h-7 w-7 text-slate-300" /><p className="mt-3 text-sm text-slate-500">Nenhuma sprint cadastrada neste projeto.</p></div>
                    ) : (
                      <div className="grid gap-3 lg:grid-cols-2">
                        {sprints.map(sprint => (
                          <article key={sprint.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition-shadow hover:shadow-md">
                            {editingSprint?.id === sprint.id ? (
                              <div className="space-y-3">
                                <Input value={editingSprint.name} onChange={event => setEditingSprint({ ...editingSprint, name: event.target.value })} />
                                <select value={editingSprint.status} onChange={event => setEditingSprint({ ...editingSprint, status: event.target.value })} className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"><option value="pending">Pendente</option><option value="in_progress">Em Teste</option><option value="in_review">Em Revisão</option><option value="done">Concluída</option></select>
                                <div className="flex gap-2"><Button size="sm" onClick={() => updateSprintMut.mutate({ id: editingSprint.id, name: editingSprint.name, status: editingSprint.status as any })}>Salvar</Button><Button size="sm" variant="outline" onClick={() => setEditingSprint(null)}>Cancelar</Button></div>
                              </div>
                            ) : (
                              <>
                                <div className="flex items-start justify-between gap-3">
                                  <div className="flex min-w-0 items-start gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ background: `${STATUS_COLOR[sprint.status]}18` }}><Zap className="h-5 w-5" style={{ color: STATUS_COLOR[sprint.status] }} /></div><div className="min-w-0"><h4 className="truncate text-sm font-semibold text-slate-900">{sprint.name}</h4><span className="mt-1 inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium" style={{ background: `${STATUS_COLOR[sprint.status]}18`, color: STATUS_COLOR[sprint.status] }}>{STATUS_LABEL[sprint.status]}</span></div></div>
                                  {isAdmin && <div className="flex gap-1"><Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => setEditingSprint({ id: sprint.id, name: sprint.name, status: sprint.status })}><Pencil className="h-3.5 w-3.5" /></Button><Button size="icon" variant="ghost" className="h-8 w-8 text-red-500" onClick={() => deleteSprintMut.mutate({ id: sprint.id })}><Trash2 className="h-3.5 w-3.5" /></Button></div>}
                                </div>
                                <p className="mt-3 min-h-8 text-xs leading-relaxed text-slate-500">{sprint.description || "Sem descrição."}</p>
                                <div className="mt-4 grid grid-cols-2 gap-2">
                                  <Button size="sm" variant="outline" onClick={() => setChecklistSprint({ id: sprint.id, name: sprint.name, projectName: selectedProject.name, clientName: selectedClient?.name ?? "" })}><ClipboardCheck className="mr-1.5 h-4 w-4" /> Checklist</Button>
                                  <Button size="sm" variant="outline" onClick={() => setPlansSprint({ id: sprint.id, name: sprint.name, projectId: selectedProject.id, projectName: selectedProject.name })}><FileText className="mr-1.5 h-4 w-4" /> Planos de teste</Button>
                                </div>
                              </>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </section>
          </div>
        </div>
      </main>
    </AppLayout>
  );
}