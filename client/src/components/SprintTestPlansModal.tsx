import { useEffect, useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { ChevronDown, ChevronUp, ClipboardList, CloudDownload, FileText, Globe2, Loader2, Play, Plus, Trash2, UserRound } from "lucide-react";
import { toast } from "sonner";
import { useLocation } from "wouter";
import SigCardsImportDialog from "@/components/SigCardsImportDialog";

type TestCase = {
  id: string;
  titulo: string;
  prioridade: string;
  dado: string;
  quando: string;
  entao: string;
  resultado_esperado: string;
  tipo: string;
};

type PlanResult = {
  resumo?: string;
  cards?: Array<{ categoria: string; casos: TestCase[] }>;
};

export default function SprintTestPlansModal({
  projectId,
  sprintId,
  sprintName,
  projectName,
  onClose,
  initialPlanId,
  readOnly = false,
}: {
  projectId: number;
  sprintId: number;
  sprintName: string;
  projectName: string;
  onClose: () => void;
  initialPlanId?: number;
  readOnly?: boolean;
}) {
  const [, navigate] = useLocation();
  const plansQuery = trpc.qaPlanner.listPlans.useQuery({ projectId, sprintId });
  const usersQuery = trpc.users.options.useQuery();
  const environmentsQuery = trpc.testEnvironments.list.useQuery({ projectId }, { enabled: !readOnly });
  const plans = plansQuery.data ?? [];
  const users = usersQuery.data ?? [];
  const activeEnvironments = (environmentsQuery.data ?? []).filter(environment => environment.isActive);
  const [selectedPlanId, setSelectedPlanId] = useState<number | null>(initialPlanId ?? null);
  const [selectedEnvironmentIds, setSelectedEnvironmentIds] = useState<string[]>([]);
  const [authorizedEnvironment, setAuthorizedEnvironment] = useState(false);
  const [startedExecution, setStartedExecution] = useState<{ executionId: string; totalScenarios: number } | null>(null);
  const [showUserStory, setShowUserStory] = useState(false);
  const [showSigImport, setShowSigImport] = useState(false);

  const executionProgressQuery = trpc.testExecutions.progress.useQuery(
    { externalExecutionId: startedExecution?.executionId ?? "" },
    {
      enabled: Boolean(startedExecution?.executionId),
      refetchInterval: 2_000,
      refetchOnWindowFocus: true,
    },
  );

  const deletePlan = trpc.qaPlanner.deletePlan.useMutation({
    onSuccess: () => {
      plansQuery.refetch();
      setSelectedPlanId(null);
      toast.success("Plano removido.");
    },
    onError: error => toast.error(error.message),
  });

  const updateResponsible = trpc.qaPlanner.updatePlanResponsible.useMutation({
    onSuccess: () => {
      plansQuery.refetch();
      toast.success("Responsável atualizado.");
    },
    onError: error => toast.error("Não foi possível alterar o responsável: " + error.message),
  });

  const startAutomation = trpc.qaPlanner.startAutomatedTests.useMutation({
    onSuccess: data => {
      setStartedExecution({ executionId: data.executionId, totalScenarios: data.totalScenarios });
      toast.success("Testes automatizados iniciados!");
    },
    onError: error => toast.error("Erro ao iniciar testes: " + error.message),
  });

  useEffect(() => {
    if (!plans.length) {
      setSelectedPlanId(null);
      return;
    }
    if (!selectedPlanId || !plans.some(plan => plan.id === selectedPlanId)) {
      const preferredPlan = initialPlanId ? plans.find(plan => plan.id === initialPlanId) : undefined;
      setSelectedPlanId(preferredPlan?.id ?? plans[0].id);
    }
  }, [plans, selectedPlanId, initialPlanId]);

  useEffect(() => {
    if (activeEnvironments.length === 1 && selectedEnvironmentIds.length === 0) {
      setSelectedEnvironmentIds([String(activeEnvironments[0].id)]);
    }
  }, [activeEnvironments, selectedEnvironmentIds.length]);

  useEffect(() => {
    setAuthorizedEnvironment(false);
    setStartedExecution(null);
    setShowUserStory(false);
  }, [selectedPlanId]);

  const selectedPlan = plans.find(plan => plan.id === selectedPlanId) ?? null;
  const parsedResult = useMemo<PlanResult | null>(() => {
    if (!selectedPlan) return null;
    try {
      return JSON.parse(selectedPlan.resultJson) as PlanResult;
    } catch {
      return null;
    }
  }, [selectedPlan]);
  const allCases = parsedResult?.cards?.flatMap(card => card.casos ?? []) ?? [];
  const totalCases = allCases.length;
  const responsibleUserId = selectedPlan?.responsibleUserId ?? selectedPlan?.createdById;
  const progress = executionProgressQuery.data;

  const toggleEnvironment = (environmentId: string) => {
    setSelectedEnvironmentIds(current => current.includes(environmentId)
      ? current.filter(id => id !== environmentId)
      : [...current, environmentId]);
  };

  const handleStartTests = () => {
    if (!selectedPlan || totalCases === 0) {
      toast.error("Este plano não possui cenários válidos para executar.");
      return;
    }
    if (selectedEnvironmentIds.length === 0) {
      toast.error("Selecione ao menos um ambiente de execução.");
      return;
    }
    if (!authorizedEnvironment) {
      toast.error("Confirme que os ambientes estão autorizados para testes.");
      return;
    }
    startAutomation.mutate({
      projectId,
      sprintId,
      environmentIds: selectedEnvironmentIds.map(Number),
      cases: allCases,
    });
  };

  return (
    <Dialog open onOpenChange={open => !open && onClose()}>
      <DialogContent className="!flex h-[92vh] !w-[96vw] !max-w-[1500px] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14">
          <div className="flex items-center justify-between gap-4">
            <div>
              <DialogTitle className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-blue-600" /> {readOnly ? "Visualização do plano de teste" : "Planos de teste"} · {sprintName}</DialogTitle>
              <p className="mt-2 text-sm text-slate-500">{projectName} · {readOnly ? "consulta do plano vinculado a esta sprint." : "planos gerados e vinculados a esta sprint."}</p>
            </div>
            {!readOnly && (
              <div className="flex shrink-0 flex-wrap gap-2">
                <Button variant="outline" onClick={() => setShowSigImport(true)}>
                  <CloudDownload className="mr-2 h-4 w-4" /> Importar do SIG
                </Button>
                <Button onClick={() => { onClose(); navigate("/qa-planner?projectId=" + projectId + "&sprintId=" + sprintId); }}>
                  <Plus className="mr-2 h-4 w-4" /> Criar plano de teste
                </Button>
              </div>
            )}
          </div>
        </DialogHeader>

        {plansQuery.isLoading ? (
          <div className="flex min-h-0 flex-1 items-center justify-center text-sm text-slate-500"><Loader2 className="mr-2 h-5 w-5 animate-spin" /> Carregando planos...</div>
        ) : plans.length === 0 ? (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center px-6 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-50"><FileText className="h-6 w-6 text-blue-500" /></div>
            <h3 className="mt-4 text-base font-semibold text-slate-800">Nenhum plano salvo nesta sprint</h3>
            <p className="mt-1 max-w-md text-sm text-slate-500">Ao gerar casos de teste selecionando esta sprint, o plano será salvo automaticamente e aparecerá aqui.</p>
          </div>
        ) : (
          <div className={`grid min-h-0 flex-1 ${readOnly ? "grid-cols-1" : "md:grid-cols-[340px_minmax(0,1fr)]"}`}>
{!readOnly && (
            <aside className="min-h-0 overflow-y-auto border-r bg-slate-50 p-3">
              <p className="mb-2 px-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{plans.length} plano{plans.length === 1 ? "" : "s"}</p>
              <div className="space-y-2">
                {plans.map(plan => {
                  const active = plan.id === selectedPlanId;
                  const responsible = users.find(user => user.id === (plan.responsibleUserId ?? plan.createdById));
                  return (
                    <button key={plan.id} className={`w-full rounded-xl border p-3 text-left transition-colors ${active ? "border-blue-300 bg-white shadow-sm" : "border-transparent hover:border-slate-200 hover:bg-white"}`} onClick={() => setSelectedPlanId(plan.id)}>
                      <span className={`block line-clamp-2 text-sm font-semibold ${active ? "text-blue-800" : "text-slate-700"}`}>{plan.title}</span>
                      <span className="mt-1 block text-xs text-slate-400">{new Date(plan.createdAt).toLocaleString("pt-BR")}</span>
                      <span className="mt-2 flex items-center gap-1 text-xs text-slate-500"><UserRound className="h-3 w-3" /> {responsible?.name || responsible?.username || "Responsável não informado"}</span>
                    </button>
                  );
                })}
              </div>
            </aside>
            )}

            <section className="min-h-0 overflow-y-auto p-5 sm:p-6 lg:p-8">
              {selectedPlan && (
                <>
                  <div className="flex flex-col gap-5 border-b pb-5 xl:flex-row xl:items-start xl:justify-between">
                    <div className="min-w-0 flex-1">
                      <h3 className="text-xl font-bold text-slate-900">{selectedPlan.title}</h3>
                      <div className="mt-2 flex flex-wrap gap-2">
                        <Badge variant="secondary">{totalCases} cenário{totalCases === 1 ? "" : "s"}</Badge>
                        <Badge variant="outline">{selectedPlan.systemType}</Badge>
                        <Badge variant="outline">Criticidade {selectedPlan.criticality}</Badge>
                      </div>
                    </div>
                    {!readOnly && (
                      <div className="flex shrink-0 flex-wrap gap-2">

                      <Button onClick={handleStartTests} disabled={startAutomation.isPending || totalCases === 0} className="bg-emerald-600 text-white hover:bg-emerald-700">
                        {startAutomation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
                        Iniciar testes
                      </Button>
                      <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 hover:text-red-700" disabled={deletePlan.isPending} onClick={() => deletePlan.mutate({ id: selectedPlan.id })}><Trash2 className="mr-1.5 h-4 w-4" /> Excluir plano</Button>
                      </div>
                    )}
                  </div>

                  <div className={`mt-5 grid gap-4 ${readOnly ? "" : "xl:grid-cols-[minmax(260px,0.75fr)_minmax(420px,1.25fr)]"}`}>
                    <div className="rounded-xl border border-slate-200 bg-white p-4">
                      <label className="text-xs font-semibold uppercase tracking-wide text-slate-500">Responsável</label>
                      <Select
                        value={responsibleUserId ? String(responsibleUserId) : undefined}
                        onValueChange={value => updateResponsible.mutate({ id: selectedPlan.id, responsibleUserId: Number(value) })}
                        disabled={readOnly || usersQuery.isLoading || updateResponsible.isPending}
                      >
                        <SelectTrigger className="mt-2 w-full"><SelectValue placeholder="Selecione o responsável" /></SelectTrigger>
                        <SelectContent>
                          {users.map(user => <SelectItem key={user.id} value={String(user.id)}>{user.name || user.username}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <p className="mt-2 text-xs text-slate-500">Todos os usuários podem visualizar este plano. O responsável pode ser alterado a qualquer momento.</p>
                    </div>

                    {!readOnly && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                      <div className="flex items-center gap-2 text-sm font-semibold text-emerald-800"><Globe2 className="h-4 w-4" /> Ambientes da automação</div>
                      <p className="mt-1 text-xs text-slate-600">Selecione todos os ambientes que os cenários precisarão acessar.</p>
                      <div className="mt-3 grid gap-2 sm:grid-cols-2">
                        {activeEnvironments.map(environment => {
                          const id = String(environment.id);
                          const checked = selectedEnvironmentIds.includes(id);
                          return (
                            <label key={environment.id} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-3 ${checked ? "border-emerald-400 bg-white" : "border-slate-200 bg-white/70"}`}>
                              <input type="checkbox" className="mt-0.5" checked={checked} onChange={() => toggleEnvironment(id)} />
                              <span className="min-w-0"><span className="block text-xs font-semibold text-slate-800">{environment.name} · {environment.type}</span><span className="block truncate text-[11px] text-slate-500">{environment.loginUrl}</span></span>
                            </label>
                          );
                        })}
                      </div>
                      {!environmentsQuery.isLoading && activeEnvironments.length === 0 && <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">Nenhum ambiente ativo foi parametrizado neste projeto. Cadastre-o em Configurar projeto.</p>}
                      <label className="mt-3 flex cursor-pointer items-start gap-2 text-xs text-slate-700">
                        <input type="checkbox" className="mt-0.5" checked={authorizedEnvironment} onChange={event => setAuthorizedEnvironment(event.target.checked)} />
                        Confirmo que os ambientes e as contas selecionadas estão autorizados para testes automatizados.
                      </label>
                    </div>
                    )}
                  </div>

                  {startedExecution && (
                    <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4">
                      <p className="text-sm font-semibold text-blue-800">
                        {progress?.executionState === "FINISHED" ? "Execução concluída" : progress?.executionState === "FAILED" ? "Falha na execução" : progress?.executionState === "CANCELLED" ? "Execução encerrada" : progress?.executionState === "PAUSED" ? "Execução pausada" : progress?.executionState === "RUNNING" ? "Automação em execução" : "Execução na fila"}
                      </p>
                      <p className="mt-1 text-xs text-slate-600">{progress?.completedScenarios ?? 0} de {progress?.totalScenarios ?? startedExecution.totalScenarios} cenários · {startedExecution.executionId}</p>
                      {progress?.progressMessage && <p className="mt-2 text-xs text-slate-600">{progress.progressMessage}</p>}
                    </div>
                  )}

                  <div className="mt-5 overflow-hidden rounded-xl border border-slate-200 bg-slate-50">
                    <button type="button" onClick={() => setShowUserStory(open => !open)} className="flex w-full items-center justify-between px-4 py-3 text-left">
                      <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">História de usuário</span>
                      {showUserStory ? <ChevronUp className="h-4 w-4 text-slate-400" /> : <ChevronDown className="h-4 w-4 text-slate-400" />}
                    </button>
                    {showUserStory && <p className="border-t border-slate-200 px-4 py-3 whitespace-pre-wrap text-sm leading-relaxed text-slate-700">{selectedPlan.userStory}</p>}
                  </div>

                  {parsedResult?.resumo && <div className="mt-4 rounded-xl border border-blue-100 bg-blue-50/50 p-4"><p className="text-xs font-semibold uppercase tracking-wide text-blue-500">Resumo do plano</p><p className="mt-2 text-sm text-slate-700">{parsedResult.resumo}</p></div>}

                  <div className="mt-5 space-y-4">
                    {parsedResult?.cards?.map((card, cardIndex) => (
                      <div key={`${card.categoria}-${cardIndex}`}>
                        <h4 className="mb-2 text-sm font-semibold text-slate-800">{card.categoria}</h4>
                        <div className="grid gap-3 2xl:grid-cols-2">
                          {(card.casos ?? []).map((testCase, caseIndex) => (
                            <article key={`${testCase.id}-${caseIndex}`} className="rounded-xl border border-slate-200 bg-white p-4">
                              <div className="flex flex-wrap items-start justify-between gap-2"><h5 className="text-sm font-semibold text-slate-800">{testCase.id ? `${testCase.id} · ` : ""}{testCase.titulo}</h5><Badge variant="outline">{testCase.prioridade}</Badge></div>
                              <div className="mt-3 space-y-1.5 text-xs leading-relaxed text-slate-600"><p><strong>Dado:</strong> {testCase.dado}</p><p><strong>Quando:</strong> {testCase.quando}</p><p><strong>Então:</strong> {testCase.entao}</p>{testCase.resultado_esperado && <p><strong>Resultado esperado:</strong> {testCase.resultado_esperado}</p>}</div>
                            </article>
                          ))}
                        </div>
                      </div>
                    ))}
                    {!parsedResult && <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">O conteúdo deste plano não pôde ser interpretado.</p>}
                  </div>
                </>
              )}
            </section>
          </div>
        )}
      </DialogContent>
      {!readOnly && (
        <SigCardsImportDialog
          open={showSigImport}
          onOpenChange={setShowSigImport}
          projectId={projectId}
          sprintId={sprintId}
          projectName={projectName}
          sprintName={sprintName}
          onImport={userStory => {
            const storageKey = "orchestrator-qa-planner-generator-state-v2";
            let current: Record<string, unknown> = {};
            try {
              current = JSON.parse(sessionStorage.getItem(storageKey) || "{}") as Record<string, unknown>;
            } catch {
              current = {};
            }
            sessionStorage.setItem(storageKey, JSON.stringify({
              ...current,
              userStory,
              showUserStoryEditor: true,
              result: null,
              coverageResult: null,
              showCoveragePanel: false,
              savedPlanId: null,
              selectedProjectId: String(projectId),
              selectedSprintId: String(sprintId),
            }));
            setShowSigImport(false);
            onClose();
            navigate("/qa-planner?projectId=" + projectId + "&sprintId=" + sprintId);
          }}
        />
      )}
    </Dialog>
  );
}
