import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import {
  AlertCircle, CalendarClock, CloudDownload, ExternalLink, Filter, FolderKanban,
  ListChecks, Loader2, RefreshCw, Search, Siren, UserRound,
} from "lucide-react";
import AppLayout from "@/components/AppLayout";
import SigCardsImportDialog from "@/components/SigCardsImportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

type QueueItem = {
  id: string;
  projectId: string;
  projectName: string;
  sprintId: string;
  sprintName: string;
  clientName: string;
  status: string;
  priority: string;
  responsible: string;
  releasedAt: string | null;
  dueDate: string | null;
  cardCount: number | null;
  localProjectId: number | null;
  localProjectName: string | null;
  localSprintId: number | null;
  localSprintName: string | null;
  localClientId: number | null;
  localClientName: string | null;
};

function formatDate(value: string | null) {
  if (!value) return "Não informada";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

function priorityStyle(priority: string) {
  const normalized = priority.toLocaleLowerCase("pt-BR");
  if (/crit|urgent|alta|high/.test(normalized)) return "border-red-200 bg-red-50 text-red-700";
  if (/media|média|medium/.test(normalized)) return "border-amber-200 bg-amber-50 text-amber-700";
  return "border-slate-200 bg-slate-50 text-slate-600";
}

export default function SigTestQueuePage() {
  const [, navigate] = useLocation();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");
  const [selectedItem, setSelectedItem] = useState<QueueItem | null>(null);
  const queueQuery = trpc.sig.testQueue.useQuery(undefined, {
    retry: false,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });

  const sourceItems = (queueQuery.data?.items ?? []) as QueueItem[];
  const statuses = useMemo(() => Array.from(new Set(sourceItems.map(item => item.status).filter(Boolean))).sort(), [sourceItems]);
  const items = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    return sourceItems.filter(item => {
      if (statusFilter !== "ALL" && item.status !== statusFilter) return false;
      if (!term) return true;
      return [item.projectName, item.sprintName, item.clientName, item.responsible, item.priority, item.projectId, item.sprintId]
        .some(value => String(value ?? "").toLocaleLowerCase("pt-BR").includes(term));
    });
  }, [sourceItems, search, statusFilter]);

  const projectCount = new Set(sourceItems.map(item => item.projectId || item.projectName)).size;
  const urgentCount = sourceItems.filter(item => /crit|urgent|alta|high/i.test(item.priority)).length;
  const unmappedCount = sourceItems.filter(item => !item.localSprintId).length;

  const openWorkspace = (item: QueueItem) => {
    if (item.localProjectId && item.localSprintId && item.localClientId) {
      const storageKey = "orchestrator-workspace-ui-state";
      let current: Record<string, unknown> = {};
      try { current = JSON.parse(sessionStorage.getItem(storageKey) || "{}") as Record<string, unknown>; } catch {}
      sessionStorage.setItem(storageKey, JSON.stringify({
        ...current,
        selectedClientId: item.localClientId,
        selectedProjectId: item.localProjectId,
        plansSprint: {
          id: item.localSprintId,
          name: item.localSprintName || item.sprintName,
          projectId: item.localProjectId,
          projectName: item.localProjectName || item.projectName,
        },
      }));
    }
    navigate("/workspace");
  };

  const sendToPlanner = (item: QueueItem, userStory: string) => {
    if (!item.localProjectId || !item.localSprintId) return;
    const storageKey = "orchestrator-qa-planner-generator-state-v2";
    let current: Record<string, unknown> = {};
    try { current = JSON.parse(sessionStorage.getItem(storageKey) || "{}") as Record<string, unknown>; } catch {}
    sessionStorage.setItem(storageKey, JSON.stringify({
      ...current,
      userStory,
      showUserStoryEditor: true,
      result: null,
      coverageResult: null,
      showCoveragePanel: false,
      savedPlanId: null,
      selectedProjectId: String(item.localProjectId),
      selectedSprintId: String(item.localSprintId),
    }));
    setSelectedItem(null);
    navigate(`/qa-planner?projectId=${item.localProjectId}&sprintId=${item.localSprintId}`);
  };

  return (
    <AppLayout>
      <main className="min-h-full bg-slate-50/70 p-4 sm:p-6 lg:p-8">
        <div className="mx-auto max-w-[1500px] space-y-5">
          <header className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-600">Integração SIG</p>
              <h1 className="mt-1 flex items-center gap-2 text-2xl font-bold tracking-tight text-slate-900">
                <ListChecks className="h-6 w-6 text-cyan-600" /> Fila de Testes do SIG
              </h1>
              <p className="mt-1 text-sm text-slate-500">Sprints liberadas para teste no SIG, atualizadas diretamente pelo MCP.</p>
            </div>
            <Button variant="outline" onClick={() => queueQuery.refetch()} disabled={queueQuery.isFetching}>
              <RefreshCw className={`mr-2 h-4 w-4 ${queueQuery.isFetching ? "animate-spin" : ""}`} /> Atualizar fila
            </Button>
          </header>

          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-2xl border border-cyan-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-cyan-600">Sprints liberadas</p><p className="mt-2 text-3xl font-bold text-slate-900">{sourceItems.length}</p></div>
            <div className="rounded-2xl border border-blue-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-blue-600">Projetos</p><p className="mt-2 text-3xl font-bold text-slate-900">{projectCount}</p></div>
            <div className="rounded-2xl border border-red-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-red-600">Alta prioridade</p><p className="mt-2 text-3xl font-bold text-slate-900">{urgentCount}</p></div>
            <div className="rounded-2xl border border-amber-200 bg-white p-5 shadow-sm"><p className="text-xs font-semibold uppercase tracking-wide text-amber-600">A vincular</p><p className="mt-2 text-3xl font-bold text-slate-900">{unmappedCount}</p></div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
            <div className="grid gap-3 md:grid-cols-[minmax(240px,1fr)_260px]">
              <div className="relative"><Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar cliente, projeto, sprint, responsável ou ID" /></div>
              <Select value={statusFilter} onValueChange={setStatusFilter}><SelectTrigger><Filter className="mr-2 h-4 w-4 text-slate-400" /><SelectValue /></SelectTrigger><SelectContent><SelectItem value="ALL">Todos os status</SelectItem>{statuses.map(status => <SelectItem key={status} value={status}>{status}</SelectItem>)}</SelectContent></Select>
            </div>
          </section>

          {queueQuery.isLoading ? (
            <div className="flex min-h-72 items-center justify-center rounded-2xl border bg-white"><Loader2 className="mr-2 h-5 w-5 animate-spin text-cyan-600" /><span className="text-sm text-slate-500">Consultando fila do SIG...</span></div>
          ) : queueQuery.error ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-6 text-amber-900">
              <div className="flex items-start gap-3"><AlertCircle className="mt-0.5 h-5 w-5 shrink-0" /><div><h2 className="font-semibold">Não foi possível consultar a fila do SIG</h2><p className="mt-1 text-sm">{queueQuery.error.message}</p><Button className="mt-4" size="sm" variant="outline" onClick={() => navigate("/parameters")}>Abrir Parâmetros do SIG</Button></div></div>
            </div>
          ) : items.length === 0 ? (
            <div className="flex min-h-72 flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white text-center"><ListChecks className="h-10 w-10 text-slate-300" /><h2 className="mt-3 font-semibold text-slate-700">Nenhuma sprint liberada encontrada</h2><p className="mt-1 text-sm text-slate-400">Atualize a fila ou revise os filtros utilizados.</p></div>
          ) : (
            <section className="grid gap-4 xl:grid-cols-2">
              {items.map(item => (
                <article key={`${item.projectId}:${item.sprintId}:${item.id}`} className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
                  <div className="h-1.5 bg-cyan-500" />
                  <div className="p-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2"><span className="rounded-full border border-cyan-200 bg-cyan-50 px-2.5 py-1 text-xs font-semibold text-cyan-700">{item.status}</span>{item.priority && <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${priorityStyle(item.priority)}`}>{item.priority}</span>}</div>
                        <h2 className="mt-3 text-lg font-bold text-slate-900">{item.sprintName}</h2>
                        <p className="mt-1 text-sm text-slate-600">{item.projectName}{item.clientName ? ` · ${item.clientName}` : ""}</p>
                        <p className="mt-2 font-mono text-xs text-slate-400">Projeto SIG: {item.projectId || "—"} · Sprint SIG: {item.sprintId}</p>
                      </div>
                      {item.cardCount !== null && <div className="rounded-xl bg-slate-50 px-4 py-3 text-center"><p className="text-2xl font-bold text-slate-800">{item.cardCount}</p><p className="text-[11px] uppercase text-slate-500">cards</p></div>}
                    </div>

                    <div className="mt-4 grid gap-2 text-xs text-slate-600 sm:grid-cols-3">
                      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><CalendarClock className="h-4 w-4 text-slate-400" /><span>Liberada: {formatDate(item.releasedAt)}</span></div>
                      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><Siren className="h-4 w-4 text-slate-400" /><span>Prazo: {formatDate(item.dueDate)}</span></div>
                      <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2"><UserRound className="h-4 w-4 text-slate-400" /><span>{item.responsible || "Sem responsável"}</span></div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-4">
                      {item.localSprintId ? (
                        <span className="flex items-center gap-1.5 text-xs font-medium text-emerald-700"><FolderKanban className="h-4 w-4" /> Vinculada a {item.localProjectName} / {item.localSprintName}</span>
                      ) : (
                        <span className="text-xs font-medium text-amber-700">Ainda não vinculada ao cadastro local</span>
                      )}
                      <div className="flex flex-wrap gap-2">
                        <Button size="sm" variant="outline" onClick={() => openWorkspace(item)}><ExternalLink className="mr-2 h-4 w-4" /> {item.localSprintId ? "Abrir sprint" : "Abrir cadastro"}</Button>
                        {item.localProjectId && item.localSprintId && <Button size="sm" onClick={() => setSelectedItem(item)}><CloudDownload className="mr-2 h-4 w-4" /> Importar cards</Button>}
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </section>
          )}
        </div>
      </main>

      {selectedItem?.localProjectId && selectedItem.localSprintId && (
        <SigCardsImportDialog
          open
          onOpenChange={open => !open && setSelectedItem(null)}
          projectId={selectedItem.localProjectId}
          sprintId={selectedItem.localSprintId}
          projectName={selectedItem.localProjectName || selectedItem.projectName}
          sprintName={selectedItem.localSprintName || selectedItem.sprintName}
          onImport={userStory => sendToPlanner(selectedItem, userStory)}
        />
      )}
    </AppLayout>
  );
}
