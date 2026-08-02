import { useAuth } from "@/_core/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import {
  Activity,
  AlertTriangle,
  Ban,
  CheckCircle2,
  ExternalLink,
  FileText,
  Loader2,
  ShieldCheck,
  UserRound,
  XCircle,
} from "lucide-react";

const STATUS_STYLE = {
  EM_ANDAMENTO: { label: "Em andamento", color: "#1d4ed8", background: "#dbeafe" },
  PASSOU: { label: "Passou", color: "#15803d", background: "#dcfce7" },
  FALHOU: { label: "Falhou", color: "#b91c1c", background: "#fee2e2" },
  BLOQUEADO: { label: "Bloqueado", color: "#b45309", background: "#fef3c7" },
  ERRO_AUTOMACAO: { label: "Erro de automação", color: "#475569", background: "#e2e8f0" },
} as const;

function formatDate(value: Date | string | null) {
  if (!value) return "Data não informada";
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function executionIcon(status: keyof typeof STATUS_STYLE) {
  const className = "h-5 w-5";
  if (status === "EM_ANDAMENTO") return <Loader2 className={`${className} animate-spin`} />;
  if (status === "PASSOU") return <CheckCircle2 className={className} />;
  if (status === "FALHOU") return <XCircle className={className} />;
  if (status === "BLOQUEADO") return <Ban className={className} />;
  return <AlertTriangle className={className} />;
}

export default function HistoryPage() {
  const { isAuthenticated, user } = useAuth();
  const [clientFilter, setClientFilter] = useState("all");
  const [projectFilter, setProjectFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const { data: clients } = trpc.clients.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: projects } = trpc.projects.list.useQuery(
    { clientId: undefined },
    { enabled: isAuthenticated },
  );
  const visibleProjects = (projects ?? []).filter(
    project => clientFilter === "all" || project.clientId === Number(clientFilter),
  );
  const {
    data: executions,
    isLoading,
    error,
  } = trpc.testExecutions.history.useQuery(
    {
      clientId: clientFilter === "all" ? undefined : Number(clientFilter),
      projectId: projectFilter === "all" ? undefined : Number(projectFilter),
      dateFrom: dateFrom || undefined,
      dateTo: dateTo || undefined,
      limit: 200,
    },
    { enabled: isAuthenticated, refetchInterval: 10_000 },
  );

  const clearFilters = () => {
    setClientFilter("all");
    setProjectFilter("all");
    setDateFrom("");
    setDateTo("");
  };

  return (
    <AppLayout>
      <main className="container max-w-6xl py-8">
        <div className="mb-6 flex items-start gap-3">
          <div className="rounded-xl bg-blue-50 p-2.5 text-blue-700">
            <Activity className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Histórico de automações</h1>
            <p className="mt-1 text-sm text-slate-500">
              {user?.role === "admin"
                ? "Visão administrativa de todas as execuções do Agente QA."
                : "Suas execuções iniciadas pelo Gerador de Plano, com resultados e relatórios."}
            </p>
          </div>
        </div>

        <Card className="mb-6 border-slate-200 shadow-sm">
          <CardContent className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-[1fr_1fr_180px_180px_auto] lg:items-end">
            <div>
              <Label className="text-xs text-slate-600">Cliente</Label>
              <Select
                value={clientFilter}
                onValueChange={value => {
                  setClientFilter(value);
                  setProjectFilter("all");
                }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos os clientes" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os clientes</SelectItem>
                  {(clients ?? []).map(client => (
                    <SelectItem key={client.id} value={String(client.id)}>
                      {client.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs text-slate-600">Projeto</Label>
              <Select value={projectFilter} onValueChange={setProjectFilter}>
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Todos os projetos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos os projetos</SelectItem>
                  {visibleProjects.map(project => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {project.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label htmlFor="execution-date-from" className="text-xs text-slate-600">
                Data inicial
              </Label>
              <Input
                id="execution-date-from"
                type="date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={event => setDateFrom(event.target.value)}
                className="mt-1"
              />
            </div>

            <div>
              <Label htmlFor="execution-date-to" className="text-xs text-slate-600">
                Data final
              </Label>
              <Input
                id="execution-date-to"
                type="date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={event => setDateTo(event.target.value)}
                className="mt-1"
              />
            </div>

            <Button type="button" variant="outline" onClick={clearFilters}>
              Limpar
            </Button>
          </CardContent>
        </Card>

        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Carregando execuções...
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="p-5 text-sm text-red-700">
              Não foi possível carregar o histórico de automações. Atualize a página e tente novamente.
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && executions?.length === 0 && (
          <Card className="border-dashed">
            <CardContent className="py-16 text-center">
              <Activity className="mx-auto mb-3 h-9 w-9 text-slate-300" />
              <p className="font-medium text-slate-600">Nenhuma automação executada ainda.</p>
              <p className="mt-1 text-sm text-slate-400">
                As execuções iniciadas no Gerador de Plano aparecerão aqui.
              </p>
            </CardContent>
          </Card>
        )}

        <div className="space-y-4">
          {executions?.map(execution => {
            const status = STATUS_STYLE[execution.status];
            return (
              <Card key={execution.id} className="overflow-hidden border-slate-200 shadow-sm">
                <CardContent className="p-0">
                  <div className="flex flex-col gap-4 p-5 lg:flex-row lg:items-start lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span
                          className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
                          style={{ color: status.color, background: status.background }}
                        >
                          {executionIcon(execution.status)}
                          {status.label}
                        </span>
                        <span className="font-mono text-xs text-slate-400">
                          {execution.externalExecutionId}
                        </span>
                      </div>

                      <h2 className="mt-3 text-base font-semibold text-slate-800">
                        {execution.projectName}
                        {execution.sprintName ? ` · ${execution.sprintName}` : ""}
                      </h2>
                      <p className="mt-1 break-all text-xs text-slate-500">
                        {execution.systemUrl || "URL do sistema não informada"}
                      </p>
                      <p className="mt-1 text-xs text-slate-400">
                        Finalizada em {formatDate(execution.finishedAt ?? execution.createdAt)}
                      </p>
                      <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                        <UserRound className="h-3.5 w-3.5" />
                        Executada por {execution.createdByName || execution.createdByUsername || "usuário não registrado"}
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      {execution.evidenceDocxUrl && (
                        <a
                          href={execution.evidenceDocxUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <FileText className="h-3.5 w-3.5" /> Evidências
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                      {execution.reliabilityReportUrl && (
                        <a
                          href={execution.reliabilityReportUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="inline-flex h-8 items-center gap-1.5 rounded-md border border-slate-200 px-3 text-xs font-medium text-slate-600 hover:bg-slate-50"
                        >
                          <ShieldCheck className="h-3.5 w-3.5" /> Confiabilidade
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 border-t border-slate-100 bg-slate-50/70 sm:grid-cols-3 lg:grid-cols-6">
                    {[
                      ["Cenários", execution.totalScenarios, "text-slate-700"],
                      ["Passaram", execution.passedScenarios, "text-green-700"],
                      ["Falharam", execution.failedScenarios, "text-red-700"],
                      ["Bloqueados", execution.blockedScenarios, "text-amber-700"],
                      ["Erros automação", execution.automationErrors, "text-slate-600"],
                      ["Cobertura", `${execution.coveragePercent}%`, "text-blue-700"],
                    ].map(([label, value, color]) => (
                      <div key={String(label)} className="border-r border-slate-100 px-4 py-3 last:border-r-0">
                        <div className={`text-lg font-bold ${color}`}>{value}</div>
                        <div className="text-[11px] text-slate-400">{label}</div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      </main>
    </AppLayout>
  );
}
