import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { CheckSquare, Users, FolderOpen, Zap, BarChart2, Shield } from "lucide-react";

export default function Home() {
  const { user, loading, isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const { data: sprints } = trpc.sprints.list.useQuery({ projectId: undefined }, { enabled: isAuthenticated });
  const { data: clients } = trpc.clients.list.useQuery(undefined, { enabled: isAuthenticated });

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.13 0.015 260)" }}>
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-white/20 border-t-white rounded-full animate-spin mx-auto mb-4" />
          <p className="text-white/60 text-sm">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.13 0.015 260)" }}>
        <div className="text-center max-w-sm px-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: "oklch(0.50 0.20 264)" }}>
            <CheckSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2" style={{ letterSpacing: "-0.02em" }}>Guia de QA</h1>
          <p className="text-white/50 text-sm mb-8">Plataforma de gestão de testes e checklists para equipes de Quality Assurance.</p>
          <Button onClick={() => startLogin()} className="w-full h-11 font-semibold" style={{ background: "oklch(0.50 0.20 264)" }}>
            Entrar com Manus
          </Button>
        </div>
      </div>
    );
  }

  const isCoordinator = user?.role === "admin";
  const recentSprints = sprints?.slice(0, 4) ?? [];

  const statusLabel: Record<string, string> = { pending: "Pendente", in_progress: "Em Teste", in_review: "Em Revisão", done: "Concluída" };
  const statusColor: Record<string, string> = { pending: "oklch(0.60 0.01 260)", in_progress: "oklch(0.55 0.18 264)", in_review: "oklch(0.55 0.20 45)", done: "oklch(0.50 0.18 145)" };

  return (
    <div className="min-h-screen" style={{ background: "oklch(0.975 0.006 80)" }}>
      {/* Header */}
      <header className="sticky top-0 z-20 border-b bg-white/90 backdrop-blur-sm" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
        <div className="container flex items-center justify-between h-14">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: "oklch(0.50 0.20 264)" }}>
              <CheckSquare className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-sm" style={{ color: "oklch(0.15 0.01 260)" }}>Guia de QA</span>
          </div>
          <nav className="flex items-center gap-1">
            {isCoordinator && (
              <>
                <Button variant="ghost" size="sm" onClick={() => navigate("/clients")} className="text-xs">Clientes</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/projects")} className="text-xs">Projetos</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/sprints")} className="text-xs">Sprints</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/coordinator")} className="text-xs">Painel</Button>
                <Button variant="ghost" size="sm" onClick={() => navigate("/users")} className="text-xs">Usuários</Button>
              </>
            )}
            <Button variant="ghost" size="sm" onClick={() => navigate("/history")} className="text-xs">Histórico</Button>
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white ml-2" style={{ background: "oklch(0.50 0.20 264)" }}>
              {user?.name?.charAt(0).toUpperCase() ?? "U"}
            </div>
          </nav>
        </div>
      </header>

      <main className="container py-8">
        {/* Welcome */}
        <div className="mb-8">
          <h1 className="text-2xl font-extrabold mb-1" style={{ color: "oklch(0.15 0.01 260)", letterSpacing: "-0.02em" }}>
            Olá, {user?.name?.split(" ")[0] ?? "QA"} 👋
          </h1>
          <p className="text-sm" style={{ color: "oklch(0.50 0.01 260)" }}>
            {isCoordinator ? "Coordenador — você tem acesso completo à plataforma." : "Analista — selecione uma sprint para iniciar o checklist."}
          </p>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {[
            { icon: <FolderOpen className="w-5 h-5" />, label: "Clientes", value: clients?.length ?? 0, color: "oklch(0.55 0.18 264)" },
            { icon: <Zap className="w-5 h-5" />, label: "Sprints", value: sprints?.length ?? 0, color: "oklch(0.55 0.20 25)" },
            { icon: <CheckSquare className="w-5 h-5" />, label: "Em Teste", value: sprints?.filter(s => s.status === "in_progress").length ?? 0, color: "oklch(0.50 0.18 145)" },
            { icon: isCoordinator ? <Shield className="w-5 h-5" /> : <BarChart2 className="w-5 h-5" />, label: isCoordinator ? "Coordenador" : "Analista", value: isCoordinator ? "Admin" : "QA", color: "oklch(0.50 0.15 45)" },
          ].map((stat, i) => (
            <Card key={i} className="border" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg flex items-center justify-center text-white" style={{ background: stat.color }}>
                    {stat.icon}
                  </div>
                  <div>
                    <div className="text-xl font-bold" style={{ color: "oklch(0.15 0.01 260)" }}>{stat.value}</div>
                    <div className="text-xs" style={{ color: "oklch(0.50 0.01 260)" }}>{stat.label}</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Sprints recentes */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold text-base" style={{ color: "oklch(0.15 0.01 260)" }}>Sprints Disponíveis</h2>
            {isCoordinator && (
              <Button size="sm" variant="outline" onClick={() => navigate("/sprints")} className="text-xs">Gerenciar Sprints</Button>
            )}
          </div>
          {recentSprints.length === 0 ? (
            <Card className="border" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
              <CardContent className="p-8 text-center">
                <p className="text-sm" style={{ color: "oklch(0.50 0.01 260)" }}>
                  {isCoordinator ? "Nenhuma sprint cadastrada. Crie clientes, projetos e sprints para começar." : "Nenhuma sprint disponível no momento. Aguarde o Coordenador criar uma sprint."}
                </p>
                {isCoordinator && (
                  <Button size="sm" className="mt-4" onClick={() => navigate("/clients")} style={{ background: "oklch(0.50 0.20 264)" }}>
                    Começar cadastro
                  </Button>
                )}
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentSprints.map(sprint => (
                <Card key={sprint.id} className="border cursor-pointer hover:shadow-md transition-shadow" style={{ borderColor: "oklch(0.88 0.008 80)" }}
                  onClick={() => navigate(`/checklist/${sprint.id}`)}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-sm truncate" style={{ color: "oklch(0.15 0.01 260)" }}>{sprint.name}</h3>
                        {sprint.description && <p className="text-xs mt-0.5 line-clamp-2" style={{ color: "oklch(0.50 0.01 260)" }}>{sprint.description}</p>}
                      </div>
                      <span className="text-xs font-medium px-2 py-0.5 rounded-full shrink-0" style={{ background: `${statusColor[sprint.status]}22`, color: statusColor[sprint.status] }}>
                        {statusLabel[sprint.status]}
                      </span>
                    </div>
                    <div className="mt-3">
                      <Button size="sm" className="w-full text-xs h-8" style={{ background: "oklch(0.50 0.20 264)" }}>
                        Abrir Checklist
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
