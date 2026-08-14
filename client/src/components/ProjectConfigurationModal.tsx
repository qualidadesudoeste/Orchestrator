import { useEffect, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Code2, FolderSearch, Globe2, KeyRound, Loader2, Pencil, PlugZap, Plus, ShieldCheck, Trash2, UsersRound } from "lucide-react";
import { toast } from "sonner";

const ENVIRONMENT_TYPES = ["PORTAL", "RETAGUARDA", "SITE", "API", "OUTRO"] as const;

type ProjectConfig = {
  id: number;
  name: string;
  repositoryUrl?: string | null;
  repositoryBranch?: string | null;
  sourceCodePath?: string | null;
  sourceCodeIndexedAt?: Date | string | null;
  sourceCodeFileCount?: number | null;
};

const emptyEnvironment = () => ({
  name: "",
  type: "PORTAL" as typeof ENVIRONMENT_TYPES[number],
  loginUrl: "",
  username: "",
  password: "",
  vpnProfileId: "",
});

export default function ProjectConfigurationModal({
  project,
  onClose,
  onUpdated,
}: {
  project: ProjectConfig;
  onClose: () => void;
  onUpdated: () => void;
}) {
  const [repository, setRepository] = useState({
    repositoryUrl: project.repositoryUrl ?? "",
    repositoryBranch: project.repositoryBranch ?? "main",
    sourceCodePath: project.sourceCodePath ?? "",
  });
  const [showEnvironmentForm, setShowEnvironmentForm] = useState(false);
  const [provisioning, setProvisioning] = useState({ endpointUrl: "", token: "", isActive: false });
  const [editingEnvironmentId, setEditingEnvironmentId] = useState<number | null>(null);
  const [environmentForm, setEnvironmentForm] = useState(emptyEnvironment);
  const [memberRoles, setMemberRoles] = useState<Record<number, "NONE" | "VIEWER" | "EXECUTOR">>({});

  const { data: environments = [], refetch: refetchEnvironments } = trpc.testEnvironments.list.useQuery({ projectId: project.id });
  const { data: provisioningConfig, refetch: refetchProvisioning } = trpc.projects.provisioningConfig.useQuery({ projectId: project.id });
  const { data: users = [] } = trpc.users.options.useQuery();
  const { data: members = [], refetch: refetchMembers } = trpc.projects.members.useQuery({ projectId: project.id });
  useEffect(() => {
    setMemberRoles(Object.fromEntries(members.map(member => [member.userId, member.role])));
  }, [members]);
  useEffect(() => {
    if (!provisioningConfig) return;
    setProvisioning(value => ({ ...value, endpointUrl: provisioningConfig.endpointUrl, isActive: provisioningConfig.isActive, token: "" }));
  }, [provisioningConfig]);
  const { data: vpnProfiles = [] } = trpc.parameters.vpnProfiles.useQuery();
  const vpnForEnvironment = (vpnProfileId?: number | null) => vpnProfiles.find(vpn => vpn.id === vpnProfileId);
  const updateProject = trpc.projects.update.useMutation({
    onSuccess: () => {
      onUpdated();
      toast.success("Parâmetros do projeto salvos.");
    },
    onError: error => toast.error(error.message),
  });
  const indexSource = trpc.projects.indexSource.useMutation({
    onSuccess: data => {
      onUpdated();
      toast.success(`Código analisado: ${data.analyzedFileCount} arquivos úteis.`);
    },
    onError: error => toast.error(error.message),
  });
  const saveProvisioning = trpc.projects.saveProvisioningConfig.useMutation({
    onSuccess: () => {
      refetchProvisioning();
      setProvisioning(value => ({ ...value, token: "" }));
      toast.success("Ponte QA salva com credencial criptografada.");
    },
    onError: error => toast.error(error.message),
  });
  const testProvisioning = trpc.projects.testProvisioningConfig.useMutation({
    onSuccess: data => toast.success(data.message || "Ponte QA conectada."),
    onError: error => toast.error(error.message),
  });
  const createEnvironment = trpc.testEnvironments.create.useMutation({
    onSuccess: () => {
      refetchEnvironments();
      setEnvironmentForm(emptyEnvironment());
      setShowEnvironmentForm(false);
      toast.success("Ambiente salvo com credenciais criptografadas.");
    },
    onError: error => toast.error(error.message),
  });
  const updateEnvironment = trpc.testEnvironments.update.useMutation({
    onSuccess: () => {
      refetchEnvironments();
      setEditingEnvironmentId(null);
      setEnvironmentForm(emptyEnvironment());
      setShowEnvironmentForm(false);
      toast.success("Ambiente atualizado.");
    },
    onError: error => toast.error(error.message),
  });
  const prepareVpn = trpc.testEnvironments.prepareVpn.useMutation({
    onSuccess: data => {
      refetchEnvironments();
      toast.success(data.connected ? "VPN preparada e conexão confirmada." : "VPN preparada.");
    },
    onError: error => toast.error(error.message),
  });
  const deleteEnvironment = trpc.testEnvironments.delete.useMutation({
    onSuccess: () => {
      refetchEnvironments();
      toast.success("Ambiente removido.");
    },
    onError: error => toast.error(error.message),
  });
  const saveMembers = trpc.projects.replaceMembers.useMutation({
    onSuccess: () => {
      refetchMembers();
      toast.success("Permissões do projeto atualizadas.");
    },
    onError: error => toast.error(error.message),
  });

  const saveEnvironment = () => {
    if (!environmentForm.name.trim() || !environmentForm.loginUrl.trim()) {
      toast.error("Informe o nome e a URL do ambiente.");
      return;
    }
    const data = {
      name: environmentForm.name.trim(),
      type: environmentForm.type,
      loginUrl: environmentForm.loginUrl.trim(),
      username: environmentForm.username.trim() || null,
      vpnProfileId: environmentForm.vpnProfileId ? Number(environmentForm.vpnProfileId) : null,
      vpnProvider: "NONE" as const,
      ...(environmentForm.password ? { password: environmentForm.password } : {}),
    };
    if (editingEnvironmentId) updateEnvironment.mutate({ id: editingEnvironmentId, ...data });
    else createEnvironment.mutate({ projectId: project.id, ...data, username: data.username ?? undefined });
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-h-[92vh] max-w-4xl overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>Configurar projeto · {project.name}</DialogTitle>
          <p className="text-sm text-slate-500">Ambientes, acessos e repositório ficam vinculados ao projeto. As VPNs são administradas globalmente em Parâmetros.</p>
        </DialogHeader>

        <div className="space-y-6 px-6 pb-6">
          <section className="rounded-xl border border-violet-100 bg-violet-50/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Code2 className="h-4 w-4 text-violet-600" /> Repositório e código-fonte</h3>
                <p className="mt-1 text-xs text-slate-500">A URL identifica o repositório. A pasta local clonada permite analisar o código sem depender da internet.</p>
              </div>
              {project.sourceCodeIndexedAt && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">{project.sourceCodeFileCount ?? 0} arquivos indexados</span>}
            </div>
            <div className="mt-4 grid gap-3">
              <div>
                <Label className="text-xs">URL do repositório</Label>
                <Input className="mt-1" type="url" value={repository.repositoryUrl} onChange={event => setRepository(value => ({ ...value, repositoryUrl: event.target.value }))} placeholder="https://github.com/empresa/sistema" />
              </div>
              <div className="grid gap-3 sm:grid-cols-[180px_1fr]">
                <div>
                  <Label className="text-xs">Branch</Label>
                  <Input className="mt-1" value={repository.repositoryBranch} onChange={event => setRepository(value => ({ ...value, repositoryBranch: event.target.value }))} placeholder="main" />
                </div>
                <div>
                  <Label className="text-xs">Pasta local clonada</Label>
                  <Input className="mt-1" value={repository.sourceCodePath} onChange={event => setRepository(value => ({ ...value, sourceCodePath: event.target.value }))} placeholder="C:\Desenvolvimento\MeuSistema" />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={updateProject.isPending} onClick={() => updateProject.mutate({
                  id: project.id,
                  repositoryUrl: repository.repositoryUrl.trim() || null,
                  repositoryBranch: repository.repositoryBranch.trim() || null,
                  sourceCodePath: repository.sourceCodePath.trim() || null,
                })}>
                  {updateProject.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar repositório
                </Button>
                <Button size="sm" variant="outline" disabled={!repository.sourceCodePath.trim() || indexSource.isPending} onClick={() => indexSource.mutate({ id: project.id, sourceCodePath: repository.sourceCodePath.trim() })}>
                  {indexSource.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <FolderSearch className="mr-1.5 h-4 w-4" />} Analisar código
                </Button>
              </div>
            </div>
          </section>

          <section className="rounded-xl border border-emerald-100 bg-emerald-50/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><PlugZap className="h-4 w-4 text-emerald-600" /> Ponte de provisionamento QA</h3>
                <p className="mt-1 text-xs text-slate-500">Permite ao agente preparar massas complexas, estados temporais, perfis e executar rotinas por uma API segura do sistema testado.</p>
              </div>
              {provisioningConfig?.hasToken && <span className="rounded-full bg-emerald-100 px-2 py-1 text-xs text-emerald-700">Token protegido</span>}
            </div>
            <div className="mt-4 grid gap-3">
              <div>
                <Label className="text-xs">Endpoint da ponte QA</Label>
                <Input className="mt-1" type="url" value={provisioning.endpointUrl} onChange={event => setProvisioning(value => ({ ...value, endpointUrl: event.target.value }))} placeholder="https://hml.sistema.gov.br/api/qa/provision" />
              </div>
              <div>
                <Label className="text-xs">Token da ponte</Label>
                <Input className="mt-1" type="password" autoComplete="new-password" value={provisioning.token} onChange={event => setProvisioning(value => ({ ...value, token: event.target.value }))} placeholder={provisioningConfig?.hasToken ? "Vazio mantém o token atual" : "Token opcional"} />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-700">
                <input type="checkbox" checked={provisioning.isActive} onChange={event => setProvisioning(value => ({ ...value, isActive: event.target.checked }))} />
                Permitir provisionamento automático durante os testes
              </label>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" disabled={!provisioning.endpointUrl.trim() || saveProvisioning.isPending} onClick={() => saveProvisioning.mutate({
                  projectId: project.id,
                  endpointUrl: provisioning.endpointUrl.trim(),
                  ...(provisioning.token ? { token: provisioning.token } : {}),
                  isActive: provisioning.isActive,
                })}>{saveProvisioning.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar ponte QA</Button>
                <Button size="sm" variant="outline" disabled={!provisioningConfig?.isActive || testProvisioning.isPending} onClick={() => testProvisioning.mutate({ projectId: project.id })}>
                  {testProvisioning.isPending ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <PlugZap className="mr-1.5 h-4 w-4" />} Testar conexão
                </Button>
              </div>
              <p className="text-[11px] text-slate-500">A ponte recebe somente o ID do cenário e o objetivo da preparação. O token nunca é enviado para a IA nem exibido novamente.</p>
            </div>
          </section>

          <section className="rounded-xl border border-amber-100 bg-amber-50/40 p-4">
            <div>
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><UsersRound className="h-4 w-4 text-amber-700" /> Acesso ao projeto</h3>
              <p className="mt-1 text-xs text-slate-500">Visualizadores consultam dados. Executores também podem iniciar e controlar automações.</p>
            </div>
            <div className="mt-3 max-h-52 space-y-2 overflow-y-auto">
              {users.map(user => (
                <div key={user.id} className="grid grid-cols-[1fr_150px] items-center gap-3 rounded-lg border bg-white px-3 py-2 text-xs">
                  <div className="min-w-0"><p className="truncate font-medium text-slate-800">{user.name || user.username}</p><p className="truncate text-slate-500">{user.username}</p></div>
                  <Select value={memberRoles[user.id] ?? "NONE"} onValueChange={role => setMemberRoles(current => ({ ...current, [user.id]: role as "NONE" | "VIEWER" | "EXECUTOR" }))}>
                    <SelectTrigger className="h-8"><SelectValue /></SelectTrigger>
                    <SelectContent><SelectItem value="NONE">Sem acesso</SelectItem><SelectItem value="VIEWER">Visualizador</SelectItem><SelectItem value="EXECUTOR">Executor</SelectItem></SelectContent>
                  </Select>
                </div>
              ))}
            </div>
            <Button className="mt-3" size="sm" disabled={saveMembers.isPending} onClick={() => saveMembers.mutate({
              projectId: project.id,
              members: Object.entries(memberRoles).filter(([, role]) => role !== "NONE").map(([userId, role]) => ({ userId: Number(userId), role: role as "VIEWER" | "EXECUTOR" })),
            })}>{saveMembers.isPending && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />} Salvar acessos</Button>
          </section>

          <section className="rounded-xl border border-blue-100 bg-blue-50/40 p-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-800"><Globe2 className="h-4 w-4 text-blue-600" /> Ambientes e acessos</h3>
                <p className="mt-1 text-xs text-slate-500">Cadastre portal, retaguarda, site ou API. Usuário e senha são opcionais; a VPN é apenas associada a partir dos Parâmetros globais.</p>
              </div>
              <Button size="sm" variant="outline" onClick={() => { setEditingEnvironmentId(null); setEnvironmentForm(emptyEnvironment()); setShowEnvironmentForm(true); }}><Plus className="mr-1 h-4 w-4" /> Ambiente</Button>
            </div>

            <div className="mt-3 space-y-2">
              {environments.map(environment => (
                <div key={environment.id} className="flex items-start justify-between gap-3 rounded-lg border bg-white p-3">
                  <div className="min-w-0 text-xs">
                    <p className="font-semibold text-slate-800">{environment.name} <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 font-normal text-slate-500">{environment.type}</span></p>
                    <p className="mt-1 break-all text-slate-500">{environment.loginUrl} · {environment.username ? `usuário ${environment.username}` : "sem autenticação"}</p>
                    {vpnForEnvironment(environment.vpnProfileId) && <p className="mt-1 flex items-center gap-1 text-amber-700"><ShieldCheck className="h-3.5 w-3.5" /> VPN {vpnForEnvironment(environment.vpnProfileId)?.name} · perfil {vpnForEnvironment(environment.vpnProfileId)?.profileName}</p>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {environment.vpnProfileId && <Button title="Preparar e testar VPN" size="icon" variant="ghost" className="h-7 w-7 text-amber-700" disabled={prepareVpn.isPending} onClick={() => prepareVpn.mutate({ id: environment.id })}>{prepareVpn.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ShieldCheck className="h-3.5 w-3.5" />}</Button>}
                    <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => {
                      setEditingEnvironmentId(environment.id);
                      setEnvironmentForm({
                        name: environment.name,
                        type: environment.type,
                        loginUrl: environment.loginUrl,
                        username: environment.username ?? "",
                        password: "",
                        vpnProfileId: environment.vpnProfileId ? String(environment.vpnProfileId) : "",
                      });                      setShowEnvironmentForm(true);
                    }}><Pencil className="h-3.5 w-3.5" /></Button>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-red-500" onClick={() => deleteEnvironment.mutate({ id: environment.id })}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </div>
                </div>
              ))}
              {environments.length === 0 && <p className="rounded-lg border border-dashed bg-white p-4 text-center text-xs text-slate-500">Nenhum ambiente cadastrado para este projeto.</p>}
            </div>

            {showEnvironmentForm && (
              <div className="mt-4 grid gap-3 rounded-lg border bg-white p-4 sm:grid-cols-2">
                <Input placeholder="Nome: Portal Homologação" value={environmentForm.name} onChange={event => setEnvironmentForm(value => ({ ...value, name: event.target.value }))} />
                <Select value={environmentForm.type} onValueChange={type => setEnvironmentForm(value => ({ ...value, type: type as typeof value.type }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent>{ENVIRONMENT_TYPES.map(type => <SelectItem key={type} value={type}>{type}</SelectItem>)}</SelectContent></Select>
                <Input className="sm:col-span-2" type="url" placeholder="URL do ambiente ou login" value={environmentForm.loginUrl} onChange={event => setEnvironmentForm(value => ({ ...value, loginUrl: event.target.value }))} />
                <Input placeholder="Usuário do sistema (opcional)" value={environmentForm.username} onChange={event => setEnvironmentForm(value => ({ ...value, username: event.target.value }))} />
                <Input type="password" autoComplete="new-password" placeholder={editingEnvironmentId ? "Nova senha (vazio mantém a atual)" : "Senha do sistema (opcional)"} value={environmentForm.password} onChange={event => setEnvironmentForm(value => ({ ...value, password: event.target.value }))} />
                <div className="sm:col-span-2">
                  <Label className="text-xs">VPN necessária</Label>
                  <Select value={environmentForm.vpnProfileId || "NONE"} onValueChange={vpnProfileId => setEnvironmentForm(value => ({ ...value, vpnProfileId: vpnProfileId === "NONE" ? "" : vpnProfileId }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Não utiliza VPN" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NONE">Não utiliza VPN</SelectItem>
                      {vpnProfiles.filter(vpn => vpn.isActive).map(vpn => <SelectItem key={vpn.id} value={String(vpn.id)}>{vpn.name} · {vpn.provider}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <p className="mt-1 text-[11px] text-slate-500">Usuário, senha e arquivos da VPN são mantidos em Administração → Parâmetros.</p>
                </div>
                <div className="flex gap-2 sm:col-span-2">
                  <Button size="sm" disabled={createEnvironment.isPending || updateEnvironment.isPending} onClick={saveEnvironment}>{(createEnvironment.isPending || updateEnvironment.isPending) ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <KeyRound className="mr-1.5 h-4 w-4" />} {editingEnvironmentId ? "Atualizar ambiente" : "Salvar ambiente"}</Button>
                  <Button size="sm" variant="outline" onClick={() => { setShowEnvironmentForm(false); setEditingEnvironmentId(null); setEnvironmentForm(emptyEnvironment()); }}>Cancelar</Button>
                </div>
              </div>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
