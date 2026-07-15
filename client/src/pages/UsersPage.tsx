import { useAuth } from "@/_core/hooks/useAuth";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Shield, User } from "lucide-react";
import { toast } from "sonner";

export default function UsersPage() {
  const { user } = useAuth();
  const [, navigate] = useLocation();
  const isCoordinator = user?.role === "admin";

  const { data: users, refetch } = trpc.users.list.useQuery(undefined, { enabled: isCoordinator });
  const updateRoleMutation = trpc.users.updateRole.useMutation({ onSuccess: () => { refetch(); toast.success("Perfil atualizado!"); } });

  if (!isCoordinator) return <div className="p-8 text-center text-sm text-gray-500">Acesso restrito ao Coordenador.</div>;

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.975 0.006 80)" }}>
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur-sm" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
        <div className="container flex items-center gap-3 h-14">
          <button onClick={() => navigate("/")} className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"><ArrowLeft className="w-4 h-4" /> Voltar</button>
          <span className="text-gray-300">|</span>
          <h1 className="font-bold text-sm">Gerenciamento de Usuários</h1>
        </div>
      </header>
      <main className="container py-8 max-w-2xl">
        <p className="text-xs text-gray-500 mb-4">Gerencie os perfis de acesso da equipe. <strong>Coordenador (Admin)</strong> tem acesso total; <strong>Analista (User)</strong> executa checklists.</p>
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
    </div>
  );
}

