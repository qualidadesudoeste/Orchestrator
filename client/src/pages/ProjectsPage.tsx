import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Code2, FolderSearch, Globe2, KeyRound, Loader2, Plus, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";

const ENVIRONMENT_TYPES = ["PORTAL", "RETAGUARDA", "SITE", "API", "OUTRO"] as const;
const VPN_PROVIDERS = ["NONE", "COGEL", "SEFAZ", "OUTRA"] as const;
const emptyEnvironmentForm = () => ({
  name: "",
  type: "PORTAL" as typeof ENVIRONMENT_TYPES[number],
  loginUrl: "",
  username: "",
  password: "",
  vpnProvider: "NONE" as typeof VPN_PROVIDERS[number],
  vpnProfileName: "",
  vpnUsername: "",
  vpnPassword: "",
  vpnAutoConnect: true,
});

function EnvironmentManager({ projectId }: { projectId: number }) {
  const [showForm, setShowForm] = useState(false);
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyEnvironmentForm);
  const { data: environments = [], refetch } = trpc.testEnvironments.list.useQuery({ projectId });
  const createMutation = trpc.testEnvironments.create.useMutation({
    onSuccess: () => {
      refetch();
      setShowForm(false);
      setForm(emptyEnvironmentForm());
      toast.success("Ambiente salvo com a senha criptografada.");
    },
    onError: error => toast.error(error.message),
  });
  const deleteMutation = trpc.testEnvironments.delete.useMutation({
    onSuccess: () => { refetch(); toast.success("Ambiente removido."); },
    onError: error => toast.error(error.message),
  });
  const updateEnvironmentMutation = trpc.testEnvironments.update.useMutation({
    onSuccess: () => {
      refetch();
      setShowForm(false);
      setEditingEnvironmentId(null);
      setForm(emptyEnvironmentForm());
      toast.success("Ambiente atualizado.");
    },
    onError: error => toast.error(error.message),
  });

  const startNewEnvironment = () => {
    setEditingEnvironmentId(null);
    setForm(emptyEnvironmentForm());
    setShowForm(true);
  };

  return (
    <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50/50 p-3">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
          <Globe2 className="h-4 w-4 text-blue-600" /> Ambientes, acessos e VPN
        </div>
        <Button size="sm" variant="outline" onClick={startNewEnvironment}>
          <Plus className="mr-1 h-3.5 w-3.5" /> Ambiente
        </Button>
      </div>
      <p className="mt-1 text-xs text-slate-500">Cadastre portal, retaguarda, site ou API. Usuário, senha e VPN ficam vinculados ao projeto.</p>
      {environments.length > 0 && (
        <div className="mt-2 space-y-2">
          {environments.map(environment => (
            <div key={environment.id} className="flex items-center justify-between rounded-md bg-white px-3 py-2 text-xs">
              <div>
                <span className="font-semibold text-slate-700">{environment.name}</span>
                <span className="ml-2 rounded bg-slate-100 px-1.5 py-0.5 text-slate-500">{environment.type}</span>
                <p className="mt-0.5 text-slate-500">{environment.loginUrl} · {environment.username ? `usuário ${environment.username}` : "sem autenticação"}</p>
                {environment.vpnProvider !== "NONE" && (
                  <p className="mt-1 flex items-center gap-1 text-amber-700">
                    <ShieldCheck className="h-3.5 w-3.5" /> VPN {environment.vpnProvider} · perfil {environment.vpnProfileName}
                  </p>
                )}
              </div>
              <div className="flex gap-1">
                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                  setEditingEnvironmentId(environment.id);
                  setForm({
                    name: environment.name,
                    type: environment.type,
                    loginUrl: environment.loginUrl,
                    username: environment.username ?? "",
                    password: "",
                    vpnProvider: environment.vpnProvider,
                    vpnProfileName: environment.vpnProfileName ?? "",
                    vpnUsername: environment.vpnUsername ?? "",
                    vpnPassword: "",
                    vpnAutoConnect: Boolean(environment.vpnAutoConnect),
                  });
                  setShowForm(true);
                }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteMutation.mutate({ id: environment.id })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <div className="mt-3 grid gap-2 rounded-md border bg-white p-3 sm:grid-cols-2">
          <Input placeholder="Nome: Portal HML" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          <Select value={form.type} onValueChange={type => setForm(f => ({ ...f, type: type as typeof form.type }))}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>{ENVIRONMENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent>
          </Select>
          <Input className="sm:col-span-2" type="url" placeholder="URL de login" value={form.loginUrl} onChange={e => setForm(f => ({ ...f, loginUrl: e.target.value }))} />
          <Input placeholder="Usuário de testes" value={form.username} onChange={e => setForm(f => ({ ...f, username: e.target.value }))} />
          <Input type="password" placeholder="Senha de testes" autoComplete="new-password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
          <div className="sm:col-span-2 mt-1 rounded-md border border-amber-200 bg-amber-50 p-3">
            <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-amber-800">
              <ShieldCheck className="h-4 w-4" /> Acesso por VPN
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Select value={form.vpnProvider} onValueChange={provider => setForm(f => ({
                ...f,
                vpnProvider: provider as typeof f.vpnProvider,
                vpnProfileName: provider === "COGEL" ? "Prodeb" : provider === "SEFAZ" ? "Sefaz" : provider === "NONE" ? "" : f.vpnProfileName,
              }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="NONE">Não utiliza VPN</SelectItem>
                  <SelectItem value="COGEL">Cogel</SelectItem>
                  <SelectItem value="SEFAZ">Sefaz</SelectItem>
                  <SelectItem value="OUTRA">Outra VPN</SelectItem>
                </SelectContent>
              </Select>
              {form.vpnProvider !== "NONE" && (
                <Input placeholder="Perfil no FortiClient" value={form.vpnProfileName} onChange={e => setForm(f => ({ ...f, vpnProfileName: e.target.value }))} />
              )}
              {form.vpnProvider !== "NONE" && (
                <>
                  <Input placeholder="Usuário da VPN" value={form.vpnUsername} onChange={e => setForm(f => ({ ...f, vpnUsername: e.target.value }))} />
                  <Input type="password" placeholder="Senha da VPN" autoComplete="new-password" value={form.vpnPassword} onChange={e => setForm(f => ({ ...f, vpnPassword: e.target.value }))} />
                  <label className="flex items-center gap-2 text-xs text-slate-700 sm:col-span-2">
                    <input type="checkbox" checked={form.vpnAutoConnect} onChange={e => setForm(f => ({ ...f, vpnAutoConnect: e.target.checked }))} />
                    Conectar automaticamente antes da automação
                  </label>
                </>
              )}
            </div>
          </div>
          <div className="flex gap-2 sm:col-span-2">
            <Button size="sm" disabled={createMutation.isPending || updateEnvironmentMutation.isPending || !form.name || !form.loginUrl || (form.vpnProvider !== "NONE" && !form.vpnProfileName)} onClick={() => {
              if (editingEnvironmentId) {
                const { password, vpnPassword, ...data } = form;
                updateEnvironmentMutation.mutate({
                  id: editingEnvironmentId,
                  ...data,
                  ...(password ? { password } : {}),
                  ...(vpnPassword ? { vpnPassword } : {}),
                });
              } else createMutation.mutate({ projectId, ...form });
            }}>
              {(createMutation.isPending || updateEnvironmentMutation.isPending) ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1 h-4 w-4" />} {editingEnvironmentId ? "Atualizar ambiente" : "Salvar ambiente"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => { setShowForm(false); setEditingEnvironmentId(null); }}>Cancelar</Button>
          </div>
          <p className="text-[11px] text-slate-500 sm:col-span-2">Usuário e senha do sistema são opcionais. Credenciais do sistema e da VPN são criptografadas e nunca exibidas novamente. Ao editar, deixe a senha vazia para manter a atual.</p>
        </div>
      )}
    </div>
  );
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const isCoordinator = user?.role === "admin";

  const { data: clients } = trpc.clients.list.useQuery();
  const { data: projects, refetch } = trpc.projects.list.useQuery({ clientId: undefined });
  const createMutation = trpc.projects.create.useMutation({ onSuccess: () => { refetch(); setForm({ name: "", description: "", clientId: "" }); toast.success("Projeto criado!"); } });
  const updateMutation = trpc.projects.update.useMutation({ onSuccess: () => { refetch(); setEditing(null); toast.success("Projeto atualizado!"); } });
  const deleteMutation = trpc.projects.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Projeto removido!"); } });
  const indexSourceMutation = trpc.projects.indexSource.useMutation({
    onSuccess: data => {
      refetch();
      setEditing(null);
      toast.success(`Código analisado: ${data.analyzedFileCount} arquivos úteis de ${data.fileCount} encontrados.`);
    },
    onError: error => toast.error(error.message),
  });

  const [form, setForm] = useState({ name: "", description: "", clientId: "" });
  const [editing, setEditing] = useState<{
    id: number;
    name: string;
    description: string;
    repositoryUrl: string;
    repositoryBranch: string;
    sourceCodePath: string;
  } | null>(null);

  const clientMap = Object.fromEntries((clients ?? []).map(c => [c.id, c.name]));

  useEffect(() => {
    const requestedId = Number(new URLSearchParams(window.location.search).get("projectId"));
    if (!Number.isInteger(requestedId) || requestedId <= 0 || !projects?.length) return;
    const project = projects.find(item => item.id === requestedId);
    if (!project) return;
    setEditing({
      id: project.id,
      name: project.name,
      description: project.description ?? "",
      repositoryUrl: project.repositoryUrl ?? "",
      repositoryBranch: project.repositoryBranch ?? "main",
      sourceCodePath: project.sourceCodePath ?? "",
    });
    window.history.replaceState({}, "", "/projects");
  }, [projects]);

  if (!isCoordinator) return <div className="p-8 text-center text-sm text-gray-500">Acesso restrito ao Coordenador.</div>;

  return (
    <AppLayout>
      <main className="container py-8 max-w-5xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-slate-900">Cadastro de Projetos</h1>
          <p className="mt-1 text-sm text-slate-500">Centralize os dados do projeto, ambientes de teste, acessos, VPN e repositório do código.</p>
        </div>
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">Novo Projeto</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Select value={form.clientId} onValueChange={v => setForm(f => ({ ...f, clientId: v }))}>
              <SelectTrigger><SelectValue placeholder="Selecionar cliente *" /></SelectTrigger>
              <SelectContent>{clients?.map(c => <SelectItem key={c.id} value={String(c.id)}>{c.name}</SelectItem>)}</SelectContent>
            </Select>
            <Input placeholder="Nome do projeto *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <Button onClick={() => createMutation.mutate({ name: form.name, description: form.description, clientId: parseInt(form.clientId) })}
              disabled={!form.name || !form.clientId || createMutation.isPending} style={{ background: "oklch(0.50 0.20 264)" }}>
              <Plus className="w-4 h-4 mr-1" /> {createMutation.isPending ? "Criando..." : "Criar Projeto"}
            </Button>
          </CardContent>
        </Card>
        <div className="space-y-3">
          {projects?.map(project => (
            <Card key={project.id}>
              <CardContent className="p-4">
                {editing?.id === project.id ? (
                  <div className="space-y-2">
                    <Input value={editing.name} onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : null)} />
                    <Input value={editing.description} onChange={e => setEditing(ed => ed ? { ...ed, description: e.target.value } : null)} />
                    <div className="rounded-lg border border-violet-100 bg-violet-50/50 p-4 space-y-3">
                      <div>
                        <div className="flex items-center gap-2 text-sm font-semibold text-slate-800">
                          <Code2 className="h-4 w-4 text-violet-600" /> Repositório e código-fonte
                        </div>
                        <p className="mt-1 text-xs text-slate-500">A URL identifica a origem do código. A pasta local clonada permite que o agente analise os arquivos sem depender da internet.</p>
                      </div>
                      <Input type="url" value={editing.repositoryUrl} onChange={e => setEditing(ed => ed ? { ...ed, repositoryUrl: e.target.value } : null)} placeholder="URL do repositório: https://github.com/empresa/sistema" />
                      <div className="grid gap-2 sm:grid-cols-[180px_1fr]">
                        <Input value={editing.repositoryBranch} onChange={e => setEditing(ed => ed ? { ...ed, repositoryBranch: e.target.value } : null)} placeholder="Branch: main" />
                        <Input value={editing.sourceCodePath} onChange={e => setEditing(ed => ed ? { ...ed, sourceCodePath: e.target.value } : null)} placeholder="Pasta local clonada: C:\Desenvolvimento\MeuSistema" />
                      </div>
                      <p className="text-xs text-slate-500">A análise é somente leitura e ignora .env, chaves, node_modules e arquivos de build.</p>
                    </div>
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateMutation.mutate({
                        id: editing.id,
                        name: editing.name,
                        description: editing.description,
                        repositoryUrl: editing.repositoryUrl.trim() || null,
                        repositoryBranch: editing.repositoryBranch.trim() || null,
                        sourceCodePath: editing.sourceCodePath.trim() || null,
                      })} style={{ background: "oklch(0.50 0.20 264)" }}>Salvar</Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={!editing.sourceCodePath.trim() || indexSourceMutation.isPending}
                        onClick={() => indexSourceMutation.mutate({ id: editing.id, sourceCodePath: editing.sourceCodePath.trim() })}
                      >
                        {indexSourceMutation.isPending
                          ? <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                          : <FolderSearch className="w-4 h-4 mr-1" />}
                        Analisar código
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-semibold text-sm">{project.name}</p>
                      <p className="text-xs text-gray-400 mt-0.5">Cliente: {clientMap[project.clientId] ?? "—"}</p>
                      {project.description && <p className="text-xs text-gray-500 mt-0.5">{project.description}</p>}
                      <div className="mt-3 rounded-md border border-violet-100 bg-violet-50/40 p-3 text-xs">
                        <p className="font-semibold text-slate-700">Repositório e código-fonte</p>
                        {project.repositoryUrl ? (
                          <a href={project.repositoryUrl} target="_blank" rel="noreferrer" className="mt-1 block break-all text-violet-700 hover:underline">
                            {project.repositoryUrl}{project.repositoryBranch ? ` · branch ${project.repositoryBranch}` : ""}
                          </a>
                        ) : <p className="mt-1 text-slate-400">URL do repositório não configurada.</p>}
                        {project.sourceCodePath ? (
                          <div className="mt-2 flex items-center gap-1.5 text-emerald-700">
                            <Code2 className="h-3.5 w-3.5" />
                            {project.sourceCodeIndexedAt ? `${project.sourceCodeFileCount ?? 0} arquivos indexados localmente` : "Pasta local configurada; análise pendente"}
                          </div>
                        ) : <p className="mt-2 text-slate-400">Pasta local ainda não configurada.</p>}
                      </div>
                      <EnvironmentManager projectId={project.id} />
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => setEditing({
                        id: project.id,
                        name: project.name,
                        description: project.description ?? "",
                        repositoryUrl: project.repositoryUrl ?? "",
                        repositoryBranch: project.repositoryBranch ?? "main",
                        sourceCodePath: project.sourceCodePath ?? "",
                      })}><Pencil className="mr-1 h-3.5 w-3.5" /> Configurar projeto</Button>
                      <Button size="icon" variant="ghost" className="w-7 h-7 text-red-500 hover:text-red-700" onClick={() => deleteMutation.mutate({ id: project.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {projects?.length === 0 && <p className="text-sm text-center text-gray-400 py-8">Nenhum projeto cadastrado.</p>}
        </div>
      </main>
  </AppLayout>
  );
}
