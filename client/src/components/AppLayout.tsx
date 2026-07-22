import { useAuth } from "@/_core/hooks/useAuth";
import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import {
  CheckSquare, Folder, Users, History,
  Shield, LogOut, GraduationCap, Wand2,
  ChevronDown, ChevronRight, LayoutGrid, LayoutDashboard, User
} from "lucide-react";

// Estrutura de módulos recolhíveis
const MODULES = [
  {
    id: "projetos",
    label: "Workspace",
    icon: Folder,
    items: [
      { label: "Painel Individual", icon: User, path: "/painel" },
      { label: "Cadastro de Projetos", icon: Folder, path: "/workspace" },
      { label: "Histórico de Execuções", icon: History, path: "/history" },
      { label: "Gerador de Plano de Teste", icon: Wand2, path: "/qa-planner" },
    ],
  },
  {
    id: "capacitacao",
    label: "Capacitação",
    icon: GraduationCap,
    items: [
      { label: "Trilha do Conhecimento", icon: GraduationCap, path: "/trail" },
    ],
  },
];

const ADMIN_MODULE = {
  id: "administracao",
  label: "Administração",
  icon: Shield,
  items: [
    { label: "Gestão de Atividades", icon: LayoutGrid, path: "/coordinator" },
    { label: "Usuários", icon: Users, path: "/users" },
  ],
};

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, isAuthenticated, loading, logout } = useAuth();
  const [location, navigate] = useLocation();
  const isAdmin = user?.role === "admin";

  // Determinar módulo ativo com base na rota atual
  const getActiveModule = () => {
    const allModules = isAdmin ? [...MODULES, ADMIN_MODULE] : MODULES;
    for (const mod of allModules) {
      if (mod.items.some(item => location.startsWith(item.path))) return mod.id;
    }
    return null;
  };

  const [openModules, setOpenModules] = useState<string[]>(() => {
    // Começa com o módulo da rota atual aberto
    const allModules = [...MODULES, ADMIN_MODULE];
    for (const mod of allModules) {
      if (mod.items.some(item => location.startsWith(item.path))) return [mod.id];
    }
    return ["projetos"]; // padrão: Projetos aberto
  });

  // Abrir módulo automaticamente ao navegar para uma rota dentro dele
  useEffect(() => {
    const active = getActiveModule();
    if (active && !openModules.includes(active)) {
      setOpenModules(prev => [...prev, active]);
    }
  }, [location]);

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

  if (!isAuthenticated) return null;

  const toggleModule = (id: string) => {
    setOpenModules(prev =>
      prev.includes(id) ? prev.filter(m => m !== id) : [...prev, id]
    );
  };

  const isItemActive = (path: string) => location.startsWith(path);

  const renderModule = (mod: typeof MODULES[0], adminOnly = false) => {
    if (adminOnly && !isAdmin) return null;
    const isOpen = openModules.includes(mod.id);
    const hasActive = mod.items.some(item => isItemActive(item.path));

    return (
      <div key={mod.id} className="mb-1">
        {/* Cabeçalho do módulo */}
        <button
          onClick={() => toggleModule(mod.id)}
          className="w-full flex items-center justify-between px-3 py-2 rounded-lg transition-all group"
          style={{
            background: hasActive && !isOpen ? "oklch(0.18 0.015 260)" : "transparent",
            color: hasActive ? "oklch(0.75 0.05 264)" : "oklch(0.45 0.01 260)",
          }}
          onMouseEnter={e => {
            if (!hasActive) e.currentTarget.style.background = "oklch(0.18 0.015 260)";
            e.currentTarget.style.color = "oklch(0.75 0.05 264)";
          }}
          onMouseLeave={e => {
            if (!hasActive) e.currentTarget.style.background = "transparent";
            e.currentTarget.style.color = hasActive ? "oklch(0.75 0.05 264)" : "oklch(0.45 0.01 260)";
          }}
        >
          <div className="flex items-center gap-2.5">
            <mod.icon className="w-4 h-4 flex-shrink-0" />
            <span className="text-xs font-semibold uppercase tracking-wider">{mod.label}</span>
          </div>
          {isOpen
            ? <ChevronDown className="w-3.5 h-3.5 flex-shrink-0" />
            : <ChevronRight className="w-3.5 h-3.5 flex-shrink-0" />
          }
        </button>

        {/* Itens do módulo */}
        {isOpen && (
          <div className="mt-0.5 ml-2 pl-3 border-l" style={{ borderColor: "oklch(0.25 0.015 260)" }}>
            {mod.items.map(item => {
              const active = isItemActive(item.path);
              return (
                <button
                  key={item.path}
                  onClick={() => navigate(item.path)}
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg mb-0.5 text-left transition-all"
                  style={{
                    background: active ? "oklch(0.50 0.20 264)" : "transparent",
                    color: active ? "white" : "oklch(0.55 0.01 260)",
                  }}
                  onMouseEnter={e => {
                    if (!active) {
                      e.currentTarget.style.background = "oklch(0.20 0.015 260)";
                      e.currentTarget.style.color = "oklch(0.75 0.05 264)";
                    }
                  }}
                  onMouseLeave={e => {
                    if (!active) {
                      e.currentTarget.style.background = "transparent";
                      e.currentTarget.style.color = "oklch(0.55 0.01 260)";
                    }
                  }}
                >
                  <item.icon className="w-3.5 h-3.5 flex-shrink-0" />
                  <span className="text-xs font-medium">{item.label}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
    );
  };

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

        {/* Navegação por módulos */}
        <nav className="flex-1 overflow-y-auto py-4 px-2">
          {MODULES.map(mod => renderModule(mod))}
          {isAdmin && renderModule(ADMIN_MODULE, true)}
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
            onMouseEnter={e => {
              e.currentTarget.style.background = "oklch(0.20 0.015 260)";
              e.currentTarget.style.color = "oklch(0.65 0.01 260)";
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.color = "oklch(0.45 0.01 260)";
            }}
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
