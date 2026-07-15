import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";
import { CheckSquare, Users, FolderOpen, Zap, BarChart2, Shield, ClipboardCheck } from "lucide-react";

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
        <div className="text-center max-w-md px-6">
          <div className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-6" style={{ background: "oklch(0.50 0.20 264)" }}>
            <CheckSquare className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-3xl font-extrabold text-white mb-2" style={{ letterSpacing: "-0.02em" }}>Guia de QA</h1>
          <p className="text-white/50 text-sm mb-8">Plataforma de gestão de testes e checklists para equipes de Quality Assurance.</p>
          <Button onClick={() => startLogin()} className="w-full h-11 font-semibold mb-6" style={{ background: "oklch(0.50 0.20 264)" }}>
            Entrar com conta Manus
          </Button>
          <div className="rounded-xl p-4 text-left space-y-3" style={{ background: "oklch(0.20 0.015 260)", border: "1px solid oklch(0.30 0.01 260)" }}>
            <p className="text-white/70 text-xs font-semibold uppercase tracking-wider">Como funciona o acesso</p>
            <div className="space-y-2">
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5" style={{ background: "oklch(0.50 0.20 264)", color: "white" }}>1</span>
                <p className="text-white/60 text-xs leading-relaxed">Clique em <strong className="text-white/80">Entrar com conta Manus</strong> — qualquer membro da equipe pode acessar com sua conta Manus existente. Não é necessário criar uma nova conta.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5" style={{ background: "oklch(0.50 0.20 264)", color: "white" }}>2</span>
                <p className="text-white/60 text-xs leading-relaxed">Após o primeiro acesso, o <strong className="text-white/80">Coordenador</strong> acessa <strong className="text-white/80">Usuários</strong> no menu e promove o analista ao perfil correto.</p>
              </div>
              <div className="flex items-start gap-2.5">
                <span className="w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5" style={{ background: "oklch(0.50 0.20 264)", color: "white" }}>3</span>
                <p className="text-white/60 text-xs leading-relaxed"><strong className="text-white/80">Coordenador</strong> cadastra Clientes, Projetos e Sprints. <strong className="text-white/80">Analistas</strong> executam os checklists das sprints atribuídas.</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const isCoordinator = user?.role === "admin";
  const recentSprints = sprints?.slice(0, 4) ?? [];
  const allSprints = sprints ?? [];

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
            <div className="flex items-center gap-2">
              {allSprints.length > 0 && (
                <Button size="sm" variant="outline" onClick={() => navigate("/sprints")} className="text-xs">
                  {isCoordinator ? "Gerenciar Sprints" : "Ver todas"}
                </Button>
              )}
              {isCoordinator && (
                <Button size="sm" onClick={() => navigate("/sprints")} className="text-xs" style={{ background: "oklch(0.50 0.20 264)" }}>+ Nova Sprint</Button>
              )}
            </div>
          </div>
          {allSprints.length === 0 ? (
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
            <div className="space-y-3">
              {allSprints.map(sprint => (
                <Card key={sprint.id} className="border hover:shadow-md transition-shadow" style={{ borderColor: "oklch(0.88 0.008 80)" }}>
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: "oklch(0.50 0.20 264)22" }}>
                          <ClipboardCheck className="w-4 h-4" style={{ color: "oklch(0.50 0.20 264)" }} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <h3 className="font-semibold text-sm truncate" style={{ color: "oklch(0.15 0.01 260)" }}>{sprint.name}</h3>
                          {sprint.description && <p className="text-xs mt-0.5 line-clamp-1" style={{ color: "oklch(0.50 0.01 260)" }}>{sprint.description}</p>}
                        </div>
                      </div>
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <span className="text-xs font-medium px-2 py-0.5 rounded-full hidden sm:inline-block" style={{ background: `${statusColor[sprint.status]}22`, color: statusColor[sprint.status] }}>
                          {statusLabel[sprint.status]}
                        </span>
                        <Button size="sm" className="text-xs h-8 font-semibold flex items-center gap-1.5" style={{ background: "oklch(0.50 0.20 264)" }}
                          onClick={() => navigate(`/checklist/${sprint.id}`)}>
                          <ClipboardCheck className="w-3.5 h-3.5" />
                          Abrir Checklist
                        </Button>
                      </div>
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
