import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import Home from "./pages/Home";
import ChecklistPage from "./pages/ChecklistPage";
import ClientsPage from "./pages/ClientsPage";
import ProjectsPage from "./pages/ProjectsPage";
import SprintsPage from "./pages/SprintsPage";
import HistoryPage from "./pages/HistoryPage";
import CoordinatorPage from "./pages/CoordinatorPage";
import UsersPage from "./pages/UsersPage";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/checklist/:sprintId" component={ChecklistPage} />
      <Route path="/clients" component={ClientsPage} />
      <Route path="/projects" component={ProjectsPage} />
      <Route path="/sprints" component={SprintsPage} />
      <Route path="/history" component={HistoryPage} />
      <Route path="/coordinator" component={CoordinatorPage} />
      <Route path="/users" component={UsersPage} />
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
