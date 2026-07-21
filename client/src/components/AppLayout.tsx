import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  CheckSquare, LayoutDashboard, Folder, Users,
  History, Shield, LogOut
} from "lucide-react";
import { GraduationCap, Wand2 } from "lucide-react";

const NAV_ITEMS = [
  { label: "Dashboard", icon: LayoutDashboard, path: "/", exact: true },
  { label: "Workspace", icon: Folder, path: "/workspace" },
  { label: "Histórico", icon: History, path: "/history" },
  { label: "Trilha do Conhecimento", icon: GraduationCap, path: "/trail" },
  { label: "Gerador de Plano de Teste", icon: Wand2, path: "/qa-planner" },
];

const ADMIN_ITEMS = [
  { label: "Dashboard Admin", icon: Shield, path: "/coordinator" },
  { label: "Usuários", icon: Users, path: "/users" },
];

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (!loading && !isAuthenticated) {
      navigate("/login");
    }
  }, [loading, isAuthenticated, navigate]);

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
    return null; // useEffect abaixo cuida do redirect
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
              <p className="text-xs font-bold uppercase tracking-wider px-3 mt-4 mb-2" style={{ color: "oklch(0.38 0.01 260)" }}>Administrador</p>
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
                {isAdmin ? "Administrador" : "Analista"}
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
