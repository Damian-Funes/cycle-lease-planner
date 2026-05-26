import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import RequireRole from "@/components/RequireRole";
import GlobalShortcuts from "@/components/GlobalShortcuts";
import ChunkErrorBoundary from "@/components/ChunkErrorBoundary";
const Auth = lazy(() => import("./pages/Auth"));
import Pendente from "./pages/Pendente";
import Home from "./pages/Home";
import Index from "./pages/Index";
import Catalogo from "./pages/Catalogo";
import Clientes from "./pages/Clientes";
import Organizacoes from "./pages/Organizacoes";
import OrganizacaoDetalhe from "./pages/OrganizacaoDetalhe";
import Pessoas from "./pages/Pessoas";
import Dossie from "./pages/Dossie";
import Crm from "./pages/Crm";
const DealDetalhe = lazy(() => import("./pages/DealDetalhe"));
const Atividades = lazy(() => import("./pages/Atividades"));
const Relatorios = lazy(() => import("./pages/Relatorios"));
import Orcamento from "./pages/Orcamento";
import Reforma from "./pages/Reforma";
import ReformaCatalogo from "./pages/ReformaCatalogo";
import Tipicos from "./pages/Tipicos";
import NotFound from "./pages/NotFound";
const Visualizador = lazy(() => import("./pages/Visualizador"));
const VisualizadorDetalhe = lazy(() => import("./pages/VisualizadorDetalhe"));

const Layouts = lazy(() => import("./pages/Layouts"));
const LayoutEditor = lazy(() => import("./pages/LayoutEditor"));
const AdminUsuarios = lazy(() => import("./pages/AdminUsuarios"));
const AdminPipelines = lazy(() => import("./pages/AdminPipelines"));
const ConfiguracoesIntegracoes = lazy(() => import("./pages/ConfiguracoesIntegracoes"));
const ConfiguracoesMontagem = lazy(() => import("./pages/ConfiguracoesMontagem"));
const ConfiguracoesFormasPagamento = lazy(() => import("./pages/ConfiguracoesFormasPagamento"));

const queryClient = new QueryClient();

const RouteLoader = () => (
  <div className="min-h-screen flex items-center justify-center bg-background text-foreground">
    <Loader2 className="w-6 h-6 animate-spin text-primary" />
  </div>
);

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <GlobalShortcuts />
          <ChunkErrorBoundary>
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/pendente" element={<Pendente />} />
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/smartcycle" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/orcamento" element={<ProtectedRoute><Orcamento /></ProtectedRoute>} />
              <Route path="/catalogo" element={<ProtectedRoute><Catalogo /></ProtectedRoute>} />
              <Route path="/clientes" element={<ProtectedRoute><Clientes /></ProtectedRoute>} />
              <Route path="/organizacoes" element={<ProtectedRoute><Organizacoes /></ProtectedRoute>} />
              <Route path="/organizacoes/:id" element={<ProtectedRoute><OrganizacaoDetalhe /></ProtectedRoute>} />
              <Route path="/pessoas" element={<ProtectedRoute><Pessoas /></ProtectedRoute>} />
              <Route path="/dossie/:clienteId" element={<ProtectedRoute><Dossie /></ProtectedRoute>} />
              <Route path="/crm" element={<ProtectedRoute><Crm /></ProtectedRoute>} />
              <Route path="/crm/deal/:id" element={<ProtectedRoute><DealDetalhe /></ProtectedRoute>} />
              <Route path="/atividades" element={<ProtectedRoute><Atividades /></ProtectedRoute>} />
              <Route path="/relatorios" element={<ProtectedRoute><Relatorios /></ProtectedRoute>} />
              <Route path="/layouts" element={<ProtectedRoute><Layouts /></ProtectedRoute>} />
              <Route path="/layouts/:id" element={<ProtectedRoute><LayoutEditor /></ProtectedRoute>} />
              <Route path="/reforma" element={<ProtectedRoute><Reforma /></ProtectedRoute>} />
              <Route path="/tipicos" element={<ProtectedRoute><Tipicos /></ProtectedRoute>} />
              <Route path="/visualizador" element={<ProtectedRoute><Visualizador /></ProtectedRoute>} />
              <Route path="/visualizador/:equipamentoId" element={<ProtectedRoute><VisualizadorDetalhe /></ProtectedRoute>} />
              <Route path="/reforma/catalogo" element={<ProtectedRoute><RequireRole roles={["admin"]}><ReformaCatalogo /></RequireRole></ProtectedRoute>} />
              <Route path="/admin/usuarios" element={<ProtectedRoute><RequireRole roles={["admin"]} mensagem="Esta página requer perfil de administrador."><AdminUsuarios /></RequireRole></ProtectedRoute>} />
              <Route path="/admin/pipelines" element={<ProtectedRoute><RequireRole roles={["admin"]} mensagem="Esta página requer perfil de administrador."><AdminPipelines /></RequireRole></ProtectedRoute>} />
              <Route path="/configuracoes/integracoes" element={<ProtectedRoute><ConfiguracoesIntegracoes /></ProtectedRoute>} />
              <Route path="/configuracoes/montagem" element={<ProtectedRoute><RequireRole roles={["admin"]} mensagem="Esta página requer perfil de administrador."><ConfiguracoesMontagem /></RequireRole></ProtectedRoute>} />
              <Route path="/configuracoes/formas-pagamento" element={<ProtectedRoute><RequireRole roles={["admin"]} mensagem="Esta página requer perfil de administrador."><ConfiguracoesFormasPagamento /></RequireRole></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
          </ChunkErrorBoundary>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
