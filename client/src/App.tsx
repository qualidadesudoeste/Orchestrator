import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { lazy, Suspense } from "react";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";

const NotFound = lazy(() => import("@/pages/NotFound"));
const Home = lazy(() => import("./pages/Home"));
const WorkspacePage = lazy(() => import("./pages/WorkspacePage"));
const HistoryPage = lazy(() => import("./pages/HistoryPage"));
const CoordinatorPage = lazy(() => import("./pages/CoordinatorPage"));
const UsersPage = lazy(() => import("./pages/UsersPage"));
const LoginPage = lazy(() => import("./pages/LoginPage"));
const QAPlannerPage = lazy(() => import("./pages/QAPlannerPage"));
const DashboardPage = lazy(() => import("./pages/DashboardPage"));
const ParametersPage = lazy(() => import("./pages/ParametersPage"));
const ExecutionQueuePage = lazy(() => import("./pages/ExecutionQueuePage"));
const SigTestQueuePage = lazy(() => import("./pages/SigTestQueuePage"));

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">{() => <Redirect to="/dashboard" />}</Route>
      <Route path="/painel" component={Home} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/workspace/execution-queue" component={ExecutionQueuePage} />
      <Route path="/workspace/sig-test-queue" component={SigTestQueuePage} />
      <Route path="/workspace" component={WorkspacePage} />
      <Route path="/projects">{() => <Redirect to="/workspace" />}</Route>
      <Route path="/history" component={HistoryPage} />
      <Route path="/coordinator" component={CoordinatorPage} />
      <Route path="/users" component={UsersPage} />
      <Route path="/parameters" component={ParametersPage} />
      <Route path="/qa-planner" component={QAPlannerPage} />
      <Route path="/404" component={NotFound} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Toaster />
          <Suspense
            fallback={
              <div className="p-6 text-sm text-muted-foreground">
                Carregando…
              </div>
            }
          >
            <Router />
          </Suspense>
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
