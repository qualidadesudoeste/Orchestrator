import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState, useCallback, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";
import { phases, totalItems } from "@/data/qaData";
import {
  ChevronRight, Plus, Pencil, Trash2, ClipboardCheck, X,
  FolderOpen, Zap, CheckSquare, ArrowLeft, ExternalLink
} from "lucide-react";

type CheckedMap = Record<string, boolean>;

// ─── Checklist Modal ──────────────────────────────────────────────────────────
function ChecklistModal({
  sprintId, sprintName, projectName, clientName,
  onClose,
}: {
  sprintId: number; sprintName: string; projectName: string; clientName: string;
  onClose: () => void;
}) {
  const { isAuthenticated } = useAuth();
  const [checked, setChecked] = useState<CheckedMap>({});
  const [activePhase, setActivePhase] = useState(phases[0].id);

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
    <div className="fixed inset-0 z-50 flex" style={{ background: "rgba(0,0,0,0.7)" }}>
      <div className="flex w-full h-full" style={{ background: "oklch(0.975 0.006 80)" }}>
        {/* Sidebar de fases */}
        <aside className="w-64 flex flex-col flex-shrink-0 h-full" style={{ background: "oklch(0.13 0.015 260)" }}>
          {/* Contexto */}
          <div className="px-4 pt-5 pb-4 border-b" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
            <button onClick={onClose} className="flex items-center gap-1.5 mb-4 text-xs transition-colors" style={{ color: "oklch(0.5 0.01 260)" }}
              onMouseEnter={e => (e.currentTarget.style.color = "white")}
              onMouseLeave={e => (e.currentTarget.style.color = "oklch(0.5 0.01 260)")}>
              <ArrowLeft className="w-3.5 h-3.5" /> Fechar Checklist
            </button>
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
              <h1 className="text-base font-extrabold" style={{ color: "oklch(0.15 0.01 260)", letterSpacing: "-0.01em" }}>
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

// ─── Sprint Card ──────────────────────────────────────────────────────────────
const STATUS_LABEL: Record<string, string> = { pending: "Pendente", in_progress: "Em Teste", in_review: "Em Revisão", done: "Concluída" };
const STATUS_COLOR: Record<string, string> = { pending: "oklch(0.55 0.01 260)", in_progress: "oklch(0.55 0.18 264)", in_review: "oklch(0.55 0.20 45)", done: "oklch(0.50 0.18 145)" };

// ─── WorkspacePage ────────────────────────────────────────────────────────────
export default function WorkspacePage() {
  const { user, isAuthenticated } = useAuth();
  const isAdmin = user?.role === "admin";

  // Seleção hierárquica
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [selectedProjectId, setSelectedProjectId] = useState<number | null>(null);
  const [checklistSprint, setChecklistSprint] = useState<{ id: number; name: string; projectName: string; clientName: string } | null>(null);

  // Formulários
  const [newClientName, setNewClientName] = useState("");
  const [newClientDesc, setNewClientDesc] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDesc, setNewProjectDesc] = useState("");
  const [newSprintName, setNewSprintName] = useState("");
  const [newSprintDesc, setNewSprintDesc] = useState("");
  const [editingClient, setEditingClient] = useState<{ id: number; name: string } | null>(null);
  const [editingProject, setEditingProject] = useState<{ id: number; name: string } | null>(null);
  const [editingSprint, setEditingSprint] = useState<{ id: number; name: string; status: string } | null>(null);

  // Queries
  const { data: clients = [], refetch: refetchClients } = trpc.clients.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: projects = [], refetch: refetchProjects } = trpc.projects.list.useQuery(
    { clientId: selectedClientId ?? undefined }, { enabled: isAuthenticated && selectedClientId !== null }
  );
  const { data: sprints = [], refetch: refetchSprints } = trpc.sprints.list.useQuery(
    { projectId: selectedProjectId ?? undefined }, { enabled: isAuthenticated && selectedProjectId !== null }
  );

  // Mutations
  const createClientMut = trpc.clients.create.useMutation({ onSuccess: () => { refetchClients(); setNewClientName(""); setNewClientDesc(""); toast.success("Cliente criado!"); } });
  const updateClientMut = trpc.clients.update.useMutation({ onSuccess: () => { refetchClients(); setEditingClient(null); toast.success("Cliente atualizado!"); } });
  const deleteClientMut = trpc.clients.delete.useMutation({ onSuccess: () => { refetchClients(); if (selectedClientId !== null) setSelectedClientId(null); toast.success("Cliente removido!"); } });

  const createProjectMut = trpc.projects.create.useMutation({ onSuccess: () => { refetchProjects(); setNewProjectName(""); setNewProjectDesc(""); toast.success("Projeto criado!"); } });
  const updateProjectMut = trpc.projects.update.useMutation({ onSuccess: () => { refetchProjects(); setEditingProject(null); toast.success("Projeto atualizado!"); } });
  const deleteProjectMut = trpc.projects.delete.useMutation({ onSuccess: () => { refetchProjects(); if (selectedProjectId !== null) setSelectedProjectId(null); toast.success("Projeto removido!"); } });

  const createSprintMut = trpc.sprints.create.useMutation({ onSuccess: () => { refetchSprints(); setNewSprintName(""); setNewSprintDesc(""); toast.success("Sprint criada!"); } });
  const updateSprintMut = trpc.sprints.update.useMutation({ onSuccess: () => { refetchSprints(); setEditingSprint(null); toast.success("Sprint atualizada!"); } });
  const deleteSprintMut = trpc.sprints.delete.useMutation({ onSuccess: () => { refetchSprints(); toast.success("Sprint removida!"); } });

  const selectedClient = clients.find(c => c.id === selectedClientId);
  const selectedProject = projects.find(p => p.id === selectedProjectId);

  return (
    <AppLayout>
      {/* Checklist Modal */}
      {checklistSprint && (
        <ChecklistModal
          sprintId={checklistSprint.id}
          sprintName={checklistSprint.name}
          projectName={checklistSprint.projectName}
          clientName={checklistSprint.clientName}
          onClose={() => setChecklistSprint(null)}
        />
      )}

      <div className="flex h-full min-h-screen">
        {/* Coluna 1: Clientes */}
        <div className="w-72 border-r flex flex-col flex-shrink-0" style={{ borderColor: "oklch(0.88 0.008 80)", background: "white" }}>
          <div className="px-4 py-4 border-b" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
            <div className="flex items-center gap-2 mb-3">
              <FolderOpen className="w-4 h-4" style={{ color: "oklch(0.55 0.18 264)" }} />
              <h2 className="font-bold text-sm" style={{ color: "oklch(0.15 0.01 260)" }}>Clientes</h2>
              <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "oklch(0.93 0.008 80)", color: "oklch(0.45 0.01 260)" }}>{clients.length}</span>
            </div>
            {isAdmin && (
              <div className="space-y-1.5">
                {editingClient ? (
                  <div className="space-y-1.5">
                    <Input value={editingClient.name} onChange={e => setEditingClient({ ...editingClient, name: e.target.value })} className="h-7 text-xs" placeholder="Nome do cliente" />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 text-xs flex-1" style={{ background: "oklch(0.50 0.20 264)" }} onClick={() => updateClientMut.mutate({ id: editingClient.id, name: editingClient.name })}>Salvar</Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditingClient(null)}>✕</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Input value={newClientName} onChange={e => setNewClientName(e.target.value)} onKeyDown={e => e.key === "Enter" && newClientName.trim() && createClientMut.mutate({ name: newClientName.trim(), description: newClientDesc })} className="h-7 text-xs" placeholder="Novo cliente..." />
                    <Button size="sm" className="h-7 px-2" style={{ background: "oklch(0.50 0.20 264)" }} onClick={() => newClientName.trim() && createClientMut.mutate({ name: newClientName.trim() })}><Plus className="w-3 h-3" /></Button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {clients.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: "oklch(0.60 0.01 260)" }}>Nenhum cliente cadastrado</p>
            ) : clients.map(client => (
              <div key={client.id}
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all group"
                style={{ background: selectedClientId === client.id ? "oklch(0.50 0.20 264)12" : "transparent", borderLeft: selectedClientId === client.id ? "3px solid oklch(0.50 0.20 264)" : "3px solid transparent" }}
                onClick={() => { setSelectedClientId(client.id); setSelectedProjectId(null); }}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: selectedClientId === client.id ? "oklch(0.50 0.20 264)" : "oklch(0.75 0.01 260)" }}>
                  {client.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium flex-1 truncate" style={{ color: selectedClientId === client.id ? "oklch(0.30 0.15 264)" : "oklch(0.25 0.01 260)" }}>{client.name}</span>
                {isAdmin && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); setEditingClient({ id: client.id, name: client.name }); }} className="p-1 rounded hover:bg-gray-100"><Pencil className="w-3 h-3 text-gray-400" /></button>
                    <button onClick={e => { e.stopPropagation(); deleteClientMut.mutate({ id: client.id }); }} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3 h-3 text-red-400" /></button>
                  </div>
                )}
                <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: selectedClientId === client.id ? "oklch(0.50 0.20 264)" : "oklch(0.75 0.01 260)" }} />
              </div>
            ))}
          </div>
        </div>

        {/* Coluna 2: Projetos */}
        <div className="w-72 border-r flex flex-col flex-shrink-0" style={{ borderColor: "oklch(0.88 0.008 80)", background: "oklch(0.985 0.004 80)" }}>
          <div className="px-4 py-4 border-b" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
            <div className="flex items-center gap-2 mb-3">
              <CheckSquare className="w-4 h-4" style={{ color: "oklch(0.50 0.20 45)" }} />
              <h2 className="font-bold text-sm" style={{ color: "oklch(0.15 0.01 260)" }}>
                {selectedClient ? `Projetos — ${selectedClient.name}` : "Projetos"}
              </h2>
              {selectedClient && <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "oklch(0.93 0.008 80)", color: "oklch(0.45 0.01 260)" }}>{projects.length}</span>}
            </div>
            {isAdmin && selectedClient && (
              <div className="space-y-1.5">
                {editingProject ? (
                  <div className="space-y-1.5">
                    <Input value={editingProject.name} onChange={e => setEditingProject({ ...editingProject, name: e.target.value })} className="h-7 text-xs" />
                    <div className="flex gap-1">
                      <Button size="sm" className="h-6 text-xs flex-1" style={{ background: "oklch(0.50 0.20 264)" }} onClick={() => updateProjectMut.mutate({ id: editingProject.id, name: editingProject.name })}>Salvar</Button>
                      <Button size="sm" variant="outline" className="h-6 text-xs" onClick={() => setEditingProject(null)}>✕</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex gap-1">
                    <Input value={newProjectName} onChange={e => setNewProjectName(e.target.value)} onKeyDown={e => e.key === "Enter" && newProjectName.trim() && createProjectMut.mutate({ name: newProjectName.trim(), clientId: selectedClientId! })} className="h-7 text-xs" placeholder="Novo projeto..." />
                    <Button size="sm" className="h-7 px-2" style={{ background: "oklch(0.50 0.20 264)" }} onClick={() => newProjectName.trim() && createProjectMut.mutate({ name: newProjectName.trim(), clientId: selectedClientId! })}><Plus className="w-3 h-3" /></Button>
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto py-1">
            {!selectedClient ? (
              <p className="text-xs text-center py-6" style={{ color: "oklch(0.65 0.01 260)" }}>← Selecione um cliente</p>
            ) : projects.length === 0 ? (
              <p className="text-xs text-center py-6" style={{ color: "oklch(0.60 0.01 260)" }}>Nenhum projeto cadastrado</p>
            ) : projects.map(project => (
              <div key={project.id}
                className="flex items-center gap-2 px-3 py-2.5 cursor-pointer transition-all group"
                style={{ background: selectedProjectId === project.id ? "oklch(0.50 0.20 45)10" : "transparent", borderLeft: selectedProjectId === project.id ? "3px solid oklch(0.50 0.20 45)" : "3px solid transparent" }}
                onClick={() => setSelectedProjectId(project.id)}>
                <div className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: selectedProjectId === project.id ? "oklch(0.50 0.20 45)" : "oklch(0.75 0.01 260)" }}>
                  {project.name.charAt(0).toUpperCase()}
                </div>
                <span className="text-xs font-medium flex-1 truncate" style={{ color: selectedProjectId === project.id ? "oklch(0.30 0.15 45)" : "oklch(0.25 0.01 260)" }}>{project.name}</span>
                {isAdmin && (
                  <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={e => { e.stopPropagation(); setEditingProject({ id: project.id, name: project.name }); }} className="p-1 rounded hover:bg-gray-100"><Pencil className="w-3 h-3 text-gray-400" /></button>
                    <button onClick={e => { e.stopPropagation(); deleteProjectMut.mutate({ id: project.id }); }} className="p-1 rounded hover:bg-red-50"><Trash2 className="w-3 h-3 text-red-400" /></button>
                  </div>
                )}
                <ChevronRight className="w-3 h-3 flex-shrink-0" style={{ color: selectedProjectId === project.id ? "oklch(0.50 0.20 45)" : "oklch(0.75 0.01 260)" }} />
              </div>
            ))}
          </div>
        </div>

        {/* Coluna 3: Sprints */}
        <div className="flex-1 flex flex-col" style={{ background: "oklch(0.975 0.006 80)" }}>
          <div className="px-6 py-4 border-b bg-white" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
            <div className="flex items-center gap-2 mb-3">
              <Zap className="w-4 h-4" style={{ color: "oklch(0.55 0.20 25)" }} />
              <h2 className="font-bold text-sm" style={{ color: "oklch(0.15 0.01 260)" }}>
                {selectedProject ? `Sprints — ${selectedProject.name}` : "Sprints"}
              </h2>
              {selectedProject && <span className="ml-auto text-xs px-1.5 py-0.5 rounded-full font-medium" style={{ background: "oklch(0.93 0.008 80)", color: "oklch(0.45 0.01 260)" }}>{sprints.length}</span>}
            </div>
            {/* Breadcrumb */}
            {selectedClient && (
              <div className="flex items-center gap-1.5 text-xs mb-3" style={{ color: "oklch(0.55 0.01 260)" }}>
                <FolderOpen className="w-3 h-3" />
                <span>{selectedClient.name}</span>
                {selectedProject && (<><ChevronRight className="w-3 h-3" /><span>{selectedProject.name}</span></>)}
              </div>
            )}
            {isAdmin && selectedProject && (
              <div className="flex gap-1">
                {editingSprint ? (
                  <div className="flex gap-1 w-full">
                    <Input value={editingSprint.name} onChange={e => setEditingSprint({ ...editingSprint, name: e.target.value })} className="h-7 text-xs flex-1" />
                    <select value={editingSprint.status} onChange={e => setEditingSprint({ ...editingSprint, status: e.target.value })}
                      className="h-7 text-xs border rounded px-1" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
                      <option value="pending">Pendente</option>
                      <option value="in_progress">Em Teste</option>
                      <option value="in_review">Em Revisão</option>
                      <option value="done">Concluída</option>
                    </select>
                    <Button size="sm" className="h-7 text-xs" style={{ background: "oklch(0.50 0.20 264)" }} onClick={() => updateSprintMut.mutate({ id: editingSprint.id, name: editingSprint.name, status: editingSprint.status as any })}>Salvar</Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setEditingSprint(null)}>✕</Button>
                  </div>
                ) : (
                  <>
                    <Input value={newSprintName} onChange={e => setNewSprintName(e.target.value)} onKeyDown={e => e.key === "Enter" && newSprintName.trim() && createSprintMut.mutate({ name: newSprintName.trim(), projectId: selectedProjectId! })} className="h-7 text-xs" placeholder="Nova sprint..." />
                    <Button size="sm" className="h-7 px-2" style={{ background: "oklch(0.50 0.20 264)" }} onClick={() => newSprintName.trim() && createSprintMut.mutate({ name: newSprintName.trim(), projectId: selectedProjectId! })}><Plus className="w-3 h-3" /></Button>
                  </>
                )}
              </div>
            )}
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            {!selectedProject ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-3" style={{ background: "oklch(0.93 0.008 80)" }}>
                  <Zap className="w-6 h-6" style={{ color: "oklch(0.65 0.01 260)" }} />
                </div>
                <p className="text-sm font-medium mb-1" style={{ color: "oklch(0.40 0.01 260)" }}>Selecione um projeto</p>
                <p className="text-xs" style={{ color: "oklch(0.65 0.01 260)" }}>← Escolha um cliente e depois um projeto para ver as sprints</p>
              </div>
            ) : sprints.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center py-16">
                <p className="text-sm" style={{ color: "oklch(0.55 0.01 260)" }}>Nenhuma sprint cadastrada para este projeto.</p>
                {isAdmin && <p className="text-xs mt-1" style={{ color: "oklch(0.65 0.01 260)" }}>Use o campo acima para criar a primeira sprint.</p>}
              </div>
            ) : (
              <div className="space-y-2">
                {sprints.map(sprint => (
                  <div key={sprint.id} className="bg-white rounded-xl border p-4 flex items-center justify-between gap-3" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `${STATUS_COLOR[sprint.status]}18` }}>
                        <Zap className="w-4 h-4" style={{ color: STATUS_COLOR[sprint.status] }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="font-semibold text-sm truncate" style={{ color: "oklch(0.15 0.01 260)" }}>{sprint.name}</h3>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full flex-shrink-0"
                            style={{ background: `${STATUS_COLOR[sprint.status]}18`, color: STATUS_COLOR[sprint.status] }}>
                            {STATUS_LABEL[sprint.status]}
                          </span>
                        </div>
                        {sprint.description && <p className="text-xs mt-0.5 truncate" style={{ color: "oklch(0.55 0.01 260)" }}>{sprint.description}</p>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Button size="sm" className="h-8 text-xs font-semibold flex items-center gap-1.5"
                        style={{ background: "oklch(0.50 0.20 264)" }}
                        onClick={() => setChecklistSprint({
                          id: sprint.id,
                          name: sprint.name,
                          projectName: selectedProject?.name ?? "",
                          clientName: selectedClient?.name ?? "",
                        })}>
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Checklist
                      </Button>
                      {isAdmin && (
                        <>
                          <button onClick={() => setEditingSprint({ id: sprint.id, name: sprint.name, status: sprint.status })} className="p-1.5 rounded-lg hover:bg-gray-100 transition-colors"><Pencil className="w-3.5 h-3.5 text-gray-400" /></button>
                          <button onClick={() => deleteSprintMut.mutate({ id: sprint.id })} className="p-1.5 rounded-lg hover:bg-red-50 transition-colors"><Trash2 className="w-3.5 h-3.5 text-red-400" /></button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </AppLayout>
  );
}
