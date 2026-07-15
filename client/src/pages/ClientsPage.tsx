import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";
import AppLayout from "@/components/AppLayout";

export default function ClientsPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isCoordinator = user?.role === "admin";

  const { data: clients, refetch } = trpc.clients.list.useQuery();
  const createMutation = trpc.clients.create.useMutation({ onSuccess: () => { refetch(); setForm({ name: "", description: "" }); toast.success("Cliente criado!"); } });
  const updateMutation = trpc.clients.update.useMutation({ onSuccess: () => { refetch(); setEditing(null); toast.success("Cliente atualizado!"); } });
  const deleteMutation = trpc.clients.delete.useMutation({ onSuccess: () => { refetch(); toast.success("Cliente removido!"); } });

  const [form, setForm] = useState({ name: "", description: "" });
  const [editing, setEditing] = useState<{ id: number; name: string; description: string } | null>(null);

  if (!isCoordinator) return <div className="p-8 text-center text-sm text-gray-500">Acesso restrito ao Coordenador.</div>;

  return (
    <AppLayout>
      <main className="container py-8 max-w-2xl">
        <Card className="mb-6">
          <CardHeader><CardTitle className="text-base">Novo Cliente</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <Input placeholder="Nome do cliente *" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            <Input placeholder="Descrição (opcional)" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} />
            <Button onClick={() => createMutation.mutate(form)} disabled={!form.name || createMutation.isPending} style={{ background: "oklch(0.50 0.20 264)" }}>
              <Plus className="w-4 h-4 mr-1" /> {createMutation.isPending ? "Criando..." : "Criar Cliente"}
            </Button>
          </CardContent>
        </Card>
        <div className="space-y-3">
          {clients?.map(client => (
            <Card key={client.id}>
              <CardContent className="p-4">
                {editing?.id === client.id ? (
                  <div className="space-y-2">
                    <Input value={editing.name} onChange={e => setEditing(ed => ed ? { ...ed, name: e.target.value } : null)} />
                    <Input value={editing.description} onChange={e => setEditing(ed => ed ? { ...ed, description: e.target.value } : null)} />
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => updateMutation.mutate({ id: editing.id, name: editing.name, description: editing.description })} style={{ background: "oklch(0.50 0.20 264)" }}>Salvar</Button>
                      <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Cancelar</Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-semibold text-sm">{client.name}</p>
                      {client.description && <p className="text-xs text-gray-500 mt-0.5">{client.description}</p>}
                    </div>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="w-7 h-7" onClick={() => setEditing({ id: client.id, name: client.name, description: client.description ?? "" })}><Pencil className="w-3.5 h-3.5" /></Button>
                      <Button size="icon" variant="ghost" className="w-7 h-7 text-red-500 hover:text-red-700" onClick={() => deleteMutation.mutate({ id: client.id })}><Trash2 className="w-3.5 h-3.5" /></Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {clients?.length === 0 && <p className="text-sm text-center text-gray-400 py-8">Nenhum cliente cadastrado.</p>}
        </div>
      </main>
  </AppLayout>
  );
}
