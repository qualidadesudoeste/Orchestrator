import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
import AppLayout from "@/components/AppLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import {
  Wand2, FileText, Plus, Trash2, Upload, Download,
  ChevronDown, ChevronUp, Loader2, ClipboardList, History, X,
  FileJson, FileUp
} from "lucide-react";

// ─── Tipos ────────────────────────────────────────────────────────────────────
interface TestCase {
  id: string;
  titulo: string;
  prioridade: "alta" | "média" | "baixa";
  dado: string;
  quando: string;
  entao: string;
  resultado_esperado: string;
  tipo: string;
}
interface TestCard {
  categoria: string;
  casos: TestCase[];
}
interface AIResult {
  resumo: string;
  cobertura: { funcional: string[]; naoFuncional: string[]; heuristicas: string[] };
  cards: TestCard[];
}
interface Scenario {
  id: string;
  title: string;
  bdd: string;
  evidence: string;
  images: { url: string; key?: string; filename?: string }[];
}
interface EvidenceProject {
  projectId: number | null;
  projectName: string;
  clientName: string;
  sprintId: number | null;
  sprintName: string;
  version: string;
  redator: string;
  sprintObjective: string;
  testScope: string;
  scenarios: Scenario[];
}

// ─── Parser SIG (importação JSON/PDF/DOCX) ────────────────────────────────────
interface SigCard {
  codigo: string;
  resumo: string;
  projeto?: string;
  sprint?: string;
  categoria?: string;
  caminho?: string;
  descricaoInicial?: string;
  cenarios?: { numero: number; titulo: string; dado: string; quando: string; entao: string }[];
  criterios?: string[];
}

function parsearCardsSig(items: any[]): SigCard[] {
  return items.map((item): SigCard => {
    const codigo = String(item['Código'] ?? item.codigo ?? item.code ?? '');
    const resumo = String(item['Resumo'] ?? item.resumo ?? item.title ?? '');
    const descricao = String(item['Descrição'] ?? item.descricao ?? item.description ?? item.hu ?? '');
    const projeto = String(item['Projeto'] ?? item.projeto ?? item.project ?? '');
    const sprint = String(item['Sprint'] ?? item.sprint ?? '');
    const categoria = String(item['Categoria'] ?? item.categoria ?? 'Melhoria');
    // Extrair cenários BDD simples da descrição
    const cenarios: SigCard['cenarios'] = [];
    const regex = /Cen[áa]rio\s+(\d+):\s*([\s\S]+?)(?=Cen[áa]rio\s+\d+:|$)/gi;
    let m: RegExpExecArray | null;
    while ((m = regex.exec(descricao)) !== null) {
      const numero = Number(m[1]);
      const bloco = m[2].trim();
      const dadoIdx = bloco.search(/\bDado\s+que\b/i);
      const quandoIdx = bloco.search(/\bQuando\b/i);
      const entaoIdx = bloco.search(/\bEnt[aã]o\b/i);
      if (dadoIdx >= 0 && quandoIdx >= 0 && entaoIdx >= 0 && dadoIdx < quandoIdx && quandoIdx < entaoIdx) {
        const titulo = bloco.substring(0, dadoIdx).replace(/[\s.,;:]+$/, '').trim();
        const dado = bloco.substring(dadoIdx, quandoIdx).replace(/^Dado\s+que\s*/i, '').replace(/[\s,;]+$/, '').trim();
        const quando = bloco.substring(quandoIdx, entaoIdx).replace(/^Quando\s*/i, '').replace(/[\s,;]+$/, '').trim();
        const entao = bloco.substring(entaoIdx).replace(/^Ent[aã]o\s*/i, '').replace(/[\s.]+$/, '').trim();
        cenarios.push({ numero, titulo, dado, quando, entao });
      }
    }
    return { codigo, resumo, projeto: projeto || undefined, sprint: sprint || undefined, categoria, descricaoInicial: descricao, cenarios };
  }).filter(c => (c.descricaoInicial && c.descricaoInicial.length >= 20) || (c.cenarios && c.cenarios.length > 0));
}

function parsearHUDeDocumento(texto: string, fileName?: string): SigCard {
  const linhas = texto.split('\n').map(l => l.trim()).filter(Boolean);
  let codigo = '';
  let resumo = '';
  const tituloRegex = /\bHU[\s.\-_]?\s*(\d+(?:[.\-]\d+)*)(?:\s*\([^)]*\))?\s*[-–\s]+([^\n[]+?)(?:\s*\[[^\]]+\])?\s*$/im;
  for (const l of linhas.slice(0, 15)) {
    const m = l.match(tituloRegex);
    if (m) { codigo = 'HU.' + m[1].replace(/-/g, '.'); resumo = `${codigo} - ${m[2].trim()}`; break; }
  }
  if (!codigo) {
    const base = (fileName || 'documento').replace(/\.(pdf|docx)$/i, '').replace(/\s*\(\d+\)\s*$/, '').trim();
    const m = base.match(/^HU[\s.\-_]?\s*(\d+(?:[.\-]\d+)*)\s*[-–\s]+(.+)$/i);
    if (m) { codigo = 'HU.' + m[1].replace(/-/g, '.'); resumo = `${codigo} - ${m[2].trim()}`; }
    else { codigo = base.substring(0, 30) || 'HU'; resumo = base; }
  }
  // HU inline
  let descricaoInicial = resumo;
  const huInline = texto.match(/Como\s+([^,\n]+?),?\s*(?:eu\s+)?quero\s+([^,\n]+?),?\s*(?:de\s+modo\s+que|para\s+que|para)\s+([^.\n]+)/i);
  if (huInline) descricaoInicial = `Como ${huInline[1].trim()}, quero ${huInline[2].trim()}, de modo que ${huInline[3].trim()}.`;
  // Cenários
  const cenarios: SigCard['cenarios'] = [];
  const regex = /Cen[áa]rio\s+(\d+):\s*([\s\S]+?)(?=Cen[áa]rio\s+\d+:|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = regex.exec(texto)) !== null) {
    const numero = Number(m[1]);
    const bloco = m[2].trim();
    const dadoIdx = bloco.search(/\bDado\s+que\b/i);
    const quandoIdx = bloco.search(/\bQuando\b/i);
    const entaoIdx = bloco.search(/\bEnt[aã]o\b/i);
    if (dadoIdx >= 0 && quandoIdx >= 0 && entaoIdx >= 0 && dadoIdx < quandoIdx && quandoIdx < entaoIdx) {
      const titulo = bloco.substring(0, dadoIdx).replace(/[\s.,;:]+$/, '').trim();
      const dado = bloco.substring(dadoIdx, quandoIdx).replace(/^Dado\s+que\s*/i, '').replace(/[\s,;]+$/, '').trim();
      const quando = bloco.substring(quandoIdx, entaoIdx).replace(/^Quando\s*/i, '').replace(/[\s,;]+$/, '').trim();
      const entao = bloco.substring(entaoIdx).replace(/^Ent[aã]o\s*/i, '').replace(/[\s.]+$/, '').trim();
      cenarios.push({ numero, titulo, dado, quando, entao });
    }
  }
  let projeto = '';
  const projMatch = texto.match(/PROJETO\s*:\s*([^\n]+)/i);
  if (projMatch) projeto = projMatch[1].trim();
  let sprint = '';
  const sprMatch = (fileName || '').match(/SPRINT\s*(\d+)/i) || texto.match(/SPRINT\s*(\d+)/i);
  if (sprMatch) sprint = sprMatch[1].trim();
  return { codigo, resumo, projeto: projeto || undefined, sprint: sprint || undefined, categoria: 'Melhoria', descricaoInicial, cenarios };
}

function montarHUConsolidada(cards: SigCard[]): string {
  return cards.map((c, i) => {
    const parts = [`## HU ${i + 1}: ${c.resumo || `HU ${i + 1}`}${c.codigo ? ` (#${c.codigo})` : ''}`];
    if (c.descricaoInicial) parts.push(`**Descrição:** ${c.descricaoInicial}`);
    if (c.cenarios?.length) {
      parts.push(`**Cenários BDD:**\n${c.cenarios.map(cen =>
        `- **Cenário ${cen.numero}: ${cen.titulo}**\n  - Dado que ${cen.dado}\n  - Quando ${cen.quando}\n  - Então ${cen.entao}`
      ).join('\n')}`);
    }
    return parts.join('\n\n');
  }).join('\n\n---\n\n');
}

const STORAGE_KEY = "qa-planner-evidence-draft";
function loadDraft(): EvidenceProject {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return { projectId: null, projectName: "", clientName: "", sprintId: null, sprintName: "", version: "1.0", redator: "", sprintObjective: "", testScope: "", scenarios: [] };
}

// ─── Sub-componente: Gerador de Casos ─────────────────────────────────────────
function CaseGenerator({ onExport }: { onExport: (cases: TestCase[], project: { name: string; sprint: string; clientName: string }) => void }) {
  const [userStory, setUserStory] = useState("");
  const [systemType, setSystemType] = useState("web");
  const [criticality, setCriticality] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [result, setResult] = useState<AIResult | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set([0]));
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [selectedSprintId, setSelectedSprintId] = useState<string>("");
  const [importWorking, setImportWorking] = useState(false);
  const jsonRef = useRef<HTMLInputElement>(null);
  const docRef = useRef<HTMLInputElement>(null);

  // Dados do Workspace
  const { data: clients = [] } = trpc.clients.list.useQuery();
  const { data: allProjects = [] } = trpc.projects.list.useQuery({ clientId: undefined });
  const { data: allSprints = [] } = trpc.sprints.list.useQuery({ projectId: undefined });

  // Filtrar sprints pelo projeto selecionado
  const filteredSprints = selectedProjectId
    ? allSprints.filter(s => String(s.projectId) === selectedProjectId)
    : [];

  // Label "Cliente — Projeto"
  const projectLabel = (projectId: number) => {
    const proj = allProjects.find(p => p.id === projectId);
    const client = proj ? clients.find(c => c.id === proj.clientId) : null;
    return proj ? `${client?.name ?? "?"} — ${proj.name}` : String(projectId);
  };

  const selectedProject = allProjects.find(p => String(p.id) === selectedProjectId);
  const selectedSprint = allSprints.find(s => String(s.id) === selectedSprintId);
  const selectedClient = selectedProject ? clients.find(c => c.id === selectedProject.clientId) : null;

  const generateMutation = trpc.qaPlanner.generateCases.useMutation({
    onSuccess: (data) => {
      setResult(data as AIResult);
      toast.success("Casos de teste gerados com sucesso!");
    },
    onError: (err) => toast.error("Erro ao gerar casos: " + err.message),
  });

  const toggleCard = (idx: number) => {
    setExpandedCards(prev => {
      const next = new Set(prev);
      if (next.has(idx)) next.delete(idx); else next.add(idx);
      return next;
    });
  };

  const priorityColor: Record<string, string> = {
    alta: "bg-red-100 text-red-700 border-red-200",
    média: "bg-yellow-100 text-yellow-700 border-yellow-200",
    baixa: "bg-green-100 text-green-700 border-green-200",
  };

  const totalCases = result?.cards.reduce((acc, c) => acc + c.casos.length, 0) ?? 0;

  const handleGenerate = () => {
    if (!selectedProjectId) { toast.error("Selecione um projeto"); return; }
    if (!selectedSprintId) { toast.error("Selecione uma sprint"); return; }
    if (userStory.trim().length < 10) { toast.error("Informe a História de Usuário"); return; }
    generateMutation.mutate({ userStory, systemType, criticality });
  };

  const handleExport = () => {
    if (!result) return;
    const allCases = result.cards.flatMap(c => c.casos);
    onExport(allCases, {
      name: selectedProject?.name ?? "",
      sprint: selectedSprint?.name ?? "",
      clientName: selectedClient?.name ?? "",
    });
    toast.success(`${allCases.length} cenários exportados para o Editor de Evidências`);
  };

  // ─── Importar JSON ────────────────────────────────────────────────────────────
  const handleImportJSON = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportWorking(true);
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!Array.isArray(data)) {
        toast.error("JSON inválido — esperado um array de HUs.");
        return;
      }
      const cards = parsearCardsSig(data);
      if (cards.length === 0) {
        toast.error("Nenhuma HU válida no JSON. É preciso ter descrição (≥20 caracteres) ou pelo menos 1 cenário BDD.");
        return;
      }
      const totalCen = cards.reduce((acc, c) => acc + (c.cenarios?.length || 0), 0);
      setUserStory(montarHUConsolidada(cards));
      toast.success(`${cards.length} HU(s) importadas${totalCen > 0 ? ` — ${totalCen} cenário(s) BDD detectados` : ''}`);
    } catch (err: any) {
      toast.error("Erro ao ler JSON: " + err.message);
    } finally {
      setImportWorking(false);
    }
  };

  // ─── Importar PDF/DOCX ────────────────────────────────────────────────────────
  const handleImportDoc = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if (!files.length) return;
    setImportWorking(true);
    const cards: SigCard[] = [];
    const falhas: string[] = [];
    for (const file of files) {
      try {
        const formData = new FormData();
        formData.append("files", file);
        const resp = await fetch("/api/qa-extract", { method: "POST", body: formData, credentials: "include" });
        if (!resp.ok) throw new Error((await resp.json()).error ?? "Falha na extração");
        const { text } = await resp.json();
        cards.push(parsearHUDeDocumento(text, file.name));
      } catch (err: any) {
        falhas.push(`${file.name}: ${err.message}`);
      }
    }
    if (cards.length === 0) {
      toast.error("Nenhuma HU extraída. " + (falhas[0] || "Verifique o formato do arquivo."));
      setImportWorking(false);
      return;
    }
    const totalCen = cards.reduce((acc, c) => acc + (c.cenarios?.length || 0), 0);
    const totalCrit = cards.reduce((acc, c) => acc + (c.criterios?.length || 0), 0);
    setUserStory(montarHUConsolidada(cards));
    toast.success(
      `${cards.length} HU(s) importadas — ${totalCen} cenário(s) BDD, ${totalCrit} critério(s)${falhas.length > 0 ? ` — ${falhas.length} arquivo(s) com falha` : ''}`,
      { duration: falhas.length > 0 ? 6000 : 4000 }
    );
    setImportWorking(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Layout em duas colunas: painel de configuração | área de HU + resultado */}
      <div style={{ display: "grid", gridTemplateColumns: "340px 1fr", gap: "1.25rem", alignItems: "start" }}>

        {/* ── Coluna esquerda: configuração ── */}
        <Card style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: "#0f172a" }}>
              <ClipboardList className="w-4 h-4 text-blue-500" />
              Configuração
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {/* Projeto */}
            <div>
              <Label className="text-xs font-medium" style={{ color: "#374151" }}>
                Projeto <span style={{ color: "#ef4444" }}>*</span>
              </Label>
              <Select
                value={selectedProjectId}
                onValueChange={(v) => { setSelectedProjectId(v); setSelectedSprintId(""); }}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder="Selecione o projeto..." />
                </SelectTrigger>
                <SelectContent>
                  {allProjects.length === 0 ? (
                    <SelectItem value="__empty" disabled>Nenhum projeto cadastrado</SelectItem>
                  ) : allProjects.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>
                      {projectLabel(p.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Sprint */}
            <div>
              <Label className="text-xs font-medium" style={{ color: "#374151" }}>
                Sprint <span style={{ color: "#ef4444" }}>*</span>
              </Label>
              <Select
                value={selectedSprintId}
                onValueChange={setSelectedSprintId}
                disabled={!selectedProjectId}
              >
                <SelectTrigger className="mt-1">
                  <SelectValue placeholder={selectedProjectId ? "Selecione a sprint..." : "Selecione um projeto primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredSprints.length === 0 ? (
                    <SelectItem value="__empty" disabled>Nenhuma sprint neste projeto</SelectItem>
                  ) : filteredSprints.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Tipo de Sistema */}
            <div>
              <Label className="text-xs" style={{ color: "#64748b" }}>Tipo de Sistema</Label>
              <Select value={systemType} onValueChange={setSystemType}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["web", "mobile", "api", "desktop", "integração"].map(t => (
                    <SelectItem key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Criticidade */}
            <div>
              <Label className="text-xs" style={{ color: "#64748b" }}>Criticidade</Label>
              <Select value={criticality} onValueChange={v => setCriticality(v as any)}>
                <SelectTrigger className="mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Baixa</SelectItem>
                  <SelectItem value="medium">Média</SelectItem>
                  <SelectItem value="high">Alta</SelectItem>
                  <SelectItem value="critical">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* ── Coluna direita: HU + resultado ── */}
        <div className="flex flex-col gap-4">
          <Card style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
            <CardContent className="pt-4 flex flex-col gap-3">
              {/* Cabeçalho da HU com botões de importação */}
              <div className="flex items-center justify-between">
                <Label className="text-xs font-medium" style={{ color: "#374151" }}>
                  História de Usuário <span style={{ color: "#ef4444" }}>*</span>
                </Label>
                <div className="flex gap-1.5">
                  <input ref={jsonRef} type="file" accept="application/json" className="hidden" onChange={handleImportJSON} />
                  <input ref={docRef} type="file" accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" multiple className="hidden" onChange={handleImportDoc} />
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5 px-2" disabled={importWorking} onClick={() => jsonRef.current?.click()}>
                    {importWorking ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileJson className="w-3 h-3" />}
                    Importar JSON
                  </Button>
                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs gap-1.5 px-2" disabled={importWorking} onClick={() => docRef.current?.click()}>
                    {importWorking ? <Loader2 className="w-3 h-3 animate-spin" /> : <FileUp className="w-3 h-3" />}
                    Importar PDF/DOCX
                  </Button>
                </div>
              </div>
              <Textarea
                value={userStory}
                onChange={e => setUserStory(e.target.value)}
                placeholder="Cole aqui a História de Usuário, ou use os botões acima para importar de JSON, PDF ou DOCX..."
                className="resize-none text-sm"
                style={{ minHeight: "220px" }}
              />
              {/* Ações */}
              <div className="flex gap-2">
                <Button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending || !selectedProjectId || !selectedSprintId || userStory.trim().length < 10}
                  className="flex-1"
                  style={{ background: "#2563eb", color: "white" }}
                >
                  {generateMutation.isPending ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando casos...</>
                  ) : (
                    <><Wand2 className="w-4 h-4 mr-2" />Gerar Casos de Teste</>
                  )}
                </Button>
                {result && (
                  <Button onClick={handleExport} variant="outline">
                    <FileText className="w-4 h-4 mr-2" />
                    Exportar para Evidências
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Resultado da IA */}
          {result && (
            <div className="flex flex-col gap-4">
              <Card style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                <CardContent className="pt-4">
                  <p className="text-sm" style={{ color: "#334155" }}>{result.resumo}</p>
                  <div className="grid grid-cols-3 gap-3 mt-3">
                    <div style={{ background: "#f0fdf4", borderRadius: "0.5rem", padding: "0.75rem" }}>
                      <p className="text-xs mb-1" style={{ color: "#64748b" }}>Total de Casos</p>
                      <p className="text-2xl font-bold" style={{ color: "#16a34a" }}>{totalCases}</p>
                    </div>
                    <div style={{ background: "#eff6ff", borderRadius: "0.5rem", padding: "0.75rem" }}>
                      <p className="text-xs mb-1" style={{ color: "#64748b" }}>Categorias</p>
                      <p className="text-2xl font-bold" style={{ color: "#2563eb" }}>{result.cards.length}</p>
                    </div>
                    <div style={{ background: "#faf5ff", borderRadius: "0.5rem", padding: "0.75rem" }}>
                      <p className="text-xs mb-1" style={{ color: "#64748b" }}>Cobertura Funcional</p>
                      <p className="text-2xl font-bold" style={{ color: "#7c3aed" }}>{result.cobertura.funcional.length}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {result.cards.map((card, idx) => (
                <Card key={idx} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                  <CardHeader className="pb-2 cursor-pointer" onClick={() => toggleCard(idx)}>
                    <div className="flex items-center justify-between">
                      <CardTitle className="text-sm flex items-center gap-2" style={{ color: "#0f172a" }}>
                        <span className="w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white" style={{ background: "#2563eb" }}>{idx + 1}</span>
                        {card.categoria}
                        <Badge variant="outline" className="text-xs" style={{ color: "#64748b" }}>{card.casos.length} casos</Badge>
                      </CardTitle>
                      {expandedCards.has(idx) ? <ChevronUp className="w-4 h-4" style={{ color: "#94a3b8" }} /> : <ChevronDown className="w-4 h-4" style={{ color: "#94a3b8" }} />}
                    </div>
                  </CardHeader>
                  {expandedCards.has(idx) && (
                    <CardContent className="pt-0 flex flex-col gap-3">
                      {card.casos.map((caso) => (
                        <div key={caso.id} style={{ background: "#f8fafc", borderRadius: "0.5rem", padding: "0.75rem", border: "1px solid #e2e8f0" }}>
                          <div className="flex items-start justify-between gap-2 mb-2">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-xs font-mono" style={{ color: "#94a3b8" }}>{caso.id}</span>
                              <span className="text-sm font-medium" style={{ color: "#0f172a" }}>{caso.titulo}</span>
                            </div>
                            <div className="flex gap-1 flex-shrink-0">
                              <Badge className={`text-xs border ${priorityColor[caso.prioridade] ?? "bg-slate-100 text-slate-600"}`}>{caso.prioridade}</Badge>
                              <Badge variant="outline" className="text-xs" style={{ color: "#64748b" }}>{caso.tipo}</Badge>
                            </div>
                          </div>
                          <div className="grid gap-1 text-xs">
                            <p><span className="font-medium" style={{ color: "#64748b" }}>Dado:</span> <span style={{ color: "#334155" }}>{caso.dado}</span></p>
                            <p><span className="font-medium" style={{ color: "#64748b" }}>Quando:</span> <span style={{ color: "#334155" }}>{caso.quando}</span></p>
                            <p><span className="font-medium" style={{ color: "#64748b" }}>Então:</span> <span style={{ color: "#334155" }}>{caso.entao}</span></p>
                            {caso.resultado_esperado && (
                              <p><span className="font-medium" style={{ color: "#64748b" }}>Resultado:</span> <span style={{ color: "#334155" }}>{caso.resultado_esperado}</span></p>
                            )}
                          </div>
                        </div>
                      ))}
                    </CardContent>
                  )}
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Sub-componente: Editor de Evidências ─────────────────────────────────────
function EvidenceEditor({ initialProject }: { initialProject?: Partial<EvidenceProject> }) {
  const [project, setProject] = useState<EvidenceProject>(() => ({
    ...loadDraft(),
    ...(initialProject ?? {}),
  }));
  const [generating, setGenerating] = useState(false);
  const [lastDoc, setLastDoc] = useState<{ texUrl?: string; pdfUrl?: string | null; pdfError?: string } | null>(null);
  const uploadRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const [uploadingFor, setUploadingFor] = useState<string | null>(null);

  // Dados do Workspace
  const { data: clients = [] } = trpc.clients.list.useQuery();
  const { data: allProjects = [] } = trpc.projects.list.useQuery({ clientId: undefined });
  const { data: allSprints = [] } = trpc.sprints.list.useQuery({ projectId: undefined });

  const filteredSprints = project.projectId
    ? allSprints.filter(s => s.projectId === project.projectId)
    : [];

  const projectLabel = (projectId: number) => {
    const proj = allProjects.find(p => p.id === projectId);
    const client = proj ? clients.find(c => c.id === proj.clientId) : null;
    return proj ? `${client?.name ?? "?"} — ${proj.name}` : String(projectId);
  };

  const { data: history, refetch: refetchHistory } = trpc.qaPlanner.listDocuments.useQuery();
  const generateDocMutation = trpc.qaPlanner.generateDocument.useMutation({
    onSuccess: (data) => {
      setLastDoc(data as any);
      refetchHistory();
      toast.success("Documento gerado!");
    },
    onError: (err) => toast.error("Erro: " + err.message),
  });
  const deleteDocMutation = trpc.qaPlanner.deleteDocument.useMutation({
    onSuccess: () => { refetchHistory(); toast.success("Documento removido"); },
  });

  const save = (updated: EvidenceProject) => {
    setProject(updated);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
  };

  const addScenario = () => {
    save({ ...project, scenarios: [...project.scenarios, { id: crypto.randomUUID(), title: "", bdd: "", evidence: "", images: [] }] });
  };

  const updateScenario = (id: string, patch: Partial<Scenario>) => {
    save({ ...project, scenarios: project.scenarios.map(s => s.id === id ? { ...s, ...patch } : s) });
  };

  const removeScenario = (id: string) => {
    save({ ...project, scenarios: project.scenarios.filter(s => s.id !== id) });
  };

  const handleFileUpload = async (scenarioId: string, files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploadingFor(scenarioId);
    try {
      const formData = new FormData();
      Array.from(files).forEach(f => formData.append("files", f));
      const resp = await fetch("/api/qa-upload", { method: "POST", body: formData, credentials: "include" });
      if (!resp.ok) throw new Error("Upload falhou");
      const uploaded: { url: string; key: string; filename: string }[] = await resp.json();
      const scenario = project.scenarios.find(s => s.id === scenarioId);
      if (scenario) updateScenario(scenarioId, { images: [...scenario.images, ...uploaded] });
    } catch (e: any) {
      toast.error("Erro no upload: " + e.message);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleGenerate = async () => {
    if (!project.projectName) { toast.error("Selecione um projeto"); return; }
    if (!project.sprintName) { toast.error("Selecione uma sprint"); return; }
    setGenerating(true);
    setLastDoc(null);
    generateDocMutation.mutate(project);
    setGenerating(false);
  };

  return (
    <div className="flex gap-4">
      {/* Sidebar esquerda */}
      <div className="w-72 flex-shrink-0 flex flex-col gap-4" style={{ minWidth: "17rem" }}>
        <Card style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm" style={{ color: "#0f172a" }}>Dados do Projeto</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {/* Projeto — select vinculado ao Workspace */}
            <div>
              <Label className="text-xs font-medium" style={{ color: "#374151" }}>
                Projeto <span style={{ color: "#ef4444" }}>*</span>
              </Label>
              <Select
                value={project.projectId ? String(project.projectId) : ""}
                onValueChange={(v) => {
                  const proj = allProjects.find(p => String(p.id) === v);
                  const client = proj ? clients.find(c => c.id === proj.clientId) : null;
                  save({ ...project, projectId: proj?.id ?? null, projectName: proj?.name ?? "", clientName: client?.name ?? "", sprintId: null, sprintName: "" });
                }}
              >
                <SelectTrigger className="mt-1 text-sm h-8">
                  <SelectValue placeholder="Selecione o projeto..." />
                </SelectTrigger>
                <SelectContent>
                  {allProjects.length === 0 ? (
                    <SelectItem value="__empty" disabled>Nenhum projeto cadastrado</SelectItem>
                  ) : allProjects.map(p => (
                    <SelectItem key={p.id} value={String(p.id)}>{projectLabel(p.id)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Sprint — select filtrado pelo projeto */}
            <div>
              <Label className="text-xs font-medium" style={{ color: "#374151" }}>
                Sprint <span style={{ color: "#ef4444" }}>*</span>
              </Label>
              <Select
                value={project.sprintId ? String(project.sprintId) : ""}
                onValueChange={(v) => {
                  const sprint = allSprints.find(s => String(s.id) === v);
                  save({ ...project, sprintId: sprint?.id ?? null, sprintName: sprint?.name ?? "" });
                }}
                disabled={!project.projectId}
              >
                <SelectTrigger className="mt-1 text-sm h-8">
                  <SelectValue placeholder={project.projectId ? "Selecione a sprint..." : "Selecione um projeto primeiro"} />
                </SelectTrigger>
                <SelectContent>
                  {filteredSprints.length === 0 ? (
                    <SelectItem value="__empty" disabled>Nenhuma sprint neste projeto</SelectItem>
                  ) : filteredSprints.map(s => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {/* Demais campos */}
            {[
              { label: "Versão", key: "version", placeholder: "1.0" },
              { label: "Redator", key: "redator", placeholder: "Nome do analista" },
            ].map(({ label, key, placeholder }) => (
              <div key={key}>
                <Label className="text-xs" style={{ color: "#64748b" }}>{label}</Label>
                <Input
                  value={(project as any)[key]}
                  onChange={e => save({ ...project, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="text-sm mt-1 h-8"
                />
              </div>
            ))}
            <div>
              <Label className="text-xs" style={{ color: "#64748b" }}>Objetivo da Sprint</Label>
              <Textarea value={project.sprintObjective} onChange={e => save({ ...project, sprintObjective: e.target.value })} placeholder="Descreva o objetivo..." className="text-sm mt-1 resize-none" rows={2} />
            </div>
            <div>
              <Label className="text-xs" style={{ color: "#64748b" }}>Escopo dos Testes</Label>
              <Textarea value={project.testScope} onChange={e => save({ ...project, testScope: e.target.value })} placeholder="O que será testado..." className="text-sm mt-1 resize-none" rows={2} />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateDocMutation.isPending || !project.projectName || !project.sprintName}
              className="w-full" style={{ background: "#2563eb", color: "white" }}
            >
              {generateDocMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>
              ) : (
                <><FileText className="w-4 h-4 mr-2" />Gerar Documento</>
              )}
            </Button>
            {lastDoc && (
              <div style={{ background: "#f0fdf4", border: "1px solid #bbf7d0", borderRadius: "0.5rem", padding: "0.75rem" }}>
                <p className="text-xs font-medium mb-2" style={{ color: "#16a34a" }}>Documento gerado!</p>
                {lastDoc.texUrl && (
                  <a href={lastDoc.texUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-xs rounded px-2 py-1.5 transition-colors mb-1"
                    style={{ background: "#2563eb", color: "white" }}>
                    <Download className="w-3 h-3" /> Baixar .tex (Overleaf)
                  </a>
                )}
                {lastDoc.pdfError && (
                  <p className="text-xs mt-1" style={{ color: "#b45309" }}>{lastDoc.pdfError}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico */}
        <Card style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center gap-2" style={{ color: "#0f172a" }}>
              <History className="w-4 h-4" style={{ color: "#94a3b8" }} />
              Histórico
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {!history || history.length === 0 ? (
              <p className="text-xs text-center py-2" style={{ color: "#94a3b8" }}>Nenhum documento gerado</p>
            ) : history.map(doc => (
              <div key={doc.id} style={{ background: "#f8fafc", border: "1px solid #e2e8f0", borderRadius: "0.375rem", padding: "0.5rem" }} className="flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate" style={{ color: "#0f172a" }}>{doc.projectName}</p>
                  <p className="text-xs" style={{ color: "#64748b" }}>{doc.sprintName ? `Sprint ${doc.sprintName}` : ""}</p>
                  {doc.texUrl && (
                    <a href={doc.texUrl} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: "#2563eb" }}>.tex</a>
                  )}
                </div>
                <button onClick={() => deleteDocMutation.mutate({ id: doc.id })} className="hover:text-red-500 transition-colors flex-shrink-0" style={{ color: "#94a3b8" }}>
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      {/* Área de cenários */}
      <div className="flex-1 flex flex-col gap-4">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold" style={{ color: "#0f172a" }}>Cenários de Teste</h3>
          <Button onClick={addScenario} size="sm" style={{ background: "#2563eb", color: "white" }}>
            <Plus className="w-4 h-4 mr-1" /> Novo Cenário
          </Button>
        </div>
        {project.scenarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 gap-2" style={{ color: "#94a3b8" }}>
            <FileText className="w-10 h-10" style={{ color: "#cbd5e1" }} />
            <p className="text-sm">Nenhum cenário adicionado</p>
            <p className="text-xs" style={{ color: "#cbd5e1" }}>Use o Gerador de Casos e exporte, ou adicione manualmente</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {project.scenarios.map((scenario, idx) => (
              <Card key={scenario.id} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
                <CardContent className="pt-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono w-6" style={{ color: "#94a3b8" }}>{idx + 1}</span>
                    <Input value={scenario.title} onChange={e => updateScenario(scenario.id, { title: e.target.value })} placeholder="Título do cenário" className="flex-1 h-8" />
                    <button onClick={() => removeScenario(scenario.id)} className="hover:text-red-500 transition-colors" style={{ color: "#94a3b8" }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs" style={{ color: "#64748b" }}>Passos BDD</Label>
                      <Textarea value={scenario.bdd} onChange={e => updateScenario(scenario.id, { bdd: e.target.value })} placeholder={"Dado que...\nQuando...\nEntão..."} className="text-xs mt-1 resize-none" rows={4} />
                    </div>
                    <div>
                      <Label className="text-xs" style={{ color: "#64748b" }}>Resultado / Evidência</Label>
                      <Textarea value={scenario.evidence} onChange={e => updateScenario(scenario.id, { evidence: e.target.value })} placeholder="Resultado observado..." className="text-xs mt-1 resize-none" rows={4} />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs" style={{ color: "#64748b" }}>Prints / Evidências Visuais</Label>
                    <div className="mt-1 border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors" style={{ borderColor: "#cbd5e1" }} onClick={() => uploadRefs.current[scenario.id]?.click()}>
                      <Upload className="w-4 h-4 mx-auto mb-1" style={{ color: "#94a3b8" }} />
                      <p className="text-xs" style={{ color: "#94a3b8" }}>Clique para adicionar imagens</p>
                      <input ref={el => { uploadRefs.current[scenario.id] = el; }} type="file" accept="image/png,image/jpeg" multiple className="hidden" onChange={e => handleFileUpload(scenario.id, e.target.files)} />
                    </div>
                    {scenario.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {scenario.images.map((img, imgIdx) => (
                          <div key={imgIdx} className="relative group">
                            <img src={img.url} alt="" className="w-20 h-14 object-cover rounded" style={{ border: "1px solid #e2e8f0" }} />
                            <button onClick={() => updateScenario(scenario.id, { images: scenario.images.filter((_, i) => i !== imgIdx) })} className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-white text-xs hidden group-hover:flex items-center justify-center">×</button>
                          </div>
                        ))}
                        {uploadingFor === scenario.id && (
                          <div className="w-20 h-14 rounded flex items-center justify-center" style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
                            <Loader2 className="w-4 h-4 animate-spin text-blue-500" />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────
export default function QAPlannerPage() {
  const [activeTab, setActiveTab] = useState("generator");
  const [exportedCases, setExportedCases] = useState<TestCase[]>([]);
  const [exportedProject, setExportedProject] = useState<{ name: string; sprint: string; clientName: string } | null>(null);

  const handleExport = (cases: TestCase[], project: { name: string; sprint: string; clientName: string }) => {
    setExportedCases(cases);
    setExportedProject(project);
    setActiveTab("evidence");
  };

  const initialProject = exportedCases.length > 0 ? {
    projectName: exportedProject?.name ?? "",
    clientName: exportedProject?.clientName ?? "",
    sprintName: exportedProject?.sprint ?? "",
    scenarios: exportedCases.map(c => ({
      id: crypto.randomUUID(),
      title: `${c.id} — ${c.titulo}`,
      bdd: `Dado: ${c.dado}\nQuando: ${c.quando}\nEntão: ${c.entao}`,
      evidence: c.resultado_esperado ?? "",
      images: [],
    })),
  } : undefined;

  return (
    <AppLayout>
      <div style={{ padding: "1.5rem 2rem", width: "100%" }}>
        {/* Abas */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.25rem", borderBottom: "2px solid #e2e8f0", paddingBottom: "0" }}>
          {[
            { key: "generator", label: "Gerador de Casos", icon: <Wand2 style={{ width: 16, height: 16 }} /> },
            { key: "evidence", label: "Editor de Evidências", icon: <FileText style={{ width: 16, height: 16 }} />, badge: exportedCases.length > 0 ? exportedCases.length : null },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              style={{
                display: "flex", alignItems: "center", gap: "0.5rem",
                padding: "0.6rem 1.25rem",
                fontSize: "0.9rem", fontWeight: 600,
                border: "none", background: "none", cursor: "pointer",
                borderBottom: activeTab === tab.key ? "2px solid #2563eb" : "2px solid transparent",
                color: activeTab === tab.key ? "#2563eb" : "#64748b",
                marginBottom: "-2px", transition: "all 0.15s",
              }}
            >
              {tab.icon}
              {tab.label}
              {tab.badge && (
                <span style={{ background: "#2563eb", color: "white", borderRadius: "999px", fontSize: "0.7rem", padding: "0.1rem 0.45rem", fontWeight: 700 }}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        {activeTab === "generator" && <CaseGenerator onExport={handleExport} />}
        {activeTab === "evidence" && <EvidenceEditor initialProject={initialProject} />}
      </div>
    </AppLayout>
  );
}
