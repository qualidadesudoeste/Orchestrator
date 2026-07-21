import { useState, useMemo } from "react";
import AppLayout from "@/components/AppLayout";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend
} from "recharts";
import { TrendingUp, TrendingDown, Minus, ChevronRight, Sparkles, Filter, X } from "lucide-react";

// ─── Dados mockados (substituir por dados reais na integração) ───────────────
const MOCK_KPIS = {
  totalExecucoes: 5842,
  passRate: 92.3,
  failRate: 7.7,
  defeitosEncontrados: 54,
  defeitosCriticos: 8,
  modulosEmRisco: 6,
  totalExecucoesDelta: 18,
  passRateDelta: 6.7,
  failRateDelta: -6.7,
  defeitosDelta: -12,
  defeitosCriticosDelta: -20,
};

const MOCK_TENDENCIA = [
  { sprint: "S16", taxa: 12.1 }, { sprint: "S17", taxa: 11.4 }, { sprint: "S18", taxa: 13.2 },
  { sprint: "S19", taxa: 10.8 }, { sprint: "S20", taxa: 9.5 }, { sprint: "S21", taxa: 11.2 },
  { sprint: "S22", taxa: 8.9 }, { sprint: "S23", taxa: 10.1 }, { sprint: "S24", taxa: 9.3 },
  { sprint: "S25", taxa: 8.2 }, { sprint: "S26", taxa: 7.9 }, { sprint: "S27", taxa: 7.7 },
];

const MOCK_PARETO = [
  { modulo: "Financeiro", falhas: 38, acumulado: 38 },
  { modulo: "Pagamentos", falhas: 26, acumulado: 64 },
  { modulo: "Cadastro", falhas: 15, acumulado: 79 },
  { modulo: "Relatórios", falhas: 8, acumulado: 87 },
  { modulo: "Login", falhas: 5, acumulado: 92 },
  { modulo: "Outros", falhas: 8, acumulado: 100 },
];

const MOCK_CAUSAS = [
  { name: "Bug de desenvolvimento", value: 64, color: "#6366f1" },
  { name: "Ambiente indisponível", value: 28, color: "#22c55e" },
  { name: "Massa de teste", value: 18, color: "#3b82f6" },
  { name: "API externa", value: 14, color: "#f59e0b" },
  { name: "Dados inconsistentes", value: 10, color: "#f97316" },
  { name: "Script automatizado", value: 8, color: "#ec4899" },
  { name: "Outros", value: 142, color: "#94a3b8" },
];

const MOCK_HEATMAP = {
  modulos: ["Financeiro", "Pagamentos", "Cadastro", "Relatórios", "Login", "Estoque", "Outros"],
  sprints: ["S22", "S23", "S24", "S25", "S26", "S27"],
  data: [
    [4, 4, 4, 3, 4, 4],
    [3, 4, 3, 4, 3, 3],
    [2, 3, 2, 2, 3, 2],
    [2, 2, 2, 1, 2, 2],
    [1, 2, 1, 1, 1, 2],
    [2, 1, 2, 2, 1, 1],
    [1, 1, 1, 2, 1, 1],
  ],
};

const MOCK_GAPS = [
  { rank: 1, gap: "Timeout na API de Pagamentos", modulo: "Pagamentos", ocorrencias: 38, impacto: "Alto", tendencia: "up", pct: 13.4 },
  { rank: 2, gap: "Massa de teste inconsistente", modulo: "Cadastro", ocorrencias: 24, impacto: "Médio", tendencia: "neutral", pct: 8.5 },
  { rank: 3, gap: "Ambiente QA indisponível", modulo: "Geral", ocorrencias: 18, impacto: "Alto", tendencia: "down", pct: 6.3 },
  { rank: 4, gap: "Erro 500 na API de Clientes", modulo: "Financeiro", ocorrencias: 15, impacto: "Alto", tendencia: "up", pct: 5.3 },
  { rank: 5, gap: "Dados não persistem", modulo: "Cadastro", ocorrencias: 12, impacto: "Médio", tendencia: "neutral", pct: 4.2 },
];

const MOCK_RANKING = [
  { func: "Login", passRate: 99.1, bugs: 1, cobertura: 100, risco: "baixo" },
  { func: "Relatórios", passRate: 94.3, bugs: 3, cobertura: 92, risco: "baixo" },
  { func: "Cadastro", passRate: 83.2, bugs: 18, cobertura: 82, risco: "medio" },
  { func: "Pagamentos", passRate: 71.4, bugs: 28, cobertura: 71, risco: "alto" },
  { func: "Financeiro", passRate: 67.8, bugs: 42, cobertura: 69, risco: "critico" },
];

const MOCK_EFICIENCIA = {
  geral: 78,
  nuncaFalham: { count: 312, pct: 18 },
  redundantes: { count: 105, pct: 6 },
  obsoletos: { count: 42, pct: 3 },
  semExecucao: { count: 42, pct: 3 },
  tempoMedio: "00:02:34",
};

const MOCK_INSIGHTS = [
  { text: "Financeiro concentra 38% das falhas do período", highlight: "Financeiro", color: "#ef4444" },
  { text: "Ambiente QA foi responsável por 27% dos testes bloqueados", highlight: "Ambiente QA", color: "#f97316" },
  { text: "A taxa de aprovação aumentou 12% em relação à sprint anterior", highlight: "aumentou", color: "#22c55e" },
  { text: "15 testes automatizados apresentaram comportamento instável", highlight: "15 testes automatizados", color: "#6366f1" },
  { text: "Existem 42 casos de teste sem execução há mais de 90 dias", highlight: "42 casos de teste", color: "#f59e0b" },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────
const heatColor = (v: number) => {
  if (v === 4) return "#ef4444";
  if (v === 3) return "#f97316";
  if (v === 2) return "#f59e0b";
  return "#22c55e";
};

const riscoBadge = (r: string) => {
  const map: Record<string, { bg: string; text: string; label: string }> = {
    baixo: { bg: "#dcfce7", text: "#16a34a", label: "Baixo" },
    medio: { bg: "#fef9c3", text: "#ca8a04", label: "Médio" },
    alto: { bg: "#ffedd5", text: "#ea580c", label: "Alto" },
    critico: { bg: "#fee2e2", text: "#dc2626", label: "Crítico" },
  };
  const s = map[r] ?? map.baixo;
  return <span style={{ background: s.bg, color: s.text, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{s.label}</span>;
};

const impactoBadge = (i: string) => {
  const map: Record<string, { bg: string; text: string }> = {
    Alto: { bg: "#fee2e2", text: "#dc2626" },
    Médio: { bg: "#fef9c3", text: "#ca8a04" },
    Baixo: { bg: "#dcfce7", text: "#16a34a" },
  };
  const s = map[i] ?? map.Médio;
  return <span style={{ background: s.bg, color: s.text, padding: "2px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600 }}>{i}</span>;
};

const TendenciaIcon = ({ t }: { t: string }) => {
  if (t === "up") return <TrendingUp className="w-4 h-4 text-red-500" />;
  if (t === "down") return <TrendingDown className="w-4 h-4 text-green-500" />;
  return <Minus className="w-4 h-4 text-gray-400" />;
};

const Delta = ({ value, invert = false }: { value: number; invert?: boolean }) => {
  const positive = invert ? value < 0 : value > 0;
  const color = positive ? "#16a34a" : "#dc2626";
  const sign = value > 0 ? "+" : "";
  return <span style={{ color, fontSize: 12, fontWeight: 500 }}>{sign}{value}% vs período anterior</span>;
};

// ─── Componente principal ────────────────────────────────────────────────────
export default function DashboardPage() {
  const { isAuthenticated } = useAuth();
  const [activeTab, setActiveTab] = useState<"execucao" | "defeito">("execucao");
  const [filterCliente, setFilterCliente] = useState("");
  const [filterProjeto, setFilterProjeto] = useState("");
  const [filterSprint, setFilterSprint] = useState("");

  const { data: clients } = trpc.clients.list.useQuery(undefined, { enabled: isAuthenticated });
  const { data: projects } = trpc.projects.list.useQuery({ clientId: filterCliente ? Number(filterCliente) : undefined }, { enabled: isAuthenticated });
  const { data: sprints } = trpc.sprints.list.useQuery({ projectId: filterProjeto ? Number(filterProjeto) : undefined }, { enabled: isAuthenticated });

  const clearFilters = () => { setFilterCliente(""); setFilterProjeto(""); setFilterSprint(""); };
  const hasFilters = filterCliente || filterProjeto || filterSprint;

  const totalCausas = MOCK_CAUSAS.reduce((s, c) => s + c.value, 0);

  return (
    <AppLayout>
      <div style={{ background: "#f8f9fb", minHeight: "100vh", padding: "24px" }}>

        {/* ── Filtros ── */}
        <div style={{ background: "white", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", gap: 12, flex: 1, flexWrap: "wrap" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Cliente</label>
              <select value={filterCliente} onChange={e => { setFilterCliente(e.target.value); setFilterProjeto(""); setFilterSprint(""); }}
                style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "#374151", background: "white" }}>
                <option value="">Selecione (opcional)</option>
                {(clients ?? []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Projeto</label>
              <select value={filterProjeto} onChange={e => { setFilterProjeto(e.target.value); setFilterSprint(""); }}
                style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "#374151", background: "white" }}>
                <option value="">Selecione (opcional)</option>
                {(projects ?? []).map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, minWidth: 160 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: "#6b7280", textTransform: "uppercase" }}>Sprint</label>
              <select value={filterSprint} onChange={e => setFilterSprint(e.target.value)}
                style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 10px", fontSize: 13, color: "#374151", background: "white" }}>
                <option value="">Selecione (opcional)</option>
                {(sprints ?? []).map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "flex-end", paddingTop: 20 }}>
            {hasFilters && (
              <button onClick={clearFilters} style={{ display: "flex", alignItems: "center", gap: 6, border: "1px solid #e5e7eb", borderRadius: 8, padding: "6px 12px", fontSize: 13, color: "#6b7280", background: "white", cursor: "pointer" }}>
                <X className="w-3.5 h-3.5" /> Limpar filtros
              </button>
            )}
            {/* Tabs Por Execução / Por Defeito */}
            <div style={{ display: "flex", border: "1px solid #e5e7eb", borderRadius: 10, overflow: "hidden" }}>
              <button onClick={() => setActiveTab("execucao")}
                style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: activeTab === "execucao" ? "#6366f1" : "white", color: activeTab === "execucao" ? "white" : "#6b7280", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span>Por Execução</span>
                <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>Resultados dos testes</span>
              </button>
              <button onClick={() => setActiveTab("defeito")}
                style={{ padding: "6px 16px", fontSize: 12, fontWeight: 600, cursor: "pointer", border: "none", background: activeTab === "defeito" ? "#6366f1" : "white", color: activeTab === "defeito" ? "white" : "#6b7280", display: "flex", flexDirection: "column", alignItems: "center" }}>
                <span>Por Defeito</span>
                <span style={{ fontSize: 10, fontWeight: 400, opacity: 0.8 }}>Análise de bugs</span>
              </button>
            </div>
          </div>
        </div>

        {/* ── KPIs ── */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
        {[
            { label: "Total de Execuções", value: MOCK_KPIS.totalExecucoes.toLocaleString("pt-BR"), delta: MOCK_KPIS.totalExecucoesDelta, iconBg: "#ede9fe", invert: false },
            { label: "Pass Rate", value: `${MOCK_KPIS.passRate}%`, delta: MOCK_KPIS.passRateDelta, iconBg: "#dcfce7", invert: false },
            { label: "Fail Rate", value: `${MOCK_KPIS.failRate}%`, delta: MOCK_KPIS.failRateDelta, iconBg: "#fee2e2", invert: true },
            { label: "Defeitos Encontrados", value: MOCK_KPIS.defeitosEncontrados, delta: MOCK_KPIS.defeitosDelta, iconBg: "#ffedd5", invert: true },
            { label: "Defeitos Críticos", value: MOCK_KPIS.defeitosCriticos, delta: MOCK_KPIS.defeitosCriticosDelta, iconBg: "#fef9c3", invert: true },
            { label: "Módulos em Risco", value: MOCK_KPIS.modulosEmRisco, delta: null, iconBg: "#dbeafe", link: "Ver detalhes" },
          ].map((kpi, i) => (
            <div key={i} style={{ background: "white", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
              <div style={{ marginBottom: 10 }}>
                <span style={{ fontSize: 14, color: "#6b7280", fontWeight: 600 }}>{kpi.label}</span>
              </div>
              <div style={{ fontSize: 28, fontWeight: 700, color: "#111827", marginBottom: 4 }}>{kpi.value}</div>
              {kpi.delta !== null && kpi.delta !== undefined ? (
                <Delta value={kpi.delta} invert={kpi.invert} />
              ) : (
                <span style={{ fontSize: 12, color: "#6366f1", fontWeight: 500, cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
                  Ver detalhes <ChevronRight className="w-3 h-3" />
                </span>
              )}
            </div>
          ))}
        </div>

        {/* ── Insights Inteligentes ── */}
        <div style={{ background: "white", borderRadius: 12, padding: "16px 20px", marginBottom: 20, boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <span style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>INSIGHTS INTELIGENTES</span>
            </div>
            <span style={{ fontSize: 12, color: "#6366f1", cursor: "pointer", display: "flex", alignItems: "center", gap: 2 }}>
              Ver todos os insights <ChevronRight className="w-3 h-3" />
            </span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 10 }}>
            {MOCK_INSIGHTS.map((ins, i) => (
              <div key={i} style={{ border: "1px solid #f3f4f6", borderRadius: 8, padding: "10px 12px", fontSize: 12, color: "#374151", lineHeight: 1.5 }}>
                {ins.text.split(ins.highlight).map((part, j, arr) => (
                  <span key={j}>{part}{j < arr.length - 1 && <strong style={{ color: ins.color }}>{ins.highlight}</strong>}</span>
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* ── Gráficos linha 1: Tendência + Pareto + Causas + Heatmap ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 12, marginBottom: 12 }}>

          {/* Tendência de Falhas */}
          <div style={{ background: "white", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Tendência de Falhas</div>
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={MOCK_TENDENCIA}>
                <defs>
                  <linearGradient id="gradFail" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
                <XAxis dataKey="sprint" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v: any) => [`${v}%`, "Taxa de Falhas"]} />
                <Area type="monotone" dataKey="taxa" stroke="#ef4444" fill="url(#gradFail)" strokeWidth={2}
                  label={({ x, y, value, index }: any) => index === MOCK_TENDENCIA.length - 1 ?
                    <text x={x} y={y - 8} fill="#ef4444" fontSize={11} fontWeight={700}>{value}%</text> : null} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Pareto de Módulos */}
          <div style={{ background: "white", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Pareto de Módulos (Falhas)</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {MOCK_PARETO.map((p, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11 }}>
                  <span style={{ width: 70, color: "#374151", fontWeight: 500, flexShrink: 0 }}>{p.modulo}</span>
                  <div style={{ flex: 1, background: "#f3f4f6", borderRadius: 4, height: 14, overflow: "hidden" }}>
                    <div style={{ width: `${p.falhas}%`, height: "100%", background: i < 2 ? "#ef4444" : i < 4 ? "#6366f1" : "#3b82f6", borderRadius: 4 }} />
                  </div>
                  <span style={{ width: 30, color: "#6b7280", textAlign: "right" }}>{p.falhas}%</span>
                </div>
              ))}
            </div>
          </div>

          {/* Causas das Falhas */}
          <div style={{ background: "white", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Causas das Falhas</div>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <ResponsiveContainer width={120} height={120}>
                <PieChart>
                  <Pie data={MOCK_CAUSAS} cx="50%" cy="50%" innerRadius={30} outerRadius={55} dataKey="value" paddingAngle={2}>
                    {MOCK_CAUSAS.map((c, i) => <Cell key={i} fill={c.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: any, n: any, p: any) => [`${v} (${((v / totalCausas) * 100).toFixed(1)}%)`, p.payload.name]} />
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 3 }}>
                {MOCK_CAUSAS.slice(0, 6).map((c, i) => (
                  <div key={i} style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10 }}>
                    <span style={{ width: 8, height: 8, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                    <span style={{ color: "#374151", flex: 1 }}>{c.name}</span>
                    <span style={{ color: "#6b7280" }}>{c.value}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ textAlign: "center", marginTop: 4, fontSize: 11, color: "#6b7280" }}>Total <strong>{totalCausas}</strong></div>
          </div>

          {/* Heatmap de Risco por Módulo */}
          <div style={{ background: "white", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Heatmap de Risco por Módulo</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                <thead>
                  <tr>
                    <th style={{ textAlign: "left", padding: "2px 4px", color: "#6b7280", fontWeight: 600 }}>Módulo</th>
                    {MOCK_HEATMAP.sprints.map(s => <th key={s} style={{ padding: "2px 4px", color: "#6b7280", fontWeight: 600, textAlign: "center" }}>{s}</th>)}
                  </tr>
                </thead>
                <tbody>
                  {MOCK_HEATMAP.modulos.map((mod, i) => (
                    <tr key={i}>
                      <td style={{ padding: "3px 4px", color: "#374151", fontWeight: 500, whiteSpace: "nowrap" }}>{mod}</td>
                      {MOCK_HEATMAP.data[i].map((v, j) => (
                        <td key={j} style={{ padding: "3px 4px", textAlign: "center" }}>
                          <div style={{ width: 22, height: 18, borderRadius: 3, background: heatColor(v), margin: "0 auto" }} />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8, fontSize: 10, flexWrap: "wrap" }}>
              {[{ color: "#22c55e", label: "Baixo" }, { color: "#f59e0b", label: "Médio" }, { color: "#f97316", label: "Alto" }, { color: "#ef4444", label: "Crítico" }].map(l => (
                <span key={l.label} style={{ display: "flex", alignItems: "center", gap: 3 }}>
                  <span style={{ width: 10, height: 10, borderRadius: 2, background: l.color }} />
                  <span style={{ color: "#6b7280" }}>{l.label}</span>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Gráficos linha 2: Gaps + Ranking + Eficiência ── */}
        <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1.4fr 1fr", gap: 12 }}>

          {/* Maiores Gaps */}
          <div style={{ background: "white", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Maiores Gaps Identificados</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                  {["Gap", "Módulo", "Ocorr.", "Impacto", "Tend.", "% Total"].map(h => (
                    <th key={h} style={{ padding: "4px 6px", color: "#9ca3af", fontWeight: 600, textAlign: "left", fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_GAPS.map((g, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f9fafb" }}>
                    <td style={{ padding: "6px", color: "#374151" }}>
                      <span style={{ color: "#9ca3af", marginRight: 4 }}>({g.rank})</span>{g.gap}
                    </td>
                    <td style={{ padding: "6px", color: "#6b7280" }}>{g.modulo}</td>
                    <td style={{ padding: "6px", color: "#374151", fontWeight: 600 }}>{g.ocorrencias}</td>
                    <td style={{ padding: "6px" }}>{impactoBadge(g.impacto)}</td>
                    <td style={{ padding: "6px" }}><TendenciaIcon t={g.tendencia} /></td>
                    <td style={{ padding: "6px", color: "#374151" }}>{g.pct}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Ranking de Funcionalidades */}
          <div style={{ background: "white", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Ranking de Funcionalidades</div>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ borderBottom: "1px solid #f3f4f6" }}>
                  {["Funcionalidade", "Pass Rate", "Bugs", "Cobertura", "Risco"].map(h => (
                    <th key={h} style={{ padding: "4px 6px", color: "#9ca3af", fontWeight: 600, textAlign: "left", fontSize: 10 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {MOCK_RANKING.map((r, i) => (
                  <tr key={i} style={{ borderBottom: "1px solid #f9fafb" }}>
                    <td style={{ padding: "6px", color: "#374151", fontWeight: 500 }}>{r.func}</td>
                    <td style={{ padding: "6px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                        <div style={{ width: 50, background: "#f3f4f6", borderRadius: 4, height: 6, overflow: "hidden" }}>
                          <div style={{ width: `${r.passRate}%`, height: "100%", background: r.passRate > 90 ? "#22c55e" : r.passRate > 75 ? "#f59e0b" : "#ef4444", borderRadius: 4 }} />
                        </div>
                        <span style={{ color: "#374151" }}>{r.passRate}%</span>
                      </div>
                    </td>
                    <td style={{ padding: "6px", color: "#374151" }}>{r.bugs}</td>
                    <td style={{ padding: "6px", color: "#374151" }}>{r.cobertura}%</td>
                    <td style={{ padding: "6px" }}>{riscoBadge(r.risco)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Eficiência dos Testes */}
          <div style={{ background: "white", borderRadius: 12, padding: "16px", boxShadow: "0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#374151", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.05em" }}>Eficiência dos Testes</div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 12 }}>
              {/* Gauge simplificado */}
              <div style={{ position: "relative", width: 130, height: 80 }}>
                <svg viewBox="0 0 100 60" width="130" height="75">
                  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#f3f4f6" strokeWidth="10" strokeLinecap="round" />
                  <path d="M 10 50 A 40 40 0 0 1 90 50" fill="none" stroke="#6366f1" strokeWidth="10" strokeLinecap="round"
                    strokeDasharray={`${(MOCK_EFICIENCIA.geral / 100) * 125.6} 125.6`} />
                  <text x="50" y="44" textAnchor="middle" fontSize="15" fontWeight="700" fill="#111827">{MOCK_EFICIENCIA.geral}%</text>
                  <text x="50" y="55" textAnchor="middle" fontSize="7" fill="#6b7280">Eficiência Geral</text>
                </svg>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {[
                { label: "Testes que nunca falham", count: MOCK_EFICIENCIA.nuncaFalham.count, pct: MOCK_EFICIENCIA.nuncaFalham.pct },
                { label: "Testes redundantes", count: MOCK_EFICIENCIA.redundantes.count, pct: MOCK_EFICIENCIA.redundantes.pct },
                { label: "Casos obsoletos", count: MOCK_EFICIENCIA.obsoletos.count, pct: MOCK_EFICIENCIA.obsoletos.pct },
                { label: "Casos sem execução >90d", count: MOCK_EFICIENCIA.semExecucao.count, pct: MOCK_EFICIENCIA.semExecucao.pct },
                { label: "Tempo médio por execução", count: MOCK_EFICIENCIA.tempoMedio, pct: null },
              ].map((item, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11 }}>
                  <span style={{ color: "#374151" }}>{item.label}</span>
                  <span style={{ fontWeight: 600, color: "#111827" }}>
                    {item.count}{item.pct !== null ? ` (${item.pct}%)` : ""}
                  </span>
                </div>
              ))}
            </div>
            <div style={{ marginTop: 12, textAlign: "center" }}>
              <span style={{ fontSize: 12, color: "#6366f1", cursor: "pointer", display: "inline-flex", alignItems: "center", gap: 2 }}>
                Ver oportunidades de melhoria <ChevronRight className="w-3 h-3" />
              </span>
            </div>
          </div>
        </div>

        {/* ── Nota de rodapé ── */}
        <div style={{ marginTop: 16, fontSize: 11, color: "#9ca3af", display: "flex", alignItems: "center", gap: 6 }}>
          <span>ℹ️</span>
          <span>Os dados apresentados são baseados nas execuções de testes realizadas no período selecionado e podem sofrer alterações conforme novas execuções forem realizadas.</span>
        </div>
      </div>
    </AppLayout>
  );
}
