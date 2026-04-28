import { Suspense, lazy } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Pendente from "./pages/Pendente";
import Home from "./pages/Home";
import Index from "./pages/Index";
import Catalogo from "./pages/Catalogo";
import Orcamento from "./pages/Orcamento";
import NotFound from "./pages/NotFound";

const Layouts = lazy(() => import("./pages/Layouts"));
const LayoutEditor = lazy(() => import("./pages/LayoutEditor"));
const AdminUsuarios = lazy(() => import("./pages/AdminUsuarios"));
const Reforma = lazy(() => import("./pages/Reforma"));
const ReformaCatalogo = lazy(() => import("./pages/ReformaCatalogo"));

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
          <Suspense fallback={<RouteLoader />}>
            <Routes>
              <Route path="/auth" element={<Auth />} />
              <Route path="/pendente" element={<Pendente />} />
              <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
              <Route path="/smartcycle" element={<ProtectedRoute><Index /></ProtectedRoute>} />
              <Route path="/orcamento" element={<ProtectedRoute><Orcamento /></ProtectedRoute>} />
              <Route path="/catalogo" element={<ProtectedRoute><Catalogo /></ProtectedRoute>} />
              <Route path="/layouts" element={<ProtectedRoute><Layouts /></ProtectedRoute>} />
              <Route path="/layouts/:id" element={<ProtectedRoute><LayoutEditor /></ProtectedRoute>} />
              <Route path="/reforma" element={<ProtectedRoute><Reforma /></ProtectedRoute>} />
              <Route path="/reforma/catalogo" element={<ProtectedRoute requireAdmin><ReformaCatalogo /></ProtectedRoute>} />
              <Route path="/admin/usuarios" element={<ProtectedRoute requireAdmin><AdminUsuarios /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </Suspense>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
