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
import Visitantes       from "./pages/Visitantes.tsx";
import VisitanteDetalhe from "./pages/VisitanteDetalhe.tsx";
import PainelEstrategico from "./pages/PainelEstrategico.tsx";
import Organograma from "./pages/Organograma.tsx";
import EstruturaDaIgreja from "./pages/EstruturaDaIgreja.tsx";
import RecuperacaoSenhaAdmin from "./pages/RecuperacaoSenhaAdmin.tsx";
import LgpdAdmin from "./pages/LgpdAdmin.tsx";
import IdentidadeAdmin from "./pages/IdentidadeAdmin.tsx";
import DocumentosAdmin from "./pages/DocumentosAdmin.tsx";
import ImportacaoMembros from "./pages/ImportacaoMembros.tsx";
import ExportacaoAdmin from "./pages/ExportacaoAdmin.tsx";
import CampanhasAdmin from "./pages/CampanhasAdmin.tsx";
import AgendaPrint from "./pages/AgendaPrint.tsx";
import Convite from "@/pages/Convite";
import Ebd from "./pages/Ebd.tsx";
import EbdClasse from "./pages/EbdClasse.tsx";
import Areas from "./pages/Areas.tsx";
import EbdChamada from "./pages/EbdChamada.tsx";
import EbdCampanhas from "./pages/EbdCampanhas.tsx";
import EbdCampanha from "./pages/EbdCampanha.tsx";
import EbdCampanhaRelatorio from "./pages/EbdCampanhaRelatorio.tsx";
import Pgm from "./pages/Pgm.tsx";
import PgmGrupo from "./pages/PgmGrupo.tsx";
import PgmReuniaoPage from "./pages/PgmReuniao.tsx";
import PgmReuniaoRelatorio from "./pages/PgmReuniaoRelatorio.tsx";
import Financas from "./pages/Financas.tsx";
import FinancasConta from "./pages/FinancasConta.tsx";
import FinancasAdmin from "./pages/FinancasAdmin.tsx";
import FinancasRecorrencias from "./pages/FinancasRecorrencias.tsx";
import FinancasAgenda from "./pages/FinancasAgenda.tsx";
import FinancasRelatorio from "./pages/FinancasRelatorio.tsx";
import FinancasEstoque from "./pages/FinancasEstoque.tsx";
import FinancasInsights from "./pages/FinancasInsights.tsx";
import FinancasCentros from "./pages/FinancasCentros.tsx";
import FinancasOrcamento from "./pages/FinancasOrcamento.tsx";
import FinancasCentroDetalhe from "./pages/FinancasCentroDetalhe.tsx";
import FinancasFolha from "./pages/FinancasFolha.tsx";
import FinancasFiscal from "./pages/financas/Fiscal.tsx";
import ReunioesFinanceiras from "./pages/financas/ReunioesFinanceiras.tsx";
import DashboardExecutivo from "./pages/financas/DashboardExecutivo.tsx";
import BazarHome from "./pages/bazar/index.tsx";
import BazarCampanha from "./pages/bazar/Campanha.tsx";
import BazarNovaCampanha from "./pages/bazar/NovaCampanha.tsx";
import BazarCaixa from "./pages/bazar/caixa.tsx";
import Membresia from "./pages/Membresia.tsx";
import MembresiaDetalhe from "./pages/MembresiaDetalhe.tsx";
import PainelSecretaria from "./pages/PainelSecretaria.tsx";
import Governanca from "./pages/Governanca.tsx";
import GovernancaReuniao from "./pages/GovernancaReuniao.tsx";
import GovernancaAssembleia from "./pages/GovernancaAssembleia.tsx";
import Assuntos from "./pages/Assuntos.tsx";
import AssuntoDetalhe from "./pages/AssuntoDetalhe.tsx";
import AgendaPastoral from "./pages/AgendaPastoral.tsx";
import PainelPastoral from "./pages/PainelPastoral.tsx";
import ResetSenhaToken from "@/pages/ResetSenhaToken";
import EsqueciSenha from "@/pages/EsqueciSenha";
import ResetSenha from "./pages/ResetSenha.tsx";
import PrimeiroAcesso from "./pages/PrimeiroAcesso.tsx";
import AceiteLgpd from "./pages/AceiteLgpd.tsx";
import Usuarios from "./pages/Usuarios.tsx";
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
                {/* Rotas públicas (sem layout) */}
                <Route path="/auth" element={<Auth />} />
                <Route path="/auth/reset" element={<ResetSenha />} />
                <Route path="/convite/:token" element={<Convite />} />
                <Route path="/reset/:token" element={<ResetSenhaToken />} />
                <Route path="/esqueci-senha" element={<EsqueciSenha />} />
                <Route path="/primeiro-acesso" element={<PrimeiroAcesso />} />
                <Route path="/aceite-lgpd" element={<AceiteLgpd />} />
                <Route path="/agenda/imprimir" element={<AgendaPrint />} />

                {/* Rotas protegidas (dentro do AppLayout) */}
                <Route element={<AppLayout />}>
                  <Route path="/" element={<Dashboard />} />
                  <Route path="/membros" element={<Membros />} />
                  <Route path="/familias" element={<Familias />} />
                  <Route path="/ministerios" element={<Ministerios />} />
                  <Route path="/eventos" element={<Eventos />} />
                  <Route path="/agenda" element={<Navigate to="/eventos" replace />} />
                  <Route path="/locais" element={<Locais />} />
                  <Route path="/visitantes"     element={<Visitantes />} />
                  <Route path="/visitantes/:id" element={<VisitanteDetalhe />} />
                  <Route path="/painel-estrategico" element={<PainelEstrategico />} />
                  <Route path="/organograma" element={<Organograma />} />
              <Route path="/estrutura" element={<EstruturaDaIgreja />} />
                  <Route path="/usuarios" element={<Usuarios />} />
                  <Route path="/ebd" element={<Ebd />} />
                  <Route path="/ebd/:classeId" element={<EbdClasse />} />
                  <Route path="/areas" element={<Areas />} />
                  <Route path="/ebd/:classeId/chamada" element={<EbdChamada />} />
                  <Route path="/ebd/:classeId/campanhas" element={<EbdCampanhas />} />
                  <Route path="/ebd/:classeId/campanhas/:campanhaId" element={<EbdCampanha />} />
                  <Route path="/ebd/:classeId/campanhas/:campanhaId/relatorio" element={<EbdCampanhaRelatorio />} />
                  <Route path="/pgm" element={<Pgm />} />
                  <Route path="/pgm/:grupoId" element={<PgmGrupo />} />
                  <Route path="/pgm/:grupoId/reuniao/:reuniaoId" element={<PgmReuniaoPage />} />
                  <Route path="/pgm/:grupoId/reuniao/:reuniaoId/relatorio" element={<PgmReuniaoRelatorio />} />
                  <Route path="/financas" element={<Financas />} />
                  <Route path="/financas/conta/:contaId" element={<FinancasConta />} />
                  <Route path="/financas/admin" element={<FinancasAdmin />} />
                  <Route path="/financas/recorrencias" element={<FinancasRecorrencias />} />
                  <Route path="/financas/agenda" element={<FinancasAgenda />} />
                  <Route path="/financas/relatorio" element={<FinancasRelatorio />} />
                  <Route path="/financas/relatorio/:ano/:mes" element={<FinancasRelatorio />} />
                  <Route path="/financas/estoque" element={<FinancasEstoque />} />
                  <Route path="/financas/insights" element={<FinancasInsights />} />
                  <Route path="/financas/centros" element={<FinancasCentros />} />
                  <Route path="/financas/orcamento" element={<FinancasOrcamento />} />
                  <Route path="/financas/centro/:centroId" element={<FinancasCentroDetalhe />} />
                  <Route path="/financas/folha" element={<FinancasFolha />} />
                  <Route path="/financas/fiscal" element={<FinancasFiscal />} />
                  <Route path="/financas/reunioes" element={<ReunioesFinanceiras />} />
                  <Route path="/financas/executivo" element={<DashboardExecutivo />} />
                  <Route path="/bazar" element={<BazarHome />} />
                  <Route path="/bazar/campanhas/nova" element={<BazarNovaCampanha />} />
                  <Route path="/bazar/campanha/:id" element={<BazarCampanha />} />
                  <Route path="/bazar/caixa/:id" element={<BazarCaixa />} />
                  <Route path="/membresia" element={<Membresia />} />
                  <Route path="/membresia/:id" element={<MembresiaDetalhe />} />
                  <Route path="/painel-secretaria" element={<PainelSecretaria />} />
                  <Route path="/governanca" element={<Governanca />} />
                  <Route path="/governanca/reuniao/:id" element={<GovernancaReuniao />} />
                  <Route path="/governanca/assembleia/:id" element={<GovernancaAssembleia />} />
                  <Route path="/assuntos" element={<Assuntos />} />
                  <Route path="/assunto/:id" element={<AssuntoDetalhe />} />
                  <Route path="/agenda-pastoral" element={<AgendaPastoral />} />
                  <Route path="/painel-pastoral" element={<PainelPastoral />} />
                  <Route path="/admin/recuperacao-senha" element={<RecuperacaoSenhaAdmin />} />
                  <Route path="/admin/lgpd" element={<LgpdAdmin />} />
                  <Route path="/admin/identidade" element={<IdentidadeAdmin />} />
                  <Route path="/admin/documentos" element={<DocumentosAdmin />} />
                  <Route path="/admin/importacao" element={<ImportacaoMembros />} />
                  <Route path="/admin/exportacao" element={<ExportacaoAdmin />} />
                  <Route path="/admin/campanhas" element={<CampanhasAdmin />} />
                </Route>

                {/* Redirecionar /dashboard para a raiz */}
                <Route path="/dashboard" element={<Navigate to="/" replace />} />

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
