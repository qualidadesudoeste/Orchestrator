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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Wand2, FileText, Plus, Trash2, Upload, Download,
  ChevronDown, ChevronUp, Loader2, ClipboardList, History, X
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
  projectName: string;
  clientName: string;
  sprintName: string;
  version: string;
  redator: string;
  sprintObjective: string;
  testScope: string;
  scenarios: Scenario[];
}

const STORAGE_KEY = "qa-planner-evidence-draft";

function loadDraft(): EvidenceProject {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s);
  } catch { /* ignore */ }
  return { projectName: "", clientName: "", sprintName: "", version: "1.0", redator: "", sprintObjective: "", testScope: "", scenarios: [] };
}

// ─── Sub-componente: Gerador de Casos ─────────────────────────────────────────
function CaseGenerator({ onExport }: { onExport: (cases: TestCase[], project: { name: string; sprint: string }) => void }) {
  const [userStory, setUserStory] = useState("");
  const [systemType, setSystemType] = useState("web");
  const [criticality, setCriticality] = useState<"low" | "medium" | "high" | "critical">("medium");
  const [result, setResult] = useState<AIResult | null>(null);
  const [expandedCards, setExpandedCards] = useState<Set<number>>(new Set([0]));
  const [projectName, setProjectName] = useState("");
  const [sprintName, setSprintName] = useState("");

  const generateMutation = trpc.qaPlanner.generateCases.useMutation({
    onSuccess: (data) => {
      setResult(data as AIResult);
      toast.success("Casos de teste gerados com sucesso!");
    },
    onError: (err) => {
      toast.error("Erro ao gerar casos: " + err.message);
    },
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

  const handleExport = () => {
    if (!result) return;
    const allCases = result.cards.flatMap(c => c.casos);
    onExport(allCases, { name: projectName, sprint: sprintName });
    toast.success(`${allCases.length} cenários exportados para o Editor de Evidências`);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Formulário de entrada */}
      <Card style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2" style={{ color: "#0f172a" }}>
            <ClipboardList className="w-4 h-4 text-green-400" />
            História de Usuário
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs" style={{ color: "#64748b" }}>Projeto (opcional)</Label>
              <Input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="Ex: Portal Cliente"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-xs" style={{ color: "#64748b" }}>Sprint (opcional)</Label>
              <Input
                value={sprintName}
                onChange={e => setSprintName(e.target.value)}
                placeholder="Ex: Sprint 40"
                className="mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
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
          </div>
          <div>
            <Label className="text-xs" style={{ color: "#64748b" }}>História de Usuário *</Label>
            <Textarea
              value={userStory}
              onChange={e => setUserStory(e.target.value)}
              placeholder="Como [persona], eu quero [funcionalidade] para que [benefício]..."
              className="mt-1 min-h-[120px] resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => generateMutation.mutate({ userStory, systemType, criticality })}
              disabled={generateMutation.isPending || userStory.trim().length < 10}
              className="flex-1" style={{ background: "#2563eb", color: "white" }}
            >
              {generateMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando casos...</>
              ) : (
                <><Wand2 className="w-4 h-4 mr-2" />Gerar Casos de Teste</>
              )}
            </Button>
            {result && (
              <Button
                onClick={handleExport}
                variant="outline"
              >
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
          {/* Resumo */}
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
                  <p className="text-xs mb-1" style={{ color: "#64748b" }}>Cobertura</p>
                  <p className="text-2xl font-bold" style={{ color: "#7c3aed" }}>{result.cobertura.funcional.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cards de casos */}
          {result.cards.map((card, idx) => (
            <Card key={idx} style={{ background: "white", border: "1px solid #e2e8f0", borderRadius: "0.75rem", boxShadow: "0 1px 3px rgba(0,0,0,0.07)" }}>
              <CardHeader
                className="pb-2 cursor-pointer"
                onClick={() => toggleCard(idx)}
              >
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
                          <Badge className={`text-xs border ${priorityColor[caso.prioridade] ?? "bg-slate-100 text-slate-600"}`}>
                            {caso.prioridade}
                          </Badge>
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
      if (scenario) {
        updateScenario(scenarioId, { images: [...scenario.images, ...uploaded] });
      }
    } catch (e: any) {
      toast.error("Erro no upload: " + e.message);
    } finally {
      setUploadingFor(null);
    }
  };

  const handleGenerate = async () => {
    if (!project.projectName) { toast.error("Informe o nome do projeto"); return; }
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
            {[
              { label: "Nome do Projeto *", key: "projectName", placeholder: "Ex: Portal Cliente" },
              { label: "Cliente", key: "clientName", placeholder: "Ex: Empresa XYZ" },
              { label: "Sprint", key: "sprintName", placeholder: "Ex: Sprint 40" },
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
              <Textarea
                value={project.sprintObjective}
                onChange={e => save({ ...project, sprintObjective: e.target.value })}
                placeholder="Descreva o objetivo..."
                className="text-sm mt-1 resize-none"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-xs" style={{ color: "#64748b" }}>Escopo dos Testes</Label>
              <Textarea
                value={project.testScope}
                onChange={e => save({ ...project, testScope: e.target.value })}
                placeholder="O que será testado..."
                className="text-sm mt-1 resize-none"
                rows={2}
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateDocMutation.isPending || !project.projectName}
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
                    <a href={doc.texUrl} target="_blank" rel="noreferrer" className="text-xs hover:underline" style={{ color: "#2563eb" }}>
                      .tex
                    </a>
                  )}
                </div>
                <button
                  onClick={() => deleteDocMutation.mutate({ id: doc.id })}
                  className="hover:text-red-500 transition-colors flex-shrink-0" style={{ color: "#94a3b8" }}
                >
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
                    <Input
                      value={scenario.title}
                      onChange={e => updateScenario(scenario.id, { title: e.target.value })}
                      placeholder="Título do cenário"
                      className="flex-1 h-8"
                    />
                    <button onClick={() => removeScenario(scenario.id)} className="hover:text-red-500 transition-colors" style={{ color: "#94a3b8" }}>
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-xs" style={{ color: "#64748b" }}>Passos BDD</Label>
                      <Textarea
                        value={scenario.bdd}
                        onChange={e => updateScenario(scenario.id, { bdd: e.target.value })}
                        placeholder={"Dado que...\nQuando...\nEntão..."}
                        className="text-xs mt-1 resize-none"
                        rows={4}
                      />
                    </div>
                    <div>
                      <Label className="text-xs" style={{ color: "#64748b" }}>Resultado / Evidência</Label>
                      <Textarea
                        value={scenario.evidence}
                        onChange={e => updateScenario(scenario.id, { evidence: e.target.value })}
                        placeholder="Resultado observado..."
                        className="text-xs mt-1 resize-none"
                        rows={4}
                      />
                    </div>
                  </div>
                  {/* Upload de imagens */}
                  <div>
                    <Label className="text-xs" style={{ color: "#64748b" }}>Prints / Evidências Visuais</Label>
                    <div
                      className="mt-1 border-2 border-dashed rounded-lg p-3 text-center cursor-pointer transition-colors"
                      style={{ borderColor: "#cbd5e1" }}
                      onClick={() => uploadRefs.current[scenario.id]?.click()}
                    >
                      <Upload className="w-4 h-4 mx-auto mb-1" style={{ color: "#94a3b8" }} />
                      <p className="text-xs" style={{ color: "#94a3b8" }}>Clique para adicionar imagens</p>
                      <input
                        ref={el => { uploadRefs.current[scenario.id] = el; }}
                        type="file"
                        accept="image/png,image/jpeg"
                        multiple
                        className="hidden"
                        onChange={e => handleFileUpload(scenario.id, e.target.files)}
                      />
                    </div>
                    {scenario.images.length > 0 && (
                      <div className="flex flex-wrap gap-2 mt-2">
                        {scenario.images.map((img, imgIdx) => (
                          <div key={imgIdx} className="relative group">
                            <img src={img.url} alt="" className="w-20 h-14 object-cover rounded" style={{ border: "1px solid #e2e8f0" }} />
                            <button
                              onClick={() => updateScenario(scenario.id, { images: scenario.images.filter((_, i) => i !== imgIdx) })}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-white text-xs hidden group-hover:flex items-center justify-center"
                            >×</button>
                          </div>
                        ))}
                        {uploadingFor === scenario.id && (
                          <div className="w-20 h-14 rounded flex items-center justify-center" style={{ background: "#f1f5f9", border: "1px solid #e2e8f0" }}>
                            <Loader2 className="w-4 h-4 animate-spin text-green-500" />
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
  const [exportedProject, setExportedProject] = useState<{ name: string; sprint: string } | null>(null);

  const handleExport = (cases: TestCase[], project: { name: string; sprint: string }) => {
    setExportedCases(cases);
    setExportedProject(project);
    setActiveTab("evidence");
  };

  // Converter casos exportados em cenários para o editor
  const initialProject = exportedCases.length > 0 ? {
    projectName: exportedProject?.name ?? "",
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
      <div style={{ padding: "2rem", maxWidth: "1100px", margin: "0 auto" }}>
        {/* Cabeçalho */}
        <div style={{ marginBottom: "1.5rem" }}>
          <h1 style={{ fontSize: "1.75rem", fontWeight: 700, color: "#0f172a", margin: 0 }}>
            Gerador de Plano de Teste
          </h1>
          <p style={{ color: "#64748b", marginTop: "0.25rem", fontSize: "0.95rem" }}>
            Gere casos de teste com IA e documente evidências
          </p>
        </div>

        {/* Abas */}
        <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.5rem", borderBottom: "2px solid #e2e8f0", paddingBottom: "0" }}>
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
