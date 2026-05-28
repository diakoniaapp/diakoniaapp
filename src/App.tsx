import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "./pages/NotFound.tsx";
import Auth from "./pages/Auth.tsx";
import AppLayout from "./components/layout/AppLayout.tsx";
import Dashboard from "./pages/Dashboard.tsx";
import Membros from "./pages/Membros.tsx";
import Familias from "./pages/Familias.tsx";
import Ministerios from "./pages/Ministerios.tsx";
import Eventos from "./pages/Eventos.tsx";
import Locais from "./pages/Locais.tsx";
import Visitantes from "./pages/Visitantes.tsx";
import PainelEstrategico from "./pages/PainelEstrategico.tsx";
import Organograma from "./pages/Organograma.tsx";
import RecuperacaoSenhaAdmin from "./pages/RecuperacaoSenhaAdmin.tsx";
import AgendaPrint from "./pages/AgendaPrint.tsx";
import { AuthProvider } from "./hooks/useAuth.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { ThemeProvider } from "./hooks/useTheme.tsx";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                <Route path="/auth" element={<Auth />} />
                <Route path="/agenda/imprimir" element={<AgendaPrint />} />
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/membros" element={<Membros />} />
                  <Route path="/familias" element={<Familias />} />
                  <Route path="/ministerios" element={<Ministerios />} />
                  <Route path="/eventos" element={<Eventos />} />
                  <Route path="/agenda" element={<Navigate to="/eventos" replace />} />
                  <Route path="/locais" element={<Locais />} />
                  <Route path="/visitantes" element={<Visitantes />} />
                  <Route path="/painel-estrategico" element={<PainelEstrategico />} />
                  <Route path="/organograma" element={<Organograma />} />
                  <Route path="/admin/recuperacao-senha" element={<RecuperacaoSenhaAdmin />} />
                </Route>
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ThemeProvider>
  </ErrorBoundary>
);

export default App;
