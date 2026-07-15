import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, ClipboardCheck } from "lucide-react";
import AppLayout from "@/components/AppLayout";
import { ChecklistModal } from "@/components/ChecklistModal";

const STATUS_LABELS: Record<string, string> = { pending: "Pendente", in_progress: "Em Teste", in_review: "Em Revisão", done: "Concluída" };
const STATUS_COLORS: Record<string, string> = { pending: "#94a3b8", in_progress: "oklch(0.55 0.18 264)", in_review: "oklch(0.55 0.20 45)", done: "oklch(0.50 0.18 145)" };

export default function SprintsPage() {
  const { user } = useAuth();
  const isCoordinator = user?.role === "admin";

  const { data: projects } = trpc.projects.list.useQuery({ clientId: undefined });
  const { data: clients } = trpc.clients.list.useQuery(undefined);
  const { data: sprints, refetch } = trpc.sprints.list.useQuery({ projectId: undefined });
  const createMutation = trpc.sprints.create.useMutation({ onSuccess: () => { refetch(); setForm({ name: "", description: "", projectId: "" }); toast.success("Sprint criada!"); } });
  const updateMutation = trpc.sprints.update.useMutation({ onSuccess: () => { refetch(); setEditing(null); toast.success("Sprint atualizada!"); } });
  const deleteMutation = trpc.sprints.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Sprint removida!"); } });

  const [form, setForm] = useState({ name: "", description: "", projectId: "" });
  const [editing, setEditing] = useState<{ id: number; name: string; description: string; status: string } | null>(null);
  const [modalSprint, setModalSprint] = useState<{ id: number; name: string; projectName: string; clientName: string } | null>(null);

  const projectMap = Object.fromEntries((projects ?? []).map(p => [p.id, p.name]));
  const allProjects = projects ?? [];
  const allClients = clients ?? [];

  const openChecklist = (sprint: NonNullable<typeof sprints>[number]) => {
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
        {/* Formulário de criação — apenas coordenador */}
        {isCoordinator && (
          <Card className="mb-6">
            <CardHeader><CardTitle className="text-base">Nova Sprint</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Select value={form.projectId} onValueChange={v => setForm(f => ({ ...f, projectId: v }))}>
                <SelectTrigger><SelectValue placeholder="Selecionar projeto *" /></SelectTrigger>
                <SelectContent>{projects?.map(p => <SelectItem key={p.id} value={String(p.id)}>{p.name}</SelectItem>)}</SelectContent>
              </Select>
              <Input placeholder="Nome da sprint *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
              <Input placeholder="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
              <Button onClick={() => createMutation.mutate({ name: form.name, description: form.description, projectId: parseInt(form.projectId) })}
                disabled={!form.name || !form.projectId || createMutation.isPending} style={{ background: "oklch(0.50 0.20 264)" }}>
                <Plus className="w-4 h-4 mr-1" /> {createMutation.isPending ? "Criando..." : "Criar Sprint"}
              </Button>
            </CardContent>
          </Card>
        )}

        {/* Lista de sprints — visível para todos */}
        <div className="space-y-3">
          {!isCoordinator && (
            <p className="text-xs text-gray-400 mb-4">Selecione uma sprint abaixo para executar o checklist do procedimento de testes.</p>
          )}
          {sprints?.map(sprint => (
            <Card key={sprint.id} className="hover:shadow-md transition-shadow">
              <CardContent className="p-4">
                {editing?.id === sprint.id ? (
                  <div className="space-y-2">
                    <Input value={editing.name} onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : null)} />
                    <Input value={editing.description} onChange={e => setEditing(ed => ed ? { ...ed, description: e.target.value } : null)} />
                    <Select value={editing.status} onValueChange={v => setEditing(ed => ed ? { ...ed, status: v } : null)}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{Object.entries(STATUS_LABELS).map(([k, v]) => <SelectItem key={k} value={k}>{v}</SelectItem>)}</SelectContent>
                    </Select>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateMutation.mutate({ id: editing.id, name: editing.name, description: editing.description, status: editing.status as any })} style={{ background: "oklch(0.50 0.20 264)" }}>Salvar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-semibold text-sm">{sprint.name}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: `${STATUS_COLORS[sprint.status]}22`, color: STATUS_COLORS[sprint.status] }}>{STATUS_LABELS[sprint.status]}</span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">Projeto: {projectMap[sprint.projectId] ?? "—"}</p>
                      {sprint.description && <p className="text-xs text-gray-500 mt-0.5">{sprint.description}</p>}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      {/* Botão principal: abrir checklist */}
                      <Button
                        size="sm"
                        onClick={() => openChecklist(sprint)}
                        className="flex items-center gap-1.5 font-semibold"
                        style={{ background: "oklch(0.50 0.20 264)", color: "white" }}
                      >
                        <ClipboardCheck className="w-3.5 h-3.5" />
                        Abrir Checklist
                      </Button>
                      {/* Ações de edição — apenas coordenador */}
                      {isCoordinator && (
                        <>
                          <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setEditing({ id: sprint.id, name: sprint.name, description: sprint.description ?? "", status: sprint.status })}><Pencil className="w-3.5 h-3.5" /></Button>
                          <Button size="icon" variant="ghost" className="w-7 h-7 text-red-500 hover:text-red-700" onClick={() => deleteMutation.mutate({ id: sprint.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {sprints?.length === 0 && (
            <div className="text-center py-12">
              <ClipboardCheck className="w-10 h-10 mx-auto mb-3 text-gray-300" />
              <p className="text-sm text-gray-400">Nenhuma sprint cadastrada.</p>
              {isCoordinator && <p className="text-xs text-gray-400 mt-1">Crie uma sprint acima para começar.</p>}
              {!isCoordinator && <p className="text-xs text-gray-400 mt-1">Aguarde o Coordenador cadastrar as sprints.</p>}
            </div>
          )}
        </div>
      </main>
  </AppLayout>
  );
}
