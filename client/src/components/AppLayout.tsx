import { useAuth } from "@/_core/hooks/useAuth";
import { startLogin } from "@/const";
import { useLocation } from "wouter";
import {
  CheckSquare, LayoutDashboard, Users, Folder, Zap, ClipboardList,
  History, Shield, LogOut, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/", exact: true },
  { label: "Clientes", icon: Folder, path: "/clients" },
  { label: "Projetos", icon: ClipboardList, path: "/projects" },
  { label: "Sprints", icon: Zap, path: "/sprints" },
  { label: "Histórico", icon: History, path: "/history" },
];

const ADMIN_ITEMS = [
  { label: "Painel QA", icon: Shield, path: "/coordinator" },
  { label: "Usuários", icon: Users, path: "/users" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [location, navigate] = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: "oklch(0.13 0.015 260)" }}>
        <div className="text-center">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center mx-auto mb-3" style={{ background: "oklch(0.50 0.20 264)" }}>
            <CheckSquare className="w-5 h-5 text-white" />
          </div>
          <p className="text-xs" style={{ color: "oklch(0.5 0.01 260)" }}>Carregando...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex" style={{ background: "oklch(0.13 0.015 260)" }}>
        {/* Sidebar decorativa */}
        <aside className="w-64 flex flex-col border-r" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="px-5 pt-8 pb-6 border-b" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
            <div className="flex items-center gap-2.5 mb-6">
              <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "oklch(0.50 0.20 264)" }}>
                <CheckSquare className="w-4 h-4 text-white" />
              </div>
              <div>
                <div className="text-white font-bold text-sm">Guia de QA</div>
                <div className="text-xs" style={{ color: "oklch(0.5 0.01 260)" }}>Plataforma Operacional</div>
              </div>
            </div>
            {NAV_ITEMS.map(item => (
              <div key={item.path} className="flex items-center gap-2.5 px-3 py-2 rounded-lg mb-1 opacity-30">
                <item.icon className="w-4 h-4" style={{ color: "oklch(0.5 0.01 260)" }} />
                <span className="text-xs" style={{ color: "oklch(0.5 0.01 260)" }}>{item.label}</span>
              </div>
            ))}
          </div>
        </aside>
        {/* Área de login */}
        <div className="flex-1 flex items-center justify-center px-8">
          <div className="max-w-md w-full">
            <div className="mb-8">
              <h1 className="text-3xl font-extrabold text-white mb-2" style={{ letterSpacing: "-0.02em" }}>
                Bem-vindo ao<br />
                <span style={{ color: "oklch(0.75 0.15 264)" }}>Guia de QA</span>
              </h1>
              <p className="text-sm" style={{ color: "oklch(0.55 0.01 260)" }}>
                Plataforma operacional de testes — checklists, sprints e rastreabilidade em um só lugar.
              </p>
            </div>
            <div className="rounded-2xl p-6 mb-6" style={{ background: "oklch(0.17 0.015 260)", border: "1px solid oklch(0.25 0.015 260)" }}>
              <p className="text-xs font-bold uppercase tracking-wider mb-4" style={{ color: "oklch(0.50 0.20 264)" }}>Como acessar</p>
              <ol className="space-y-3">
                {[
                  "Clique em \"Entrar\" abaixo e faça login com sua conta Manus.",
                  "No primeiro acesso, você entra como Analista automaticamente.",
                  "O Coordenador pode promover seu perfil em Usuários.",
                ].map((text, i) => (
                  <li key={i} className="flex items-start gap-3 text-xs" style={{ color: "oklch(0.65 0.01 260)" }}>
                    <span className="w-5 h-5 rounded-full flex items-center justify-center text-white font-bold flex-shrink-0 mt-0.5 text-xs" style={{ background: "oklch(0.50 0.20 264)" }}>{i + 1}</span>
                    {text}
                  </li>
                ))}
              </ol>
            </div>
            <Button
              onClick={() => startLogin()}
              className="w-full h-11 font-semibold text-sm"
              style={{ background: "oklch(0.50 0.20 264)", color: "white" }}
            >
              Entrar com conta Manus
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const isActive = (path: string, exact?: boolean) => {
    if (exact) return location === path;
    return location.startsWith(path);
  };

  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen flex" style={{ background: "oklch(0.975 0.006 80)" }}>
      {/* Sidebar fixa */}
      <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col z-20" style={{ background: "oklch(0.13 0.015 260)" }}>
        {/* Logo */}
        <div className="px-5 pt-6 pb-4 border-b" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="flex items-center gap-2.5 cursor-pointer" onClick={() => navigate("/")}>
            <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: "oklch(0.50 0.20 264)" }}>
              <CheckSquare className="w-4 h-4 text-white" />
            </div>
            <div>
              <div className="text-white font-bold text-sm">Guia de QA</div>
              <div className="text-xs" style={{ color: "oklch(0.5 0.01 260)" }}>Plataforma Operacional</div>
            </div>
          </div>
        </div>

        {/* Navegação principal */}
        <nav className="flex-1 overflow-y-auto py-3 px-2">
          <p className="text-xs font-bold uppercase tracking-wider px-3 mb-2" style={{ color: "oklch(0.38 0.01 260)" }}>Menu</p>
          {NAV_ITEMS.map(item => {
            const active = isActive(item.path, item.exact);
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-0.5 text-left transition-all"
                style={{
                  background: active ? "oklch(0.50 0.20 264)" : "transparent",
                  color: active ? "white" : "oklch(0.55 0.01 260)",
                }}
              >
                <item.icon className="w-4 h-4 flex-shrink-0" />
                <span className="text-xs font-medium">{item.label}</span>
              </button>
            );
          })}

          {isAdmin && (
            <>
              <p className="text-xs font-bold uppercase tracking-wider px-3 mt-4 mb-2" style={{ color: "oklch(0.38 0.01 260)" }}>Coordenação</p>
              {ADMIN_ITEMS.map(item => {
                const active = isActive(item.path);
                return (
                  <button
                    key={item.path}
                    onClick={() => navigate(item.path)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-lg mb-0.5 text-left transition-all"
                    style={{
                      background: active ? "oklch(0.50 0.20 264)" : "transparent",
                      color: active ? "white" : "oklch(0.55 0.01 260)",
                    }}
                  >
                    <item.icon className="w-4 h-4 flex-shrink-0" />
                    <span className="text-xs font-medium">{item.label}</span>
                  </button>
                );
              })}
            </>
          )}
        </nav>

        {/* Usuário + logout */}
        <div className="p-4 border-t" style={{ borderColor: "oklch(0.22 0.015 260)" }}>
          <div className="flex items-center gap-2.5 mb-3">
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
              style={{ background: isAdmin ? "oklch(0.50 0.20 264)" : "oklch(0.40 0.01 260)" }}>
              {(user?.name ?? user?.email ?? "?").charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white truncate">{user?.name ?? "Usuário"}</p>
              <p className="text-xs truncate" style={{ color: "oklch(0.45 0.01 260)" }}>
                {isAdmin ? "Coordenador" : "Analista"}
              </p>
            </div>
          </div>
          <button
            onClick={() => logout()}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs transition-all"
            style={{ color: "oklch(0.45 0.01 260)", background: "transparent" }}
            onMouseEnter={e => (e.currentTarget.style.background = "oklch(0.20 0.015 260)")}
            onMouseLeave={e => (e.currentTarget.style.background = "transparent")}
          >
            <LogOut className="w-3.5 h-3.5" />
            Sair
          </button>
        </div>
      </aside>

      {/* Conteúdo principal */}
      <div className="flex-1 ml-64 flex flex-col min-h-screen">
        {children}
      </div>
    </div>
  );
}
