import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminOnlyRoute, ProtectedRoute, StaffRoute } from "@/components/ProtectedRoute";
import { TopBar, BottomDock } from "@/components/Navbar";
import { OnboardingBanner } from "@/components/OnboardingBanner";
import { VisitBeacon } from "@/components/VisitBeacon";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import ResetPassword from "@/pages/ResetPassword";
import ForgotPassword from "@/pages/ForgotPassword";
import Home from "@/pages/Home";
import TopicsList from "@/pages/TopicsList";
import TopicsHistory from "@/pages/TopicsHistory";
import TopicDetail from "@/pages/TopicDetail";
import TopicShortLink from "@/pages/TopicShortLink";
import AdminPanel from "@/pages/AdminPanel";
import UserManagement from "@/pages/UserManagement";
import Profile from "@/pages/Profile";
import Services from "@/pages/Services";
import ServiceDetail from "@/pages/ServiceDetail";
import ServiceShortLink from "@/pages/ServiceShortLink";
import MyService from "@/pages/MyService";
import AuditLog from "@/pages/AuditLog";
import ServiceTagsAdmin from "@/pages/ServiceTagsAdmin";
import ApartmentMap from "@/pages/ApartmentMap";
import RecommendationsList from "@/pages/RecommendationsList";
import RecommendationDetail from "@/pages/RecommendationDetail";
import Faq from "@/pages/Faq";
import ClimateList from "@/pages/ClimateList";
import ClimateDetail from "@/pages/ClimateDetail";
import ImprovementsBoard from "@/pages/ImprovementsBoard";
import Welcome from "@/pages/Welcome";
import WelcomeAdmin from "@/pages/WelcomeAdmin";
import SystemSettings from "@/pages/SystemSettings";
import AskCondo from "@/pages/AskCondo";
import Horarios from "@/pages/Horarios";
import Documentos from "@/pages/Documentos";
import ContabilList from "@/pages/ContabilList";
import ContabilDetail from "@/pages/ContabilDetail";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function RedirectServicoToNegocio() {
  const { id } = useParams<{ id: string }>();
  return <Navigate to={`/negocios/${id}`} replace />;
}

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex min-h-screen min-w-0 flex-col overflow-x-hidden bg-background"
      style={{ minHeight: "100dvh" }}
    >
      <TopBar />
      <OnboardingBanner />
      <main className="flex min-h-0 min-w-0 flex-1 flex-col overflow-x-hidden">{children}</main>
      <BottomDock />
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <VisitBeacon />
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/esqueci-senha" element={<ForgotPassword />} />
            <Route path="/redefinir-senha" element={<ResetPassword />} />
            <Route path="/boas-vindas" element={<Welcome />} />

            <Route element={<ProtectedRoute />}>
              <Route
                path="/"
                element={
                  <AppLayout>
                    <Home />
                  </AppLayout>
                }
              />
              <Route
                path="/pautas"
                element={
                  <AppLayout>
                    <TopicsList />
                  </AppLayout>
                }
              />
              <Route
                path="/pautas/historico"
                element={
                  <AppLayout>
                    <TopicsHistory />
                  </AppLayout>
                }
              />
              <Route
                path="/topics/:id"
                element={
                  <AppLayout>
                    <TopicDetail />
                  </AppLayout>
                }
              />
              <Route
                path="/t/:code"
                element={
                  <AppLayout>
                    <TopicShortLink />
                  </AppLayout>
                }
              />
              <Route
                path="/perfil"
                element={
                  <AppLayout>
                    <Profile />
                  </AppLayout>
                }
              />
              <Route
                path="/negocios"
                element={
                  <AppLayout>
                    <Services />
                  </AppLayout>
                }
              />
              <Route
                path="/negocios/meu"
                element={
                  <AppLayout>
                    <MyService />
                  </AppLayout>
                }
              />
              <Route
                path="/negocios/:id"
                element={
                  <AppLayout>
                    <ServiceDetail />
                  </AppLayout>
                }
              />
              <Route
                path="/n/:slug"
                element={
                  <AppLayout>
                    <ServiceShortLink />
                  </AppLayout>
                }
              />
              <Route path="/servicos" element={<Navigate to="/negocios" replace />} />
              <Route path="/servicos/meu" element={<Navigate to="/negocios/meu" replace />} />
              <Route path="/servicos/:id" element={<RedirectServicoToNegocio />} />
              <Route
                path="/recomendacoes"
                element={
                  <AppLayout>
                    <RecommendationsList />
                  </AppLayout>
                }
              />
              <Route
                path="/recomendacoes/:id"
                element={
                  <AppLayout>
                    <RecommendationDetail />
                  </AppLayout>
                }
              />
              <Route
                path="/faq"
                element={
                  <AppLayout>
                    <Faq />
                  </AppLayout>
                }
              />
              <Route
                path="/horarios"
                element={
                  <AppLayout>
                    <Horarios />
                  </AppLayout>
                }
              />
              <Route
                path="/documentos"
                element={
                  <AppLayout>
                    <Documentos />
                  </AppLayout>
                }
              />
              <Route
                path="/perguntar"
                element={
                  <AppLayout>
                    <AskCondo />
                  </AppLayout>
                }
              />
              <Route
                path="/clima"
                element={
                  <AppLayout>
                    <ClimateList />
                  </AppLayout>
                }
              />
              <Route
                path="/clima/:id"
                element={
                  <AppLayout>
                    <ClimateDetail />
                  </AppLayout>
                }
              />
              <Route
                path="/melhorias"
                element={
                  <AppLayout>
                    <ImprovementsBoard />
                  </AppLayout>
                }
              />
              <Route
                path="/contabil"
                element={
                  <AppLayout>
                    <ContabilList />
                  </AppLayout>
                }
              />
              <Route
                path="/contabil/:id"
                element={
                  <AppLayout>
                    <ContabilDetail />
                  </AppLayout>
                }
              />
            </Route>

            <Route element={<StaffRoute />}>
              <Route
                path="/admin"
                element={
                  <AppLayout>
                    <AdminPanel />
                  </AppLayout>
                }
              />
              <Route
                path="/admin/configuracoes"
                element={
                  <AppLayout>
                    <SystemSettings />
                  </AppLayout>
                }
              />
              <Route
                path="/admin/usuarios"
                element={
                  <AppLayout>
                    <UserManagement />
                  </AppLayout>
                }
              />
            </Route>

            <Route element={<AdminOnlyRoute />}>
              <Route
                path="/admin/auditoria"
                element={
                  <AppLayout>
                    <AuditLog />
                  </AppLayout>
                }
              />
              <Route
                path="/admin/tags"
                element={
                  <AppLayout>
                    <ServiceTagsAdmin />
                  </AppLayout>
                }
              />
              <Route
                path="/admin/apartamentos"
                element={
                  <AppLayout>
                    <ApartmentMap />
                  </AppLayout>
                }
              />
              <Route
                path="/admin/boas-vindas"
                element={
                  <AppLayout>
                    <WelcomeAdmin />
                  </AppLayout>
                }
              />
            </Route>

            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </QueryClientProvider>
  );
}
