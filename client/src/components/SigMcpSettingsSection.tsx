import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Cable, CheckCircle2, Loader2, Pencil, Plus, Server, Trash2 } from "lucide-react";
import { toast } from "sonner";

type FormState = {
  name: string;
  endpointUrl: string;
  username: string;
  password: string;
  cardsToolName: string;
  queueToolName: string;
  isActive: boolean;
};

const emptyForm = (): FormState => ({
  name: "SIG Dashboard",
  endpointUrl: "https://sigv3.sudoesteinformatica.com.br/mcp",
  username: "",
  password: "",
  cardsToolName: "",
  queueToolName: "",
  isActive: true,
});

export default function SigMcpSettingsSection() {
  const settingsQuery = trpc.sig.settings.useQuery();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [testProjectId, setTestProjectId] = useState("");
  const [testSprintId, setTestSprintId] = useState("");
  const [discoveredTools, setDiscoveredTools] = useState<Array<{ name: string; description: string }>>([]);

  const done = () => {
    void settingsQuery.refetch();
    setShowForm(false);
    setEditingId(null);
    setForm(emptyForm());
  };
  const create = trpc.sig.createSetting.useMutation({
    onSuccess: () => { done(); toast.success("MCP do SIG cadastrado."); },
    onError: error => toast.error(error.message),
  });
  const update = trpc.sig.updateSetting.useMutation({
    onSuccess: () => { done(); toast.success("MCP do SIG atualizado."); },
    onError: error => toast.error(error.message),
  });
  const remove = trpc.sig.deleteSetting.useMutation({
    onSuccess: () => { void settingsQuery.refetch(); toast.success("Configuração removida."); },
    onError: error => toast.error(error.message),
  });
  const test = trpc.sig.testSetting.useMutation({
    onSuccess: data => {
      setDiscoveredTools(data.tools);
      toast.success(`SIG MCP conectado. ${data.tools.length} ferramenta(s) encontrada(s).`);
    },
    onError: error => toast.error("Falha ao conectar ao SIG MCP: " + error.message),
  });

  const save = () => {
    if (!form.name.trim() || !form.endpointUrl.trim() || !form.username.trim()) {
      toast.error("Preencha nome, URL e usuário do SIG.");
      return;
    }
    if (!editingId && !form.password) {
      toast.error("Informe a senha do SIG.");
      return;
    }
    const common = {
      name: form.name.trim(),
      endpointUrl: form.endpointUrl.trim(),
      username: form.username.trim(),
      cardsToolName: form.cardsToolName.trim() || null,
      queueToolName: form.queueToolName.trim() || null,
      isActive: form.isActive,
      ...(form.password ? { password: form.password } : {}),
    };
    if (editingId) update.mutate({ id: editingId, ...common });
    else create.mutate({ ...common, password: form.password, cardsToolName: common.cardsToolName ?? undefined, queueToolName: common.queueToolName ?? undefined });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-xl border bg-white p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 font-semibold text-slate-900"><Cable className="h-4 w-4 text-cyan-600" /> Integração com o SIG</h2>
          <p className="mt-1 text-xs text-slate-500">Consulta cards diretamente pelo MCP e elimina a exportação manual de arquivos JSON.</p>
        </div>
        <Button size="sm" onClick={() => { setEditingId(null); setForm(emptyForm()); setShowForm(true); }}><Plus className="mr-1 h-4 w-4" /> Novo MCP</Button>
      </div>

      {showForm && (
        <div className="grid gap-4 rounded-xl border border-cyan-100 bg-cyan-50/40 p-5 sm:grid-cols-2">
          <div><Label>Nome</Label><Input className="mt-1" value={form.name} onChange={event => setForm(value => ({ ...value, name: event.target.value }))} /></div>
          <div><Label>URL MCP</Label><Input className="mt-1" type="url" value={form.endpointUrl} onChange={event => setForm(value => ({ ...value, endpointUrl: event.target.value }))} /></div>
          <div><Label>Usuário do SIG</Label><Input className="mt-1" autoComplete="username" value={form.username} onChange={event => setForm(value => ({ ...value, username: event.target.value }))} /></div>
          <div><Label>Senha do SIG</Label><Input className="mt-1" type="password" autoComplete="new-password" value={form.password} onChange={event => setForm(value => ({ ...value, password: event.target.value }))} placeholder={editingId ? "Vazio mantém a senha atual" : "Senha do SIG"} /></div>
          <div><Label>Ferramenta que lista cards (opcional)</Label><Input className="mt-1 font-mono text-xs" value={form.cardsToolName} onChange={event => setForm(value => ({ ...value, cardsToolName: event.target.value }))} placeholder="Ex.: listar_cards_sprint" /></div>
          <div><Label>Fonte da fila de testes</Label><Input className="mt-1 font-mono text-xs" value="API oficial automática (/qa/queue/released)" disabled /><p className="mt-1 text-xs text-slate-500">A versão atual do MCP não expõe a fila; o servidor usa o endpoint oficial do SIG.</p></div>
          <p className="text-xs text-slate-500 sm:col-span-2">Deixe vazio para detecção automática ou use o teste de conexão para descobrir os nomes disponíveis.</p>
          <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={form.isActive} onChange={event => setForm(value => ({ ...value, isActive: event.target.checked }))} /> Usar esta configuração nas importações</label>
          <div className="flex gap-2 sm:col-span-2"><Button onClick={save} disabled={create.isPending || update.isPending}>{(create.isPending || update.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar integração</Button><Button variant="outline" onClick={() => setShowForm(false)}>Cancelar</Button></div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        {(settingsQuery.data ?? []).map(setting => (
          <div key={setting.id} className="rounded-xl border bg-white p-4 shadow-sm">
            <div className="flex justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2"><h3 className="font-semibold text-slate-900">{setting.name}</h3>{setting.isActive ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Em uso</span> : null}</div>
                <p className="mt-1 break-all text-xs text-slate-500">{setting.endpointUrl}</p>
                <p className="mt-2 text-xs text-slate-500">Usuário: {setting.username} · {setting.hasPassword ? "senha armazenada" : "sem senha"}</p>
                <p className="mt-1 text-xs text-slate-400">Cards: {setting.cardsToolName || "detecção automática"}</p><p className="mt-1 text-xs text-slate-400">Fila de testes: API oficial automática</p>
              </div>
              <div className="flex h-fit gap-1">
                <Button size="icon" variant="ghost" onClick={() => { setEditingId(setting.id); setForm({ name: setting.name, endpointUrl: setting.endpointUrl, username: setting.username, password: "", cardsToolName: setting.cardsToolName ?? "", queueToolName: setting.queueToolName ?? "", isActive: Boolean(setting.isActive) }); setShowForm(true); }}><Pencil className="h-4 w-4" /></Button>
                <Button size="icon" variant="ghost" onClick={() => remove.mutate({ id: setting.id })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div>
            </div>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              <div><Label className="text-xs">ID de projeto para testar</Label><Input className="mt-1" value={testProjectId} onChange={event => setTestProjectId(event.target.value)} placeholder="Ex.: 123" /></div>
              <div><Label className="text-xs">ID de sprint para testar</Label><Input className="mt-1" value={testSprintId} onChange={event => setTestSprintId(event.target.value)} placeholder="Ex.: 456" /></div>
            </div>
            <Button className="mt-3" size="sm" variant="outline" disabled={test.isPending || !testProjectId.trim() || !testSprintId.trim()} onClick={() => test.mutate({ id: setting.id, sigProjectId: testProjectId.trim(), sigSprintId: testSprintId.trim() })}>{test.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Server className="mr-1 h-4 w-4" />}Testar e descobrir ferramentas</Button>
          </div>
        ))}
      </div>

      {!settingsQuery.isLoading && !settingsQuery.data?.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhum MCP do SIG cadastrado.</div>}
      {discoveredTools.length > 0 && <div className="rounded-xl border bg-white p-4"><h3 className="text-sm font-semibold text-slate-800">Ferramentas encontradas</h3><div className="mt-3 space-y-2">{discoveredTools.map(tool => <div key={tool.name} className="rounded-lg bg-slate-50 p-3"><code className="text-xs font-semibold text-cyan-700">{tool.name}</code>{tool.description && <p className="mt-1 text-xs text-slate-500">{tool.description}</p>}</div>)}</div></div>}
    </div>
  );
}
