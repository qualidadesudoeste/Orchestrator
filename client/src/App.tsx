import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import { Redirect } from "wouter";
import WorkspacePage from "./pages/WorkspacePage";
import HistoryPage from "./pages/HistoryPage";
import CoordinatorPage from "./pages/CoordinatorPage";
import UsersPage from "./pages/UsersPage";
import TrailPage from "./pages/TrailPage";
import LoginPage from "./pages/LoginPage";
import QAPlannerPage from "./pages/QAPlannerPage";
import DashboardPage from "./pages/DashboardPage";

function Router() {
  return (
    <Switch>
      <Route path="/login" component={LoginPage} />
      <Route path="/">{() => <Redirect to="/painel" />}</Route>
      <Route path="/painel" component={Home} />
      <Route path="/dashboard" component={DashboardPage} />
      <Route path="/workspace" component={WorkspacePage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/coordinator" component={CoordinatorPage} />
      <Route path="/users" component={UsersPage} />
      <Route path="/trail" component={TrailPage} />
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
          <Router />
        </TooltipProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
