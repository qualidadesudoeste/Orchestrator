import { useState, useRef } from "react";
import { trpc } from "@/lib/trpc";
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
    alta: "bg-red-500/20 text-red-400 border-red-500/30",
    média: "bg-yellow-500/20 text-yellow-400 border-yellow-500/30",
    baixa: "bg-green-500/20 text-green-400 border-green-500/30",
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
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-base text-white flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-green-400" />
            História de Usuário
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Projeto (opcional)</Label>
              <Input
                value={projectName}
                onChange={e => setProjectName(e.target.value)}
                placeholder="Ex: Portal Cliente"
                className="bg-slate-700 border-slate-600 text-white mt-1"
              />
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Sprint (opcional)</Label>
              <Input
                value={sprintName}
                onChange={e => setSprintName(e.target.value)}
                placeholder="Ex: Sprint 40"
                className="bg-slate-700 border-slate-600 text-white mt-1"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300 text-xs">Tipo de Sistema</Label>
              <Select value={systemType} onValueChange={setSystemType}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  {["web", "mobile", "api", "desktop", "integração"].map(t => (
                    <SelectItem key={t} value={t} className="text-white">{t.charAt(0).toUpperCase() + t.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300 text-xs">Criticidade</Label>
              <Select value={criticality} onValueChange={v => setCriticality(v as any)}>
                <SelectTrigger className="bg-slate-700 border-slate-600 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="low" className="text-white">Baixa</SelectItem>
                  <SelectItem value="medium" className="text-white">Média</SelectItem>
                  <SelectItem value="high" className="text-white">Alta</SelectItem>
                  <SelectItem value="critical" className="text-white">Crítica</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div>
            <Label className="text-slate-300 text-xs">História de Usuário *</Label>
            <Textarea
              value={userStory}
              onChange={e => setUserStory(e.target.value)}
              placeholder="Como [persona], eu quero [funcionalidade] para que [benefício]..."
              className="bg-slate-700 border-slate-600 text-white mt-1 min-h-[120px] resize-none"
            />
          </div>
          <div className="flex gap-2">
            <Button
              onClick={() => generateMutation.mutate({ userStory, systemType, criticality })}
              disabled={generateMutation.isPending || userStory.trim().length < 10}
              className="bg-green-600 hover:bg-green-500 text-white flex-1"
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
                className="border-slate-600 text-slate-300 hover:text-white hover:bg-slate-700"
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
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-4">
              <p className="text-sm text-slate-300">{result.resumo}</p>
              <div className="grid grid-cols-3 gap-3 mt-3">
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">Total de Casos</p>
                  <p className="text-2xl font-bold text-green-400">{totalCases}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">Categorias</p>
                  <p className="text-2xl font-bold text-blue-400">{result.cards.length}</p>
                </div>
                <div className="bg-slate-700/50 rounded-lg p-3">
                  <p className="text-xs text-slate-400 mb-1">Cobertura</p>
                  <p className="text-2xl font-bold text-purple-400">{result.cobertura.funcional.length}</p>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Cards de casos */}
          {result.cards.map((card, idx) => (
            <Card key={idx} className="bg-slate-800 border-slate-700">
              <CardHeader
                className="pb-2 cursor-pointer"
                onClick={() => toggleCard(idx)}
              >
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm text-white flex items-center gap-2">
                    <span className="w-6 h-6 rounded-full bg-green-600 flex items-center justify-center text-xs font-bold">{idx + 1}</span>
                    {card.categoria}
                    <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{card.casos.length} casos</Badge>
                  </CardTitle>
                  {expandedCards.has(idx) ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                </div>
              </CardHeader>
              {expandedCards.has(idx) && (
                <CardContent className="pt-0 flex flex-col gap-3">
                  {card.casos.map((caso) => (
                    <div key={caso.id} className="bg-slate-700/50 rounded-lg p-3 border border-slate-600">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-mono text-slate-400">{caso.id}</span>
                          <span className="text-sm font-medium text-white">{caso.titulo}</span>
                        </div>
                        <div className="flex gap-1 flex-shrink-0">
                          <Badge className={`text-xs border ${priorityColor[caso.prioridade] ?? "bg-slate-600 text-slate-300"}`}>
                            {caso.prioridade}
                          </Badge>
                          <Badge variant="outline" className="text-xs border-slate-600 text-slate-400">{caso.tipo}</Badge>
                        </div>
                      </div>
                      <div className="grid gap-1 text-xs">
                        <p><span className="text-slate-400 font-medium">Dado:</span> <span className="text-slate-300">{caso.dado}</span></p>
                        <p><span className="text-slate-400 font-medium">Quando:</span> <span className="text-slate-300">{caso.quando}</span></p>
                        <p><span className="text-slate-400 font-medium">Então:</span> <span className="text-slate-300">{caso.entao}</span></p>
                        {caso.resultado_esperado && (
                          <p><span className="text-slate-400 font-medium">Resultado:</span> <span className="text-slate-300">{caso.resultado_esperado}</span></p>
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
      <div className="w-72 flex-shrink-0 flex flex-col gap-4">
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm text-white">Dados do Projeto</CardTitle>
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
                <Label className="text-slate-400 text-xs">{label}</Label>
                <Input
                  value={(project as any)[key]}
                  onChange={e => save({ ...project, [key]: e.target.value })}
                  placeholder={placeholder}
                  className="bg-slate-700 border-slate-600 text-white text-sm mt-1 h-8"
                />
              </div>
            ))}
            <div>
              <Label className="text-slate-400 text-xs">Objetivo da Sprint</Label>
              <Textarea
                value={project.sprintObjective}
                onChange={e => save({ ...project, sprintObjective: e.target.value })}
                placeholder="Descreva o objetivo..."
                className="bg-slate-700 border-slate-600 text-white text-sm mt-1 resize-none"
                rows={2}
              />
            </div>
            <div>
              <Label className="text-slate-400 text-xs">Escopo dos Testes</Label>
              <Textarea
                value={project.testScope}
                onChange={e => save({ ...project, testScope: e.target.value })}
                placeholder="O que será testado..."
                className="bg-slate-700 border-slate-600 text-white text-sm mt-1 resize-none"
                rows={2}
              />
            </div>
            <Button
              onClick={handleGenerate}
              disabled={generateDocMutation.isPending || !project.projectName}
              className="w-full bg-green-600 hover:bg-green-500 text-white"
            >
              {generateDocMutation.isPending ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Gerando...</>
              ) : (
                <><FileText className="w-4 h-4 mr-2" />Gerar Documento</>
              )}
            </Button>

            {lastDoc && (
              <div className="bg-green-900/20 border border-green-700 rounded-lg p-3">
                <p className="text-xs text-green-400 font-medium mb-2">Documento gerado!</p>
                {lastDoc.texUrl && (
                  <a href={lastDoc.texUrl} target="_blank" rel="noreferrer"
                    className="flex items-center gap-2 text-xs text-white bg-slate-700 hover:bg-slate-600 rounded px-2 py-1.5 transition-colors mb-1">
                    <Download className="w-3 h-3" /> Baixar .tex (Overleaf)
                  </a>
                )}
                {lastDoc.pdfError && (
                  <p className="text-xs text-yellow-400 mt-1">{lastDoc.pdfError}</p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Histórico */}
        <Card className="bg-slate-800 border-slate-700">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-white flex items-center gap-2">
              <History className="w-4 h-4 text-slate-400" />
              Histórico
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2 max-h-64 overflow-y-auto">
            {!history || history.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-2">Nenhum documento gerado</p>
            ) : history.map(doc => (
              <div key={doc.id} className="bg-slate-700/50 rounded p-2 flex items-start justify-between gap-1">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-white truncate">{doc.projectName}</p>
                  <p className="text-xs text-slate-400">{doc.sprintName ? `Sprint ${doc.sprintName}` : ""}</p>
                  {doc.texUrl && (
                    <a href={doc.texUrl} target="_blank" rel="noreferrer" className="text-xs text-green-400 hover:underline">
                      .tex
                    </a>
                  )}
                </div>
                <button
                  onClick={() => deleteDocMutation.mutate({ id: doc.id })}
                  className="text-slate-500 hover:text-red-400 transition-colors flex-shrink-0"
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
          <h3 className="text-base font-semibold text-white">Cenários de Teste</h3>
          <Button onClick={addScenario} size="sm" className="bg-green-600 hover:bg-green-500 text-white">
            <Plus className="w-4 h-4 mr-1" /> Novo Cenário
          </Button>
        </div>

        {project.scenarios.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-slate-500 gap-2">
            <FileText className="w-10 h-10" />
            <p className="text-sm">Nenhum cenário adicionado</p>
            <p className="text-xs text-slate-600">Use o Gerador de Casos e exporte, ou adicione manualmente</p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {project.scenarios.map((scenario, idx) => (
              <Card key={scenario.id} className="bg-slate-800 border-slate-700">
                <CardContent className="pt-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-mono w-6">{idx + 1}</span>
                    <Input
                      value={scenario.title}
                      onChange={e => updateScenario(scenario.id, { title: e.target.value })}
                      placeholder="Título do cenário"
                      className="bg-slate-700 border-slate-600 text-white flex-1 h-8"
                    />
                    <button onClick={() => removeScenario(scenario.id)} className="text-slate-500 hover:text-red-400 transition-colors">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-slate-400 text-xs">Passos BDD</Label>
                      <Textarea
                        value={scenario.bdd}
                        onChange={e => updateScenario(scenario.id, { bdd: e.target.value })}
                        placeholder={"Dado que...\nQuando...\nEntão..."}
                        className="bg-slate-700 border-slate-600 text-white text-xs mt-1 resize-none"
                        rows={4}
                      />
                    </div>
                    <div>
                      <Label className="text-slate-400 text-xs">Resultado / Evidência</Label>
                      <Textarea
                        value={scenario.evidence}
                        onChange={e => updateScenario(scenario.id, { evidence: e.target.value })}
                        placeholder="Resultado observado..."
                        className="bg-slate-700 border-slate-600 text-white text-xs mt-1 resize-none"
                        rows={4}
                      />
                    </div>
                  </div>
                  {/* Upload de imagens */}
                  <div>
                    <Label className="text-slate-400 text-xs">Prints / Evidências Visuais</Label>
                    <div
                      className="mt-1 border-2 border-dashed border-slate-600 rounded-lg p-3 text-center cursor-pointer hover:border-green-500 transition-colors"
                      onClick={() => uploadRefs.current[scenario.id]?.click()}
                    >
                      <Upload className="w-4 h-4 mx-auto mb-1 text-slate-500" />
                      <p className="text-xs text-slate-400">Clique para adicionar imagens</p>
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
                            <img src={img.url} alt="" className="w-20 h-14 object-cover rounded border border-slate-600" />
                            <button
                              onClick={() => updateScenario(scenario.id, { images: scenario.images.filter((_, i) => i !== imgIdx) })}
                              className="absolute -top-1 -right-1 w-4 h-4 bg-red-600 rounded-full text-white text-xs hidden group-hover:flex items-center justify-center"
                            >×</button>
                          </div>
                        ))}
                        {uploadingFor === scenario.id && (
                          <div className="w-20 h-14 bg-slate-700 rounded border border-slate-600 flex items-center justify-center">
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
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Gerador de Plano de Teste</h1>
          <p className="text-sm text-slate-400 mt-0.5">Gere casos de teste com IA e documente evidências</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="bg-slate-800 border border-slate-700">
          <TabsTrigger value="generator" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-slate-400">
            <Wand2 className="w-4 h-4 mr-2" />
            Gerador de Casos
          </TabsTrigger>
          <TabsTrigger value="evidence" className="data-[state=active]:bg-green-600 data-[state=active]:text-white text-slate-400">
            <FileText className="w-4 h-4 mr-2" />
            Editor de Evidências
            {exportedCases.length > 0 && (
              <Badge className="ml-2 bg-green-700 text-white text-xs">{exportedCases.length}</Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="generator" className="mt-4">
          <CaseGenerator onExport={handleExport} />
        </TabsContent>

        <TabsContent value="evidence" className="mt-4">
          <EvidenceEditor initialProject={initialProject} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
