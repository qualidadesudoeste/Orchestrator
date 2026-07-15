import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Shield, User } from "lucide-react";
import { toast } from "sonner";
import AppLayout from "@/components/AppLayout";

export default function UsersPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isCoordinator = user?.role === "admin";

  const { data: users, refetch } = trpc.users.list.useQuery(undefined, { enabled: isCoordinator });
  const updateRoleMutation = trpc.users.updateRole.useMutation({ onSuccess: () => { refetch(); toast.success("Perfil atualizado!"); } });

  if (!isCoordinator) return <div className="p-8 text-center text-sm text-gray-500">Acesso restrito ao Coordenador.</div>;

  return (
    <AppLayout>
      <main className="container py-8 max-w-2xl">
        {/* Instrução de onboarding */}
        <div className="rounded-xl p-4 mb-6" style={{ background: "oklch(0.96 0.01 264)", border: "1px solid oklch(0.85 0.05 264)" }}>
          <p className="text-xs font-bold uppercase tracking-wider mb-2" style={{ color: "oklch(0.45 0.15 264)" }}>Como adicionar novos membros à equipe</p>
          <ol className="space-y-1.5">
            <li className="flex items-start gap-2 text-xs" style={{ color: "oklch(0.30 0.01 260)" }}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5" style={{ background: "oklch(0.50 0.20 264)" }}>1</span>
              O novo membro acessa o site e clica em <strong>"Entrar com conta Manus"</strong>. Não é necessário criar uma conta separada.
            </li>
            <li className="flex items-start gap-2 text-xs" style={{ color: "oklch(0.30 0.01 260)" }}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5" style={{ background: "oklch(0.50 0.20 264)" }}>2</span>
              Após o primeiro login, o usuário aparece automaticamente nesta lista com o perfil <strong>Analista</strong>.
            </li>
            <li className="flex items-start gap-2 text-xs" style={{ color: "oklch(0.30 0.01 260)" }}>
              <span className="w-4 h-4 rounded-full flex items-center justify-center text-white text-xs font-bold flex-shrink-0 mt-0.5" style={{ background: "oklch(0.50 0.20 264)" }}>3</span>
              Se necessário, promova o usuário a <strong>Coordenador</strong> clicando no botão ao lado do nome.
            </li>
          </ol>
        </div>
        <p className="text-xs text-gray-500 mb-4"><strong>Coordenador (Admin)</strong> tem acesso total à plataforma; <strong>Analista (User)</strong> executa checklists das sprints.</p>
        <div className="space-y-3">
          {users?.map(u => (
            <Card key={u.id}>
              <CardContent className="p-4 flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold text-white" style={{ background: u.role === "admin" ? "oklch(0.50 0.20 264)" : "oklch(0.60 0.01 260)" }}>
                    {(u.name ?? u.email ?? "?").charAt(0).toUpperCase()}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{u.name ?? "Sem nome"}</p>
                    <p className="text-xs text-gray-400">{u.email ?? u.openId}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium" style={{ background: u.role === "admin" ? "oklch(0.50 0.20 264)22" : "oklch(0.60 0.01 260)22", color: u.role === "admin" ? "oklch(0.50 0.20 264)" : "oklch(0.40 0.01 260)" }}>
                    {u.role === "admin" ? <Shield className="w-3 h-3" /> : <User className="w-3 h-3" />}
                    {u.role === "admin" ? "Coordenador" : "Analista"}
                  </span>
                  {u.id !== user?.id && (
                    <Button size="sm" variant="outline" className="text-xs h-7"
                      onClick={() => updateRoleMutation.mutate({ userId: u.id, role: u.role === "admin" ? "user" : "admin" })}>
                      {u.role === "admin" ? "→ Analista" : "→ Coordenador"}
                    </Button>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {users?.length === 0 && <p className="text-sm text-center text-gray-400 py-8">Nenhum usuário cadastrado.</p>}
        </div>
      </main>
  </AppLayout>
  );
}
