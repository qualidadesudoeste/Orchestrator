import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckSquare, CloudDownload, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type SigCard = {
  id: string;
  title: string;
  description: string;
  acceptanceCriteria: string;
  status: string;
  type: string;
  updatedAt: string | null;
};

function cardsToUserStory(cards: SigCard[], projectName: string, sprintName: string) {
  const sections = cards.map((card, index) => [
    `CARD ${index + 1} — SIG #${card.id}: ${card.title}`,
    card.type ? `Tipo: ${card.type}` : "",
    card.status ? `Status: ${card.status}` : "",
    card.description ? `Descrição:\n${card.description}` : "",
    card.acceptanceCriteria ? `Critérios de aceite:\n${card.acceptanceCriteria}` : "",
  ].filter(Boolean).join("\n"));

  return [
    "Origem: SIG",
    `Projeto: ${projectName}`,
    `Sprint: ${sprintName}`,
    "",
    ...sections.flatMap((section, index) => index === sections.length - 1 ? [section] : [section, "---", ""]),
  ].join("\n");
}

export default function SigCardsImportDialog({
  open,
  onOpenChange,
  projectId,
  sprintId,
  projectName,
  sprintName,
  onImport,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: number;
  sprintId: number;
  projectName: string;
  sprintName: string;
  onImport: (userStory: string) => void;
}) {
  const contextQuery = trpc.sig.context.useQuery({ projectId, sprintId }, { enabled: open });
  const [sigProjectId, setSigProjectId] = useState("");
  const [sigSprintId, setSigSprintId] = useState("");
  const [cards, setCards] = useState<SigCard[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!contextQuery.data) return;
    setSigProjectId(contextQuery.data.sigProjectId);
    setSigSprintId(contextQuery.data.sigSprintId);
  }, [contextQuery.data]);

  useEffect(() => {
    if (!open) {
      setCards([]);
      setSelectedIds(new Set());
      setSearch("");
    }
  }, [open]);

  const saveMapping = trpc.sig.saveMapping.useMutation();
  const listCards = trpc.sig.listCards.useMutation();

  const filteredCards = useMemo(() => {
    const term = search.trim().toLocaleLowerCase("pt-BR");
    if (!term) return cards;
    return cards.filter(card => [card.id, card.title, card.description, card.status, card.type]
      .some(value => value.toLocaleLowerCase("pt-BR").includes(term)));
  }, [cards, search]);

  const persistMapping = async () => {
    if (!sigProjectId.trim() || !sigSprintId.trim()) {
      toast.error("Informe os IDs do projeto e da sprint no SIG.");
      return false;
    }
    await saveMapping.mutateAsync({
      projectId,
      sprintId,
      sigProjectId: sigProjectId.trim(),
      sigSprintId: sigSprintId.trim(),
    });
    await contextQuery.refetch();
    return true;
  };

  const handleLoadCards = async () => {
    try {
      if (!(await persistMapping())) return;
      const result = await listCards.mutateAsync({ projectId, sprintId });
      const received = result.cards as SigCard[];
      setCards(received);
      setSelectedIds(new Set(received.map(card => card.id)));
      if (received.length) toast.success(`${received.length} card(s) encontrado(s) no SIG.`);
      else toast.info("Nenhum card foi encontrado para esse projeto e sprint.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível consultar os cards do SIG.");
    }
  };

  const toggleCard = (id: string) => {
    setSelectedIds(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectedCards = cards.filter(card => selectedIds.has(card.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="!flex h-[88vh] !w-[94vw] !max-w-[1200px] flex-col overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5 pr-14">
          <DialogTitle className="flex items-center gap-2">
            <CloudDownload className="h-5 w-5 text-blue-600" /> Importar cards do SIG
          </DialogTitle>
          <DialogDescription>
            Vincule esta sprint ao SIG, consulte os cards e escolha quais serão usados para gerar o plano de testes.
          </DialogDescription>
        </DialogHeader>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-5 overflow-hidden p-6 lg:grid-cols-[330px_minmax(0,1fr)]">
          <aside className="space-y-5 overflow-y-auto rounded-xl border bg-slate-50 p-4">
            <div>
              <p className="text-sm font-semibold text-slate-900">{projectName}</p>
              <p className="text-xs text-slate-500">{sprintName}</p>
            </div>

            {contextQuery.isLoading ? (
              <div className="flex items-center gap-2 text-sm text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Carregando configuração...</div>
            ) : !contextQuery.data?.configured ? (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
                <div className="flex items-start gap-2"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" /><span>O MCP do SIG ainda não foi configurado pelo administrador em <strong>Parâmetros &gt; SIG</strong>.</span></div>
              </div>
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-900">
                Integração ativa: <strong>{contextQuery.data.setting?.name}</strong>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="sig-project-id">ID do projeto no SIG</Label>
              <Input id="sig-project-id" value={sigProjectId} onChange={event => setSigProjectId(event.target.value)} placeholder="Ex.: 123" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sig-sprint-id">ID da sprint no SIG</Label>
              <Input id="sig-sprint-id" value={sigSprintId} onChange={event => setSigSprintId(event.target.value)} placeholder="Ex.: 456" />
            </div>

            <Button className="w-full" disabled={!contextQuery.data?.configured || saveMapping.isPending || listCards.isPending} onClick={handleLoadCards}>
              {(saveMapping.isPending || listCards.isPending) ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CloudDownload className="mr-2 h-4 w-4" />}
              Consultar cards
            </Button>
            <p className="text-xs leading-relaxed text-slate-500">Os IDs ficam salvos no projeto e na sprint. O usuário e a senha do SIG permanecem protegidos no servidor.</p>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden rounded-xl border">
            <div className="flex flex-wrap items-center gap-3 border-b p-4">
              <div className="relative min-w-[220px] flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input className="pl-9" value={search} onChange={event => setSearch(event.target.value)} placeholder="Buscar por número, título, tipo ou status" />
              </div>
              {cards.length > 0 && (
                <Button variant="outline" onClick={() => setSelectedIds(selectedIds.size === cards.length ? new Set() : new Set(cards.map(card => card.id)))}>
                  <CheckSquare className="mr-2 h-4 w-4" /> {selectedIds.size === cards.length ? "Desmarcar todos" : "Selecionar todos"}
                </Button>
              )}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {!cards.length ? (
                <div className="flex h-full min-h-[260px] flex-col items-center justify-center text-center text-slate-500">
                  <CloudDownload className="mb-3 h-10 w-10 text-slate-300" />
                  <p className="font-medium">Consulte o SIG para visualizar os cards da sprint.</p>
                  <p className="mt-1 max-w-md text-sm">Depois da importação, o texto dos cards e os critérios de aceite serão enviados ao Gerador de Plano.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredCards.map(card => (
                    <label key={card.id} className={`block cursor-pointer rounded-xl border p-4 transition-colors ${selectedIds.has(card.id) ? "border-blue-300 bg-blue-50/60" : "border-slate-200 hover:bg-slate-50"}`}>
                      <div className="flex items-start gap-3">
                        <input className="mt-1 h-4 w-4" type="checkbox" checked={selectedIds.has(card.id)} onChange={() => toggleCard(card.id)} />
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-xs font-bold text-blue-700">SIG #{card.id}</span>
                            {card.type && <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-medium text-violet-700">{card.type}</span>}
                            {card.status && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-medium text-slate-600">{card.status}</span>}
                          </div>
                          <p className="mt-1 font-semibold text-slate-900">{card.title}</p>
                          {card.description && <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-slate-600">{card.description}</p>}
                          {card.acceptanceCriteria && <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-xs text-emerald-700"><strong>Critérios:</strong> {card.acceptanceCriteria}</p>}
                        </div>
                      </div>
                    </label>
                  ))}
                  {!filteredCards.length && <p className="py-16 text-center text-sm text-slate-500">Nenhum card corresponde à busca.</p>}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-4 border-t bg-slate-50 px-4 py-3">
              <span className="text-sm text-slate-600">{selectedCards.length} de {cards.length} card(s) selecionado(s)</span>
              <Button disabled={!selectedCards.length} onClick={() => onImport(cardsToUserStory(selectedCards, projectName, sprintName))}>
                Usar no plano de testes
              </Button>
            </footer>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
