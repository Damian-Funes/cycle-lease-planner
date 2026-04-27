import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import Auth from "./pages/Auth";
import Pendente from "./pages/Pendente";
import Home from "./pages/Home";
import Index from "./pages/Index";
import Catalogo from "./pages/Catalogo";
import Orcamento from "./pages/Orcamento";
import Layouts from "./pages/Layouts";
import LayoutEditor from "./pages/LayoutEditor";
import AdminUsuarios from "./pages/AdminUsuarios";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <AuthProvider>
          <Routes>
            <Route path="/auth" element={<Auth />} />
            <Route path="/pendente" element={<Pendente />} />
            <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
            <Route path="/smartcycle" element={<ProtectedRoute><Index /></ProtectedRoute>} />
            <Route path="/orcamento" element={<ProtectedRoute><Orcamento /></ProtectedRoute>} />
            <Route path="/catalogo" element={<ProtectedRoute><Catalogo /></ProtectedRoute>} />
            <Route path="/layouts" element={<ProtectedRoute><Layouts /></ProtectedRoute>} />
            <Route path="/layouts/:id" element={<ProtectedRoute><LayoutEditor /></ProtectedRoute>} />
            <Route path="/admin/usuarios" element={<ProtectedRoute requireAdmin><AdminUsuarios /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </AuthProvider>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
