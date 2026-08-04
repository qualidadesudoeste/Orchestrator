import { useMemo, useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Activity, CheckCircle2, Clock3, Loader2, Network, Pause, Play, RefreshCw,
  Search, ServerCog, ShieldAlert, Square, UserRound, Wifi,
} from "lucide-react";

const STATE_LABEL = {
  QUEUED: "Na fila",
  RUNNING: "Em execução",
  PAUSED: "Pausada",
  FINISHED: "Concluída",
  FAILED: "Falha de infraestrutura",
  CANCELLED: "Encerrada",
} as const;

const STATE_STYLE = {
  QUEUED: "border-amber-200 bg-amber-50 text-amber-700",
  RUNNING: "border-blue-200 bg-blue-50 text-blue-700",
  PAUSED: "border-violet-200 bg-violet-50 text-violet-700",
  FINISHED: "border-emerald-200 bg-emerald-50 text-emerald-700",
  FAILED: "border-red-200 bg-red-50 text-red-700",
  CANCELLED: "border-slate-300 bg-slate-100 text-slate-700",
} as const;

const POOL_STYLE = {
  PUBLIC: "bg-slate-100 text-slate-700",
  COGEL: "bg-violet-100 text-violet-700",
  SEFAZ: "bg-cyan-100 text-cyan-700",
  OUTRA: "bg-orange-100 text-orange-700",
} as const;

function formatDate(value: string | Date | null | undefined) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}

export default function ExecutionQueuePage() {
  const { user } = useAuth();
  const [stateFilter, setStateFilter] = useState<"ALL" | keyof typeof STATE_LABEL>("ALL");
  const [poolFilter, setPoolFilter] = useState<"ALL" | "PUBLIC" | "COGEL" | "SEFAZ" | "OUTRA">("ALL");
  const [search, setSearch] = useState("");

  const queueQuery = trpc.testExecutions.queue.useQuery(
    {
      state: "ALL",
      pool: poolFilter === "ALL" ? undefined : poolFilter,
      limit: 150,
    },
    { refetchInterval: 3_000 },
  );

  const controlMutation = trpc.testExecutions.control.useMutation({
    onSuccess: (_data, variables) => {
      const message = variables.action === "PAUSE"
        ? "Comando de pausa enviado."
        : variables.action === "RESUME"
          ? "Execução retomada."
          : "Comando de encerramento enviado.";
      toast.success(message);
      void queueQuery.refetch();
    },
    onError: error => toast.error("Não foi possível controlar a execução: " + error.message),
  });

  const sendControl = (externalExecutionId: string, action: "PAUSE" | "RESUME" | "CANCEL") => {
    if (action === "CANCEL" && !window.confirm("Encerrar esta execução? O cenário atual será concluído, mas os próximos não serão iniciados.")) return;
    controlMutation.mutate({ externalExecutionId, action });
  };

  const items = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("pt-BR");
    return (queueQuery.data?.items ?? []).filter(item => {
      if (stateFilter !== "ALL" && item.executionState !== stateFilter) return false;
      if (!normalizedSearch) return true;
      return [item.projectName, item.clientName, item.sprintName, item.externalExecutionId, item.createdByName, item.createdByUsername]
        .some(value => String(value ?? "").toLocaleLowerCase("pt-BR").includes(normalizedSearch));
    });
  }, [queueQuery.data?.items, search, stateFilter]);

  const summary = queueQuery.data?.summary ?? { queued: 0, running: 0, paused: 0, finished: 0, failed: 0, cancelled: 0 };

  return (
    <AppLayout>
      <main className="min-h-full bg-slate-50/70 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1500px] space-y-5">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-blue-600">Workspace</p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
                <Activity className="h-6 w-6 text-blue-600" /> Fila de Execuções
              </h1>
              <p className="mt-1 text-sm text-slate-500">
                Acompanhe as automações de todos os QAs, a fila e a ocupação dos workers.
              </p>
            </div>
            <Button variant="outline" onClick={() => queueQuery.refetch()} disabled={queueQuery.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${queueQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar agora
            </Button>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Aguardando</p><p className="mt-2 text-3xl font-bold text-slate-900">{summary.queued}</p></div><Clock3 className="h-8 w-8 text-amber-400" /></div></div>
            <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Executando</p><p className="mt-2 text-3xl font-bold text-slate-900">{summary.running}</p></div><Loader2 className={`h-8 w-8 text-blue-400 ${summary.running ? "animate-spin" : ""}`} /></div></div>
            <div className="rounded-2xl border border-violet-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-violet-600">Pausadas</p><p className="mt-2 text-3xl font-bold text-slate-900">{summary.paused}</p></div><Pause className="h-8 w-8 text-violet-400" /></div></div>
            <div className="rounded-2xl border border-emerald-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-emerald-600">Concluídas</p><p className="mt-2 text-3xl font-bold text-slate-900">{summary.finished}</p></div><CheckCircle2 className="h-8 w-8 text-emerald-400" /></div></div>
            <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-red-600">Infraestrutura</p><p className="mt-2 text-3xl font-bold text-slate-900">{summary.failed}</p></div><ShieldAlert className="h-8 w-8 text-red-400" /></div></div>
            <div className="rounded-2xl border border-slate-300 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><div><p className="text-xs font-semibold uppercase tracking-wide text-slate-600">Encerradas</p><p className="mt-2 text-3xl font-bold text-slate-900">{summary.cancelled}</p></div><Square className="h-8 w-8 text-slate-400" /></div></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_200px_200px]">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar projeto, sprint, execução ou usuário" /></div>
              <Select value={stateFilter} onValueChange={value => setStateFilter(value as typeof stateFilter)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Todos os estados</SelectItem><SelectItem value="QUEUED">Na fila</SelectItem><SelectItem value="RUNNING">Em execução</SelectItem><SelectItem value="PAUSED">Pausadas</SelectItem><SelectItem value="FINISHED">Concluídas</SelectItem><SelectItem value="FAILED">Falha de infraestrutura</SelectItem><SelectItem value="CANCELLED">Encerradas</SelectItem></SelectContent></Select>
              <Select value={poolFilter} onValueChange={value => setPoolFilter(value as typeof poolFilter)}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Todas as redes</SelectItem><SelectItem value="PUBLIC">Sem VPN</SelectItem><SelectItem value="COGEL">COGEL</SelectItem><SelectItem value="SEFAZ">SEFAZ</SelectItem><SelectItem value="OUTRA">Outra VPN</SelectItem></SelectContent></Select>
            </div>
          </section>

          {queueQuery.isLoading ? (
            <div className="flex min-h-72 items-center justify-center rounded-2xl border bg-white"><Loader2 className="mr-2 h-5 w-5 animate-spin text-blue-600" /><span className="text-sm text-slate-500">Carregando fila...</span></div>
          ) : queueQuery.error ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700">Não foi possível carregar a fila: {queueQuery.error.message}</div>
          ) : items.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center"><ServerCog className="h-10 w-10 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-700">Nenhuma execução encontrada</h2><p className="mt-1 text-sm text-slate-400">As próximas automações aparecerão aqui automaticamente.</p></div>
          ) : (
            <section className="space-y-3">
              {items.map(item => {
                const canControl = user?.role === "admin" || item.createdById === user?.id;
                const terminal = ["FINISHED", "FAILED", "CANCELLED"].includes(item.executionState);
                const pauseRequested = item.controlState === "PAUSE" && item.executionState === "RUNNING";
                const cancelRequested = item.controlState === "CANCEL" && !terminal;
                const displayLabel = cancelRequested ? "Encerrando" : pauseRequested ? "Pausa solicitada" : STATE_LABEL[item.executionState];
                const displayStyle = cancelRequested ? STATE_STYLE.CANCELLED : pauseRequested ? STATE_STYLE.PAUSED : STATE_STYLE[item.executionState];
                const busy = controlMutation.isPending && controlMutation.variables?.externalExecutionId === item.externalExecutionId;
                return (
                <article key={item.id} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className={`h-1.5 ${item.executionState === "RUNNING" ? "bg-blue-500" : item.executionState === "PAUSED" ? "bg-violet-500" : item.executionState === "QUEUED" ? "bg-amber-400" : item.executionState === "FAILED" ? "bg-red-500" : item.executionState === "CANCELLED" ? "bg-slate-500" : "bg-emerald-500"}`} />
                  <div className="p-5">
                    <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${displayStyle}`}>{displayLabel}</span>
                          <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${POOL_STYLE[item.queuePool]}`}><Network className="mr-1 inline h-3 w-3" />{item.queuePool === "PUBLIC" ? "Sem VPN" : item.queuePool}</span>
                          {item.queuePosition && <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-bold text-amber-800">Posição geral #{item.queuePosition}</span>}
                        </div>
                        <h2 className="mt-3 truncate text-lg font-bold text-slate-900">{item.projectName}</h2>
                        <p className="mt-1 text-sm text-slate-500">{item.clientName || "Cliente não informado"} · {item.sprintName || "Sem sprint"}</p>
                        <p className="mt-2 break-all font-mono text-xs text-slate-400">{item.externalExecutionId}</p>
                      </div>
                      <div className="grid shrink-0 gap-2 text-xs text-slate-500 sm:grid-cols-2 lg:min-w-[390px]">
                        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><UserRound className="h-4 w-4 text-slate-400" /><span>{item.createdByName || item.createdByUsername || "Usuário"}</span></div>
                        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><ServerCog className="h-4 w-4 text-slate-400" /><span>{item.workerName || "Aguardando worker"}</span></div>
                        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><Clock3 className="h-4 w-4 text-slate-400" /><span>Fila: {formatDate(item.queuedAt)}</span></div>
                        <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><Wifi className="h-4 w-4 text-slate-400" /><span>{item.currentEnvironment || item.currentStage || "Preparando"}</span></div>
                      </div>
                    </div>

                    {canControl && !terminal && (
                      <div className="mt-5 flex flex-wrap gap-2 border-t border-slate-100 pt-4">
                        {!cancelRequested && (item.executionState === "PAUSED" || pauseRequested ? (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => sendControl(item.externalExecutionId, "RESUME")}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />} Retomar
                          </Button>
                        ) : (
                          <Button size="sm" variant="outline" disabled={busy} onClick={() => sendControl(item.externalExecutionId, "PAUSE")}>
                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />} Pausar
                          </Button>
                        ))}
                        <Button size="sm" variant="outline" className="border-red-200 text-red-700 hover:bg-red-50 hover:text-red-800" disabled={busy || cancelRequested} onClick={() => sendControl(item.externalExecutionId, "CANCEL")}>
                          {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />} {cancelRequested ? "Encerramento solicitado" : "Encerrar"}
                        </Button>
                      </div>
                    )}

                    <div className="mt-5">
                      <div className="mb-1.5 flex justify-between text-xs"><span className="font-medium text-slate-600">{item.progressMessage || "Aguardando processamento."}</span><span className="text-slate-400">{item.completedScenarios}/{item.totalScenarios} cenários · {item.progressPercent}%</span></div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100"><div className={`h-full rounded-full transition-all ${item.executionState === "FAILED" ? "bg-red-500" : item.executionState === "FINISHED" ? "bg-emerald-500" : "bg-blue-500"}`} style={{ width: `${item.progressPercent}%` }} /></div>
                      {item.currentScenarioTitle && <p className="mt-2 truncate text-xs text-slate-500">Cenário atual: {item.currentScenarioTitle}</p>}
                    </div>
                  </div>
                </article>
              );})}
            </section>
          )}
        </div>
      </main>
    </AppLayout>
  );
}
