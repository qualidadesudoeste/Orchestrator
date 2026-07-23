import { useState } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { toast } from "sonner";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  Accessibility,
  Bug,
  CheckCircle2,
  ClipboardCopy,
  Database,
  Download,
  FileWarning,
  Gauge,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Timer,
  X,
  XCircle,
} from "lucide-react";

const STATUS_STYLE: Record<string, { background: string; color: string; label: string }> = {
  PASSOU: { background: "#dcfce7", color: "#15803d", label: "Passou" },
  FALHOU: { background: "#fee2e2", color: "#b91c1c", label: "Falhou" },
  BLOQUEADO: { background: "#fef3c7", color: "#b45309", label: "Bloqueado" },
  ERRO_AUTOMACAO: {
    background: "#e2e8f0",
    color: "#475569",
    label: "Erro de automação",
  },
  PARCIAL: { background: "#fef3c7", color: "#b45309", label: "Parcial" },
  ERRO: { background: "#e2e8f0", color: "#475569", label: "Erro" },
  NAO_EXECUTADO: {
    background: "#f1f5f9",
    color: "#64748b",
    label: "Não executado",
  },
  ABERTO: { background: "#fee2e2", color: "#b91c1c", label: "Aberto" },
  COPIADO: { background: "#e0f2fe", color: "#0369a1", label: "Copiado" },
  RESOLVIDO: { background: "#dcfce7", color: "#15803d", label: "Resolvido" },
};

const RISK_STYLE: Record<string, { background: string; color: string; label: string }> = {
  BAIXO: { background: "#dcfce7", color: "#15803d", label: "Baixo" },
  MEDIO: { background: "#fef9c3", color: "#a16207", label: "Médio" },
  ALTO: { background: "#ffedd5", color: "#c2410c", label: "Alto" },
  CRITICO: { background: "#fee2e2", color: "#b91c1c", label: "Crítico" },
};

function Badge({
  value,
  styles,
}: {
  value: string;
  styles: typeof STATUS_STYLE;
}) {
  const style = styles[value] ?? {
    background: "#f1f5f9",
    color: "#475569",
    label: value,
  };
  return (
    <span
      style={{
        background: style.background,
        color: style.color,
        padding: "3px 8px",
        borderRadius: 999,
        fontSize: 11,
        fontWeight: 700,
        whiteSpace: "nowrap",
      }}
    >
      {style.label}
    </span>
  );
}

function formatDate(value: string | Date) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function DashboardPage() {
  const { isAuthenticated } = useAuth();
  const [filterCliente, setFilterCliente] = useState("");
  const [filterProjeto, setFilterProjeto] = useState("");
  const [filterSprint, setFilterSprint] = useState("");

  const { data: clients } = trpc.clients.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });
  const { data: projects } = trpc.projects.list.useQuery(
    { clientId: filterCliente ? Number(filterCliente) : undefined },
    { enabled: isAuthenticated },
  );
  const { data: sprints } = trpc.sprints.list.useQuery(
    { projectId: filterProjeto ? Number(filterProjeto) : undefined },
    { enabled: isAuthenticated },
  );
  const metricsQuery = trpc.dashboard.metrics.useQuery(
    {
      clientId: filterCliente ? Number(filterCliente) : undefined,
      projectId: filterProjeto ? Number(filterProjeto) : undefined,
      sprintId: filterSprint ? Number(filterSprint) : undefined,
    },
    {
      enabled: isAuthenticated,
      refetchInterval: 30_000,
    },
  );

  const metrics = metricsQuery.data;
  const summary = metrics?.summary ?? {
    totalExecutions: 0,
    totalScenarios: 0,
    coveragePercent: 0,
    passRate: 0,
    failRate: 0,
    flakyRate: 0,
    flakyScenarios: 0,
    automationErrorRate: 0,
    defectsFound: 0,
    criticalDefects: 0,
    dre: null,
  };
  const nonFunctional = metrics?.nonFunctional ?? {
    summary: {
      totalRuns: 0,
      passedRuns: 0,
      failedRuns: 0,
      passRate: 0,
      latestP95Ms: null,
      latestFailureRatePercent: null,
      zapHigh: 0,
      zapMedium: 0,
      axeCritical: 0,
      axeSerious: 0,
    },
    recentRuns: [],
    topFindings: [],
  };
  const generatedDefectCards = metrics?.defectCards ?? {
    summary: {
      totalCards: 0,
      openCards: 0,
      criticalOpenCards: 0,
    },
    recentCards: [],
  };
  const hasFilters = Boolean(
    filterCliente || filterProjeto || filterSprint,
  );
  const clearFilters = () => {
    setFilterCliente("");
    setFilterProjeto("");
    setFilterSprint("");
  };
  const copyDefectCard = async (markdown: string) => {
    try {
      await navigator.clipboard.writeText(markdown);
      toast.success("Card copiado para a área de transferência.");
    } catch {
      toast.error("Não foi possível copiar o card.");
    }
  };
  const downloadDefectCard = (cardId: string, markdown: string) => {
    const blob = new Blob([markdown], {
      type: "text/markdown;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${cardId}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const cards = [
    {
      label: "Execuções",
      value: summary.totalExecutions.toLocaleString("pt-BR"),
      detail: `${summary.totalScenarios} cenários`,
      icon: Activity,
      color: "#4f46e5",
      background: "#eef2ff",
    },
    {
      label: "Cobertura executada",
      value: `${summary.coveragePercent}%`,
      detail: "Cenários executados / planejados",
      icon: Gauge,
      color: "#7c3aed",
      background: "#f3e8ff",
    },
    {
      label: "Pass Rate",
      value: `${summary.passRate}%`,
      detail: "Cenários estáveis",
      icon: CheckCircle2,
      color: "#15803d",
      background: "#dcfce7",
    },
    {
      label: "Fail Rate",
      value: `${summary.failRate}%`,
      detail: "Falhas reais confirmadas",
      icon: XCircle,
      color: "#b91c1c",
      background: "#fee2e2",
    },
    {
      label: "Flaky Rate",
      value: `${summary.flakyRate}%`,
      detail: `${summary.flakyScenarios} cenários instáveis`,
      icon: RefreshCw,
      color: "#7c3aed",
      background: "#ede9fe",
    },
    {
      label: "Defeitos encontrados",
      value: summary.defectsFound.toLocaleString("pt-BR"),
      detail: `${summary.criticalDefects} críticos`,
      icon: Bug,
      color: "#c2410c",
      background: "#ffedd5",
    },
    {
      label: "DRE",
      value: summary.dre === null ? "—" : `${summary.dre}%`,
      detail:
        summary.dre === null
          ? "Aguardando dados de defeitos"
          : "Defeitos removidos antes da produção",
      icon: ShieldCheck,
      color: "#0369a1",
      background: "#e0f2fe",
    },
  ];
  const nonFunctionalCards = [
    {
      label: "Performance p95",
      value:
        nonFunctional.summary.latestP95Ms === null
          ? "—"
          : `${nonFunctional.summary.latestP95Ms} ms`,
      detail: "Última execução k6",
      icon: Timer,
      color: "#7c3aed",
      background: "#f3e8ff",
    },
    {
      label: "Taxa de erro HTTP",
      value:
        nonFunctional.summary.latestFailureRatePercent === null
          ? "—"
          : `${nonFunctional.summary.latestFailureRatePercent}%`,
      detail: `${nonFunctional.summary.totalRuns} execuções não funcionais`,
      icon: Activity,
      color: "#0369a1",
      background: "#e0f2fe",
    },
    {
      label: "Riscos ZAP",
      value: nonFunctional.summary.zapHigh.toLocaleString("pt-BR"),
      detail: `${nonFunctional.summary.zapMedium} alertas médios`,
      icon: ShieldAlert,
      color: "#b91c1c",
      background: "#fee2e2",
    },
    {
      label: "Violações axe",
      value: nonFunctional.summary.axeCritical.toLocaleString("pt-BR"),
      detail: `${nonFunctional.summary.axeSerious} violações sérias`,
      icon: Accessibility,
      color: "#c2410c",
      background: "#ffedd5",
    },
  ];

  return (
    <AppLayout>
      <div
        style={{
          background: "#f8fafc",
          minHeight: "100vh",
          padding: 24,
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "flex-start",
            gap: 16,
            marginBottom: 20,
          }}
        >
          <div>
            <h1
              style={{
                margin: 0,
                color: "#0f172a",
                fontSize: 24,
                fontWeight: 800,
              }}
            >
              Qualidade em tempo real
            </h1>
            <p style={{ margin: "5px 0 0", color: "#64748b", fontSize: 13 }}>
              Métricas consolidadas das execuções do Agente QA.
            </p>
          </div>
          <button
            onClick={() => metricsQuery.refetch()}
            disabled={metricsQuery.isFetching}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 7,
              border: "1px solid #cbd5e1",
              borderRadius: 9,
              background: "white",
              color: "#475569",
              padding: "8px 12px",
              fontSize: 12,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <RefreshCw
              size={14}
              className={metricsQuery.isFetching ? "animate-spin" : ""}
            />
            Atualizar
          </button>
        </div>

        <div
          style={{
            background: "white",
            borderRadius: 12,
            padding: 16,
            marginBottom: 18,
            display: "flex",
            gap: 12,
            alignItems: "flex-end",
            flexWrap: "wrap",
            boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
          }}
        >
          {[
            {
              label: "Cliente",
              value: filterCliente,
              options: clients ?? [],
              onChange: (value: string) => {
                setFilterCliente(value);
                setFilterProjeto("");
                setFilterSprint("");
              },
            },
            {
              label: "Projeto",
              value: filterProjeto,
              options: projects ?? [],
              onChange: (value: string) => {
                setFilterProjeto(value);
                setFilterSprint("");
              },
            },
            {
              label: "Sprint",
              value: filterSprint,
              options: sprints ?? [],
              onChange: setFilterSprint,
            },
          ].map(filter => (
            <label
              key={filter.label}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 5,
                minWidth: 180,
              }}
            >
              <span
                style={{
                  color: "#64748b",
                  fontSize: 10,
                  fontWeight: 800,
                  textTransform: "uppercase",
                  letterSpacing: ".05em",
                }}
              >
                {filter.label}
              </span>
              <select
                value={filter.value}
                onChange={event => filter.onChange(event.target.value)}
                style={{
                  border: "1px solid #cbd5e1",
                  borderRadius: 8,
                  background: "white",
                  padding: "8px 10px",
                  color: "#334155",
                  fontSize: 12,
                }}
              >
                <option value="">Todos</option>
                {filter.options.map(option => (
                  <option key={option.id} value={option.id}>
                    {option.name}
                  </option>
                ))}
              </select>
            </label>
          ))}
          {hasFilters && (
            <button
              onClick={clearFilters}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                border: 0,
                background: "transparent",
                color: "#64748b",
                padding: "9px 4px",
                fontSize: 12,
                cursor: "pointer",
              }}
            >
              <X size={13} /> Limpar filtros
            </button>
          )}
        </div>

        {metrics && !metrics.databaseAvailable && (
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              background: "#fff7ed",
              color: "#9a3412",
              border: "1px solid #fed7aa",
              borderRadius: 10,
              padding: 14,
              marginBottom: 18,
              fontSize: 13,
            }}
          >
            <Database size={18} />
            Configure o banco MySQL para começar a consolidar as execuções.
          </div>
        )}

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))",
            gap: 12,
            marginBottom: 18,
          }}
        >
          {cards.map(card => {
            const Icon = card.icon;
            return (
              <div
                key={card.label}
                style={{
                  background: "white",
                  borderRadius: 12,
                  padding: 16,
                  boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: 13,
                  }}
                >
                  <span
                    style={{
                      color: "#64748b",
                      fontSize: 12,
                      fontWeight: 700,
                    }}
                  >
                    {card.label}
                  </span>
                  <span
                    style={{
                      display: "grid",
                      placeItems: "center",
                      width: 30,
                      height: 30,
                      borderRadius: 8,
                      color: card.color,
                      background: card.background,
                    }}
                  >
                    <Icon size={16} />
                  </span>
                </div>
                <div
                  style={{
                    color: "#0f172a",
                    fontSize: 27,
                    lineHeight: 1,
                    fontWeight: 800,
                  }}
                >
                  {card.value}
                </div>
                <div
                  style={{ color: "#94a3b8", fontSize: 10, marginTop: 7 }}
                >
                  {card.detail}
                </div>
              </div>
            );
          })}
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 2fr) minmax(280px, 1fr)",
            gap: 14,
            marginBottom: 14,
          }}
        >
          <section
            style={{
              background: "white",
              borderRadius: 12,
              padding: 17,
              boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
            }}
          >
            <h2
              style={{
                margin: "0 0 14px",
                color: "#334155",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
            >
              Evolução por sprint
            </h2>
            {metrics?.trend.length ? (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={metrics.trend}>
                  <defs>
                    <linearGradient id="coverage" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#7c3aed" stopOpacity={0.25} />
                      <stop offset="95%" stopColor="#7c3aed" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="#f1f5f9" strokeDasharray="3 3" />
                  <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} unit="%" />
                  <Tooltip formatter={(value: number) => `${value}%`} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area
                    type="monotone"
                    dataKey="coveragePercent"
                    name="Cobertura"
                    stroke="#7c3aed"
                    fill="url(#coverage)"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="passRate"
                    name="Pass Rate"
                    stroke="#16a34a"
                    fill="transparent"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="failRate"
                    name="Fail Rate"
                    stroke="#dc2626"
                    fill="transparent"
                    strokeWidth={2}
                  />
                  <Area
                    type="monotone"
                    dataKey="flakyRate"
                    name="Flaky Rate"
                    stroke="#8b5cf6"
                    fill="transparent"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
          </section>

          <section
            style={{
              background: "white",
              borderRadius: 12,
              padding: 17,
              boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
            }}
          >
            <h2
              style={{
                margin: "0 0 14px",
                color: "#334155",
                fontSize: 12,
                textTransform: "uppercase",
                letterSpacing: ".05em",
              }}
            >
              Resultados dos cenários
            </h2>
            {summary.totalScenarios > 0 ? (
              <ResponsiveContainer width="100%" height={240}>
                <PieChart>
                  <Pie
                    data={metrics?.statusDistribution ?? []}
                    dataKey="value"
                    nameKey="status"
                    innerRadius={58}
                    outerRadius={87}
                    paddingAngle={2}
                  >
                    {(metrics?.statusDistribution ?? []).map(item => (
                      <Cell key={item.status} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <EmptyState />
            )}
            <div
              style={{
                textAlign: "center",
                color: "#64748b",
                fontSize: 11,
              }}
            >
              Erros de automação: {summary.automationErrorRate}%
            </div>
          </section>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1.15fr)",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <TableCard title="Risco por módulo">
            {metrics?.modules.length ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {[
                      "Módulo",
                      "Cenários",
                      "Pass Rate",
                      "Flaky",
                      "Falhas",
                      "Risco",
                    ].map(
                      heading => (
                        <th key={heading} style={headerCellStyle}>
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {metrics.modules.map(module => (
                    <tr key={module.moduleName}>
                      <td style={cellStyle}>{module.moduleName}</td>
                      <td style={cellStyle}>{module.total}</td>
                      <td style={cellStyle}>{module.passRate}%</td>
                      <td style={cellStyle}>{module.flaky}</td>
                      <td style={cellStyle}>{module.failed}</td>
                      <td style={cellStyle}>
                        <Badge value={module.risk} styles={RISK_STYLE} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState />
            )}
          </TableCard>

          <TableCard title="Execuções recentes">
            {metrics?.recentExecutions.length ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {[
                      "Execução",
                      "Projeto / Sprint",
                      "Status",
                      "Cobertura",
                      "Flaky",
                      "Defeitos",
                      "Relatórios",
                    ].map(heading => (
                      <th key={heading} style={headerCellStyle}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {metrics.recentExecutions.map(execution => (
                    <tr key={execution.id}>
                      <td style={cellStyle}>
                        <strong style={{ color: "#334155", fontSize: 11 }}>
                          {execution.externalExecutionId}
                        </strong>
                        <div style={{ color: "#94a3b8", fontSize: 9 }}>
                          {formatDate(execution.finishedAt)}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        {execution.projectName}
                        <div style={{ color: "#94a3b8", fontSize: 9 }}>
                          {execution.sprintName || "Sem sprint"}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <Badge
                          value={execution.status}
                          styles={STATUS_STYLE}
                        />
                      </td>
                      <td style={cellStyle}>{execution.coveragePercent}%</td>
                      <td style={cellStyle}>{execution.flakyScenarios}</td>
                      <td style={cellStyle}>{execution.defectsFound}</td>
                      <td style={cellStyle}>
                        {execution.evidenceDocxUrl ||
                        execution.reliabilityReportUrl ? (
                          <div style={{ display: "flex", gap: 8 }}>
                            {execution.evidenceDocxUrl && (
                              <a
                                href={execution.evidenceDocxUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Baixar evidências DOCX"
                                style={{ color: "#4f46e5", fontSize: 10 }}
                              >
                                DOCX
                              </a>
                            )}
                            {execution.reliabilityReportUrl && (
                              <a
                                href={execution.reliabilityReportUrl}
                                target="_blank"
                                rel="noreferrer"
                                title="Abrir relatório de confiabilidade"
                                style={{ color: "#7c3aed", fontSize: 10 }}
                              >
                                HTML
                              </a>
                            )}
                          </div>
                        ) : (
                          <span style={{ color: "#cbd5e1" }}>—</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState />
            )}
          </TableCard>
        </div>

        <section style={{ marginBottom: 14 }}>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 10,
            }}
          >
            <div>
              <h2
                style={{
                  margin: 0,
                  color: "#0f172a",
                  fontSize: 17,
                  fontWeight: 800,
                }}
              >
                Qualidade não funcional
              </h2>
              <p
                style={{
                  margin: "3px 0 0",
                  color: "#64748b",
                  fontSize: 11,
                }}
              >
                Performance, segurança e acessibilidade consolidadas.
              </p>
            </div>
            <span style={{ color: "#64748b", fontSize: 11 }}>
              Pass Rate: {nonFunctional.summary.passRate}%
            </span>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))",
              gap: 12,
            }}
          >
            {nonFunctionalCards.map(card => {
              const Icon = card.icon;
              return (
                <div
                  key={card.label}
                  style={{
                    background: "white",
                    borderRadius: 12,
                    padding: 15,
                    boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      marginBottom: 10,
                    }}
                  >
                    <span
                      style={{
                        color: "#64748b",
                        fontSize: 11,
                        fontWeight: 700,
                      }}
                    >
                      {card.label}
                    </span>
                    <span
                      style={{
                        display: "grid",
                        placeItems: "center",
                        width: 29,
                        height: 29,
                        borderRadius: 8,
                        color: card.color,
                        background: card.background,
                      }}
                    >
                      <Icon size={16} />
                    </span>
                  </div>
                  <div
                    style={{
                      color: "#0f172a",
                      fontSize: 24,
                      fontWeight: 800,
                    }}
                  >
                    {card.value}
                  </div>
                  <div
                    style={{ color: "#94a3b8", fontSize: 10, marginTop: 4 }}
                  >
                    {card.detail}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 1.2fr) minmax(0, 1fr)",
            gap: 14,
            marginBottom: 20,
          }}
        >
          <TableCard title="Execuções não funcionais">
            {nonFunctional.recentRuns.length ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["Execução", "Projeto", "Status", "k6 p95", "ZAP", "axe"].map(
                      heading => (
                        <th key={heading} style={headerCellStyle}>
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {nonFunctional.recentRuns.map(run => (
                    <tr key={run.id}>
                      <td style={cellStyle}>
                        <strong style={{ color: "#334155", fontSize: 11 }}>
                          {run.externalRunId}
                        </strong>
                        <div style={{ color: "#94a3b8", fontSize: 9 }}>
                          {formatDate(run.finishedAt)}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        {run.projectName}
                        <div style={{ color: "#94a3b8", fontSize: 9 }}>
                          {run.sprintName || "Sem sprint"}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        <Badge value={run.status} styles={STATUS_STYLE} />
                      </td>
                      <td style={cellStyle}>
                        {run.k6P95Ms === null ? "—" : `${run.k6P95Ms} ms`}
                      </td>
                      <td style={cellStyle}>
                        <Badge value={run.zapStatus} styles={STATUS_STYLE} />
                      </td>
                      <td style={cellStyle}>
                        <Badge value={run.axeStatus} styles={STATUS_STYLE} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="Nenhuma execução não funcional encontrada." />
            )}
          </TableCard>

          <TableCard title="Achados prioritários">
            {nonFunctional.topFindings.length ? (
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {["Ferramenta", "Severidade", "Achado", "Qtd."].map(
                      heading => (
                        <th key={heading} style={headerCellStyle}>
                          {heading}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {nonFunctional.topFindings.map(finding => (
                    <tr key={finding.id}>
                      <td style={cellStyle}>{finding.tool}</td>
                      <td style={cellStyle}>
                        <Badge value={finding.severity} styles={RISK_STYLE} />
                      </td>
                      <td style={cellStyle}>
                        {finding.helpUrl ? (
                          <a
                            href={finding.helpUrl}
                            target="_blank"
                            rel="noreferrer"
                            style={{ color: "#4f46e5" }}
                          >
                            {finding.title}
                          </a>
                        ) : (
                          finding.title
                        )}
                      </td>
                      <td style={cellStyle}>{finding.occurrences}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState message="Nenhum achado não funcional registrado." />
            )}
          </TableCard>
        </div>

        <section
          style={{
            background: "white",
            borderRadius: 12,
            padding: 17,
            boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 12,
              marginBottom: 12,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 9 }}>
              <span
                style={{
                  display: "grid",
                  placeItems: "center",
                  width: 32,
                  height: 32,
                  borderRadius: 8,
                  color: "#b91c1c",
                  background: "#fee2e2",
                }}
              >
                <FileWarning size={17} />
              </span>
              <div>
                <h2
                  style={{
                    margin: 0,
                    color: "#334155",
                    fontSize: 12,
                    textTransform: "uppercase",
                    letterSpacing: ".05em",
                  }}
                >
                  Cards de defeito para o SIG
                </h2>
                <div style={{ color: "#94a3b8", fontSize: 10, marginTop: 3 }}>
                  {generatedDefectCards.summary.openCards} abertos ·{" "}
                  {generatedDefectCards.summary.criticalOpenCards} críticos
                </div>
              </div>
            </div>
            <span style={{ color: "#64748b", fontSize: 11 }}>
              {generatedDefectCards.summary.totalCards} cards gerados
            </span>
          </div>

          {generatedDefectCards.recentCards.length ? (
            <div style={{ overflowX: "auto" }}>
              <table style={tableStyle}>
                <thead>
                  <tr>
                    {[
                      "Card",
                      "Projeto / Sprint",
                      "Título",
                      "Severidade",
                      "Status",
                      "Ações",
                    ].map(heading => (
                      <th key={heading} style={headerCellStyle}>
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {generatedDefectCards.recentCards.map(card => (
                    <tr key={card.id}>
                      <td style={cellStyle}>
                        <strong style={{ color: "#334155", fontSize: 10 }}>
                          {card.externalCardId}
                        </strong>
                        <div style={{ color: "#94a3b8", fontSize: 9 }}>
                          {card.externalScenarioId}
                        </div>
                      </td>
                      <td style={cellStyle}>
                        {card.projectName}
                        <div style={{ color: "#94a3b8", fontSize: 9 }}>
                          {card.sprintName || "Sem sprint"}
                        </div>
                      </td>
                      <td style={{ ...cellStyle, maxWidth: 360 }}>
                        {card.title}
                      </td>
                      <td style={cellStyle}>
                        <Badge value={card.severity} styles={RISK_STYLE} />
                      </td>
                      <td style={cellStyle}>
                        <Badge value={card.status} styles={STATUS_STYLE} />
                      </td>
                      <td style={cellStyle}>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => copyDefectCard(card.markdown)}
                            title="Copiar Markdown para o SIG"
                            aria-label={`Copiar ${card.externalCardId}`}
                            style={actionButtonStyle}
                          >
                            <ClipboardCopy size={14} />
                            Copiar
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              downloadDefectCard(
                                card.externalCardId,
                                card.markdown,
                              )
                            }
                            title="Baixar arquivo Markdown"
                            aria-label={`Baixar ${card.externalCardId}`}
                            style={actionButtonStyle}
                          >
                            <Download size={14} />
                            .md
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <EmptyState message="Nenhum defeito funcional real gerou card." />
          )}
        </section>
      </div>
    </AppLayout>
  );
}

function TableCard({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section
      style={{
        background: "white",
        borderRadius: 12,
        padding: 17,
        overflowX: "auto",
        boxShadow: "0 1px 3px rgba(15,23,42,0.08)",
      }}
    >
      <h2
        style={{
          margin: "0 0 12px",
          color: "#334155",
          fontSize: 12,
          textTransform: "uppercase",
          letterSpacing: ".05em",
        }}
      >
        {title}
      </h2>
      {children}
    </section>
  );
}

function EmptyState({
  message = "Nenhuma execução encontrada para os filtros selecionados.",
}: {
  message?: string;
}) {
  return (
    <div
      style={{
        minHeight: 150,
        display: "grid",
        placeItems: "center",
        color: "#94a3b8",
        fontSize: 12,
        textAlign: "center",
      }}
    >
      {message}
    </div>
  );
}

const tableStyle: React.CSSProperties = {
  width: "100%",
  borderCollapse: "collapse",
  fontSize: 11,
};

const headerCellStyle: React.CSSProperties = {
  padding: "7px 6px",
  color: "#94a3b8",
  borderBottom: "1px solid #e2e8f0",
  textAlign: "left",
  fontSize: 9,
  textTransform: "uppercase",
  letterSpacing: ".04em",
};

const cellStyle: React.CSSProperties = {
  padding: "9px 6px",
  color: "#475569",
  borderBottom: "1px solid #f1f5f9",
  verticalAlign: "middle",
};

const actionButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 5,
  border: "1px solid #cbd5e1",
  borderRadius: 7,
  background: "white",
  color: "#475569",
  padding: "6px 8px",
  fontSize: 10,
  fontWeight: 700,
  cursor: "pointer",
  whiteSpace: "nowrap",
};
