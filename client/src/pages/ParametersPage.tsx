import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { Bot, CheckCircle2, KeyRound, Loader2, Pencil, Plus, ServerCog, ShieldCheck, Trash2, Upload } from "lucide-react";

type VpnForm = {
  name: string;
  provider: "COGEL" | "SEFAZ" | "OUTRA";
  profileName: string;
  username: string;
  password: string;
  autoConnect: boolean;
  connectionStrategy: "AUTO" | "CLI" | "AUTOCONNECT";
  configFileName: string;
  configBase64: string;
  configPassword: string;
  installerUrl: string;
  installerSha256: string;
  verificationUrl: string;
  isActive: boolean;
};

type AiForm = {
  name: string;
  provider: "OPENAI" | "GEMINI" | "GROQ" | "CUSTOM";
  apiUrl: string;
  model: string;
  apiKey: string;
  isActive: boolean;
};

const emptyVpn = (): VpnForm => ({
  name: "", provider: "COGEL", profileName: "Prodeb", username: "", password: "",
  autoConnect: true, connectionStrategy: "AUTO", configFileName: "", configBase64: "",
  configPassword: "", installerUrl: "", installerSha256: "", verificationUrl: "", isActive: true,
});

const AI_DEFAULTS: Record<AiForm["provider"], Pick<AiForm, "apiUrl" | "model">> = {
  OPENAI: { apiUrl: "https://api.openai.com", model: "gpt-4o-mini" },
  GEMINI: { apiUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-2.0-flash" },
  GROQ: { apiUrl: "https://api.groq.com/openai", model: "llama-3.3-70b-versatile" },
  CUSTOM: { apiUrl: "", model: "" },
};

const emptyAi = (): AiForm => ({ name: "OpenAI principal", provider: "OPENAI", ...AI_DEFAULTS.OPENAI, apiKey: "", isActive: true });

async function fileToBase64(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return dataUrl.split(",")[1] ?? "";
}

export default function ParametersPage() {
  const [section, setSection] = useState<"vpn" | "ai" | "execution">("vpn");
  const [vpnForm, setVpnForm] = useState<VpnForm>(emptyVpn);
  const [vpnEditingId, setVpnEditingId] = useState<number | null>(null);
  const [showVpnForm, setShowVpnForm] = useState(false);
  const [aiForm, setAiForm] = useState<AiForm>(emptyAi);
  const [aiEditingId, setAiEditingId] = useState<number | null>(null);
  const [showAiForm, setShowAiForm] = useState(false);

  const vpnQuery = trpc.parameters.vpnProfiles.useQuery();
  const aiQuery = trpc.parameters.aiProviders.useQuery();
  const executionQueueQuery = trpc.parameters.executionQueue.useQuery(undefined, { refetchInterval: 5_000 });
  const doneVpn = () => { void vpnQuery.refetch(); setVpnForm(emptyVpn()); setVpnEditingId(null); setShowVpnForm(false); };
  const doneAi = () => { void aiQuery.refetch(); setAiForm(emptyAi()); setAiEditingId(null); setShowAiForm(false); };
  const createVpn = trpc.parameters.createVpnProfile.useMutation({ onSuccess: () => { doneVpn(); toast.success("VPN global cadastrada."); }, onError: e => toast.error(e.message) });
  const updateVpn = trpc.parameters.updateVpnProfile.useMutation({ onSuccess: () => { doneVpn(); toast.success("VPN global atualizada."); }, onError: e => toast.error(e.message) });
  const deleteVpn = trpc.parameters.deleteVpnProfile.useMutation({ onSuccess: () => { void vpnQuery.refetch(); toast.success("VPN removida."); }, onError: e => toast.error(e.message) });
  const testVpn = trpc.parameters.testVpnProfile.useMutation({ onSuccess: data => toast.success(data.connected ? "VPN conectada e validada." : "VPN preparada."), onError: e => toast.error(e.message) });
  const createAi = trpc.parameters.createAiProvider.useMutation({ onSuccess: () => { doneAi(); toast.success("Provedor de IA cadastrado."); }, onError: e => toast.error(e.message) });
  const updateAi = trpc.parameters.updateAiProvider.useMutation({ onSuccess: () => { doneAi(); toast.success("Provedor de IA atualizado."); }, onError: e => toast.error(e.message) });
  const deleteAi = trpc.parameters.deleteAiProvider.useMutation({ onSuccess: () => { void aiQuery.refetch(); toast.success("Provedor removido."); }, onError: e => toast.error(e.message) });
  const testAi = trpc.parameters.testAiProvider.useMutation({ onSuccess: data => toast.success(`API validada. ${data.modelCount} modelo(s) disponivel(is).`), onError: e => toast.error(e.message) });
  const updateWorker = trpc.parameters.updateExecutionWorker.useMutation({
    onSuccess: () => { void executionQueueQuery.refetch(); toast.success("Capacidade do worker atualizada."); },
    onError: e => toast.error(e.message),
  });

  const saveVpn = () => {
    if (!vpnForm.name.trim() || !vpnForm.profileName.trim()) return toast.error("Informe o nome e o perfil da VPN.");
    if (Boolean(vpnForm.installerUrl.trim()) !== Boolean(vpnForm.installerSha256.trim())) return toast.error("Informe juntos a URL e o SHA-256 do instalador.");
    const common = {
      name: vpnForm.name.trim(), provider: vpnForm.provider, profileName: vpnForm.profileName.trim(), username: vpnForm.username.trim() || null,
      autoConnect: vpnForm.autoConnect, connectionStrategy: vpnForm.connectionStrategy,
      installerUrl: vpnForm.installerUrl.trim() || null, installerSha256: vpnForm.installerSha256.trim() || null,
      verificationUrl: vpnForm.verificationUrl.trim() || null, isActive: vpnForm.isActive,
      ...(vpnForm.password ? { password: vpnForm.password } : {}),
      ...(vpnForm.configBase64 ? { configBase64: vpnForm.configBase64, configFileName: vpnForm.configFileName } : {}),
      ...(vpnForm.configPassword ? { configPassword: vpnForm.configPassword } : {}),
    };
    if (vpnEditingId) updateVpn.mutate({ id: vpnEditingId, ...common });
    else createVpn.mutate({ ...common, username: common.username ?? undefined, installerUrl: common.installerUrl ?? undefined, installerSha256: common.installerSha256 ?? undefined, verificationUrl: common.verificationUrl ?? undefined });
  };

  const saveAi = () => {
    if (!aiForm.name.trim() || !aiForm.apiUrl.trim() || !aiForm.model.trim()) return toast.error("Preencha nome, URL e modelo.");
    const common = { name: aiForm.name.trim(), provider: aiForm.provider, apiUrl: aiForm.apiUrl.trim(), model: aiForm.model.trim(), isActive: aiForm.isActive, ...(aiForm.apiKey ? { apiKey: aiForm.apiKey } : {}) };
    if (aiEditingId) updateAi.mutate({ id: aiEditingId, ...common }); else createAi.mutate(common);
  };

  return (
    <AppLayout>
      <div className="mx-auto w-full max-w-6xl p-6">
        <div className="mb-6">
          <h1 className="flex items-center gap-2 text-2xl font-bold text-slate-900"><ServerCog className="h-6 w-6 text-blue-600" /> Parâmetros</h1>
          <p className="mt-1 text-sm text-slate-500">Configurações globais reutilizadas por todos os projetos e automações.</p>
        </div>
        <div className="mb-5 flex gap-2 border-b">
          <button className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${section === "vpn" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`} onClick={() => setSection("vpn")}><ShieldCheck className="h-4 w-4" /> VPNs</button>
          <button className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${section === "ai" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`} onClick={() => setSection("ai")}><Bot className="h-4 w-4" /> Inteligencia Artificial</button>
          <button className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-semibold ${section === "execution" ? "border-blue-600 text-blue-700" : "border-transparent text-slate-500"}`} onClick={() => setSection("execution")}><ServerCog className="h-4 w-4" /> Execucao</button>
        </div>

        {section === "vpn" && <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-xl border bg-white p-5 shadow-sm">
            <div><h2 className="font-semibold text-slate-900">VPNs globais</h2><p className="mt-1 text-xs text-slate-500">Cadastre uma vez e apenas associe a VPN aos ambientes que precisam dela.</p></div>
            <Button size="sm" onClick={() => { setVpnForm(emptyVpn()); setVpnEditingId(null); setShowVpnForm(true); }}><Plus className="mr-1 h-4 w-4" /> Nova VPN</Button>
          </div>
          {showVpnForm && <div className="grid gap-4 rounded-xl border border-blue-100 bg-blue-50/40 p-5 sm:grid-cols-2">
            <div><Label>Nome de identificação</Label><Input className="mt-1" value={vpnForm.name} onChange={e => setVpnForm(v => ({ ...v, name: e.target.value }))} placeholder="Ex.: VPN Cogel" /></div>
            <div><Label>Provedor</Label><Select value={vpnForm.provider} onValueChange={provider => setVpnForm(v => ({ ...v, provider: provider as VpnForm["provider"], profileName: provider === "COGEL" ? "Prodeb" : provider === "SEFAZ" ? "Sefaz" : v.profileName }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="COGEL">Cogel</SelectItem><SelectItem value="SEFAZ">Sefaz</SelectItem><SelectItem value="OUTRA">Outra</SelectItem></SelectContent></Select></div>
            <div><Label>Perfil instalado no computador</Label><Input className="mt-1" value={vpnForm.profileName} onChange={e => setVpnForm(v => ({ ...v, profileName: e.target.value }))} /></div>
            <div><Label>Estratégia</Label><Select value={vpnForm.connectionStrategy} onValueChange={connectionStrategy => setVpnForm(v => ({ ...v, connectionStrategy: connectionStrategy as VpnForm["connectionStrategy"] }))}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="AUTO">Automática</SelectItem><SelectItem value="CLI">FortiVPN CLI</SelectItem><SelectItem value="AUTOCONNECT">Perfil do Windows/FortiClient</SelectItem></SelectContent></Select></div>
            <div><Label>Usuário</Label><Input className="mt-1" value={vpnForm.username} onChange={e => setVpnForm(v => ({ ...v, username: e.target.value }))} /></div>
            <div><Label>Senha</Label><Input className="mt-1" type="password" autoComplete="new-password" value={vpnForm.password} onChange={e => setVpnForm(v => ({ ...v, password: e.target.value }))} placeholder={vpnEditingId ? "Vazio mantém a senha" : "Senha da VPN"} /></div>
            <div className="sm:col-span-2"><Label>URL interna para validar a conexão</Label><Input className="mt-1" type="url" value={vpnForm.verificationUrl} onChange={e => setVpnForm(v => ({ ...v, verificationUrl: e.target.value }))} placeholder="https://sistema.interno/health" /></div>
            <div className="sm:col-span-2"><Label>Arquivo de configuração (.conf ou .xml)</Label><label className="mt-1 flex cursor-pointer items-center gap-2 rounded-md border bg-white px-3 py-2 text-sm"><Upload className="h-4 w-4" /><span className="truncate">{vpnForm.configFileName || "Selecionar arquivo"}</span><input className="hidden" type="file" accept=".conf,.xml" onChange={async e => { const file=e.target.files?.[0]; if(file) { const configBase64 = await fileToBase64(file); setVpnForm(v => ({ ...v, configFileName: file.name, configBase64 })); } }} /></label></div>
            <div><Label>Senha do arquivo (opcional)</Label><Input className="mt-1" type="password" autoComplete="new-password" value={vpnForm.configPassword} onChange={e => setVpnForm(v => ({ ...v, configPassword: e.target.value }))} /></div>
            <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={vpnForm.autoConnect} onChange={e => setVpnForm(v => ({ ...v, autoConnect: e.target.checked }))} /> Conectar automaticamente</label></div>
            <div><Label>URL oficial do instalador</Label><Input className="mt-1" type="url" value={vpnForm.installerUrl} onChange={e => setVpnForm(v => ({ ...v, installerUrl: e.target.value }))} /></div>
            <div><Label>SHA-256 do instalador</Label><Input className="mt-1 font-mono text-xs" value={vpnForm.installerSha256} onChange={e => setVpnForm(v => ({ ...v, installerSha256: e.target.value.replace(/\s/g, "").toLowerCase() }))} /></div>
            <div className="flex gap-2 sm:col-span-2"><Button onClick={saveVpn} disabled={createVpn.isPending || updateVpn.isPending}>{(createVpn.isPending || updateVpn.isPending) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Salvar VPN</Button><Button variant="outline" onClick={() => setShowVpnForm(false)}>Cancelar</Button></div>
          </div>}
          <div className="grid gap-3 md:grid-cols-2">{vpnQuery.data?.map(vpn => <div key={vpn.id} className="rounded-xl border bg-white p-4 shadow-sm"><div className="flex justify-between gap-3"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-slate-900">{vpn.name}</h3>{vpn.isActive ? <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700">Ativa</span> : <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500">Inativa</span>}</div><p className="mt-1 text-xs text-slate-500">{vpn.provider} · perfil {vpn.profileName}</p><p className="mt-2 text-xs text-slate-500">{vpn.hasPassword ? "Senha armazenada" : "Sem senha"} · {vpn.hasConfig ? `Configuração ${vpn.configFileName ?? "armazenada"}` : "Sem arquivo"}</p></div><div className="flex h-fit gap-1"><Button size="icon" variant="ghost" title="Testar VPN" onClick={() => testVpn.mutate({ id: vpn.id })}><ShieldCheck className="h-4 w-4 text-emerald-600" /></Button><Button size="icon" variant="ghost" onClick={() => { setVpnEditingId(vpn.id); setVpnForm({ name:vpn.name, provider:vpn.provider, profileName:vpn.profileName, username:vpn.username??"", password:"", autoConnect:Boolean(vpn.autoConnect), connectionStrategy:vpn.connectionStrategy, configFileName:vpn.configFileName??"", configBase64:"", configPassword:"", installerUrl:vpn.installerUrl??"", installerSha256:vpn.installerSha256??"", verificationUrl:vpn.verificationUrl??"", isActive:Boolean(vpn.isActive) }); setShowVpnForm(true); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => deleteVpn.mutate({ id:vpn.id })}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></div></div>)}</div>
          {!vpnQuery.isLoading && !vpnQuery.data?.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhuma VPN global cadastrada.</div>}
        </div>}

        {section === "ai" && <div className="space-y-4">
          <div className="flex items-start justify-between gap-3 rounded-xl border bg-white p-5 shadow-sm"><div><h2 className="font-semibold text-slate-900">Provedores de Inteligência Artificial</h2><p className="mt-1 text-xs text-slate-500">O provedor marcado como ativo será utilizado para gerar e analisar os casos de teste.</p></div><Button size="sm" onClick={() => { setAiForm(emptyAi()); setAiEditingId(null); setShowAiForm(true); }}><Plus className="mr-1 h-4 w-4" /> Nova API</Button></div>
          {showAiForm && <div className="grid gap-4 rounded-xl border border-violet-100 bg-violet-50/40 p-5 sm:grid-cols-2">
            <div><Label>Nome</Label><Input className="mt-1" value={aiForm.name} onChange={e => setAiForm(v => ({ ...v, name:e.target.value }))} /></div>
            <div><Label>Provedor</Label><Select value={aiForm.provider} onValueChange={provider => { const p=provider as AiForm["provider"]; setAiForm(v => ({ ...v, provider:p, ...AI_DEFAULTS[p] })); }}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="OPENAI">OpenAI</SelectItem><SelectItem value="GEMINI">Gemini</SelectItem><SelectItem value="GROQ">Groq</SelectItem><SelectItem value="CUSTOM">Compatível com OpenAI</SelectItem></SelectContent></Select></div>
            <div><Label>URL base da API</Label><Input className="mt-1" type="url" value={aiForm.apiUrl} onChange={e => setAiForm(v => ({ ...v, apiUrl:e.target.value }))} /></div>
            <div><Label>Modelo</Label><Input className="mt-1" value={aiForm.model} onChange={e => setAiForm(v => ({ ...v, model:e.target.value }))} /></div>
            <div className="sm:col-span-2"><Label>Chave da API</Label><Input className="mt-1" type="password" autoComplete="new-password" value={aiForm.apiKey} onChange={e => setAiForm(v => ({ ...v, apiKey:e.target.value }))} placeholder={aiEditingId ? "Vazio mantém a chave atual" : "Chave secreta"} /></div>
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={aiForm.isActive} onChange={e => setAiForm(v => ({ ...v, isActive:e.target.checked }))} /> Usar este provedor como principal</label>
            <div className="flex gap-2 sm:col-span-2"><Button onClick={saveAi} disabled={createAi.isPending || updateAi.isPending}><KeyRound className="mr-2 h-4 w-4" />Salvar API</Button><Button variant="outline" onClick={() => setShowAiForm(false)}>Cancelar</Button></div>
          </div>}
          <div className="space-y-3">{aiQuery.data?.map(ai => <div key={ai.id} className="flex items-center justify-between gap-4 rounded-xl border bg-white p-4 shadow-sm"><div><div className="flex items-center gap-2"><h3 className="font-semibold text-slate-900">{ai.name}</h3>{ai.isActive ? <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] text-emerald-700"><CheckCircle2 className="h-3 w-3" /> Em uso</span> : null}</div><p className="mt-1 text-xs text-slate-500">{ai.provider} · {ai.model}</p><p className="mt-1 break-all text-xs text-slate-400">{ai.apiUrl} · {ai.hasApiKey ? "chave armazenada" : "sem chave"}</p></div><div className="flex gap-1"><Button size="sm" variant="outline" disabled={testAi.isPending} onClick={() => testAi.mutate({ id:ai.id })}>{testAi.isPending ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Bot className="mr-1 h-4 w-4" />}Testar</Button><Button size="icon" variant="ghost" onClick={() => { setAiEditingId(ai.id); setAiForm({ name:ai.name, provider:ai.provider, apiUrl:ai.apiUrl, model:ai.model, apiKey:"", isActive:Boolean(ai.isActive) }); setShowAiForm(true); }}><Pencil className="h-4 w-4" /></Button><Button size="icon" variant="ghost" onClick={() => deleteAi.mutate({ id:ai.id })}><Trash2 className="h-4 w-4 text-red-500" /></Button></div></div>)}</div>
          {!aiQuery.isLoading && !aiQuery.data?.length && <div className="rounded-xl border border-dashed p-8 text-center text-sm text-slate-500">Nenhuma API cadastrada. Enquanto isso, o sistema continuará usando o arquivo .env.</div>}
        </div>}

        {section === "execution" && <div className="space-y-4">
          <div className="rounded-xl border bg-white p-5 shadow-sm">
            <h2 className="font-semibold text-slate-900">Fila e capacidade de automacao</h2>
            <p className="mt-1 text-xs text-slate-500">O worker local executa apenas testes da mesma rede ao mesmo tempo. Os demais aguardam automaticamente na fila.</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-lg bg-amber-50 p-3"><p className="text-xs text-amber-700">Aguardando</p><p className="mt-1 text-2xl font-bold text-amber-900">{executionQueueQuery.data?.queued ?? 0}</p></div>
              <div className="rounded-lg bg-blue-50 p-3"><p className="text-xs text-blue-700">Em execucao</p><p className="mt-1 text-2xl font-bold text-blue-900">{executionQueueQuery.data?.running ?? 0}</p></div>
              {executionQueueQuery.data?.byPool?.map(item => <div key={item.pool} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Pool {item.pool}</p><p className="mt-1 text-sm font-semibold text-slate-800">{item.running} executando / {item.queued} na fila</p></div>)}
            </div>
          </div>

          {executionQueueQuery.data?.workers.map(worker => <div key={worker.id} className="rounded-xl border bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><h3 className="font-semibold text-slate-900">{worker.name}</h3><p className="mt-1 text-xs text-slate-500">{worker.code} · {worker.mode} · rede ativa {worker.currentPool ?? "nenhuma"}</p></div>
              <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${worker.status === "ONLINE" ? "bg-emerald-100 text-emerald-700" : worker.status === "PAUSED" ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-600"}`}>{worker.status}</span>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div><Label>Estado</Label><Select value={worker.status} onValueChange={status => updateWorker.mutate({ id: worker.id, status: status as "ONLINE" | "OFFLINE" | "PAUSED" })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ONLINE">Ativo</SelectItem><SelectItem value="PAUSED">Pausado</SelectItem><SelectItem value="OFFLINE">Desligado</SelectItem></SelectContent></Select></div>
              <div><Label>Pool permitido</Label><Select value={worker.networkPool} onValueChange={networkPool => updateWorker.mutate({ id: worker.id, networkPool: networkPool as "ANY" | "PUBLIC" | "COGEL" | "SEFAZ" | "OUTRA" })}><SelectTrigger className="mt-1"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ANY">Qualquer (um por vez)</SelectItem><SelectItem value="PUBLIC">Somente publico</SelectItem><SelectItem value="COGEL">Somente COGEL</SelectItem><SelectItem value="SEFAZ">Somente SEFAZ</SelectItem><SelectItem value="OUTRA">Outra VPN</SelectItem></SelectContent></Select></div>
              <div><Label>Testes simultaneos</Label><Input className="mt-1" type="number" min={1} max={20} defaultValue={worker.maxConcurrency} onBlur={event => { const value=Number(event.currentTarget.value); if(value !== worker.maxConcurrency) updateWorker.mutate({ id:worker.id, maxConcurrency:value }); }} /></div>
              <div><Label>Memoria livre minima (MB)</Label><Input className="mt-1" type="number" min={1024} step={256} defaultValue={worker.minFreeMemoryMb} onBlur={event => { const value=Number(event.currentTarget.value); if(value !== worker.minFreeMemoryMb) updateWorker.mutate({ id:worker.id, minFreeMemoryMb:value }); }} /></div>
              <div><Label>CPU maxima (%)</Label><Input className="mt-1" type="number" min={20} max={95} defaultValue={worker.maxCpuPercent} onBlur={event => { const value=Number(event.currentTarget.value); if(value !== worker.maxCpuPercent) updateWorker.mutate({ id:worker.id, maxCpuPercent:value }); }} /></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Memoria livre agora</p><p className="mt-1 font-semibold text-slate-800">{worker.freeMemoryMb == null ? "Aguardando leitura" : `${worker.freeMemoryMb} MB`}</p></div>
              <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">CPU agora</p><p className="mt-1 font-semibold text-slate-800">{worker.cpuPercent == null ? "Aguardando leitura" : `${worker.cpuPercent}%`}</p></div>
            </div>
          </div>)}
          {executionQueueQuery.isLoading && <div className="flex items-center gap-2 rounded-xl border p-5 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando worker...</div>}
        </div>}
      </div>
    </AppLayout>
  );
}
