import { BrowserRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthProvider } from "@/contexts/AuthContext";
import { AdminOnlyRoute, ProtectedRoute, StaffRoute } from "@/components/ProtectedRoute";
import { Navbar } from "@/components/Navbar";
import Login from "@/pages/Login";
import Register from "@/pages/Register";
import TopicsList from "@/pages/TopicsList";
import TopicDetail from "@/pages/TopicDetail";
import AdminPanel from "@/pages/AdminPanel";
import UserManagement from "@/pages/UserManagement";
import Profile from "@/pages/Profile";
import NotFound from "@/pages/NotFound";

const queryClient = new QueryClient();

function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-muted/10">
      <Navbar />
      {children}
    </div>
  );
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />

            <Route element={<ProtectedRoute />}>
              <Route
                path="/"
                element={
                  <AppLayout>
                    <TopicsList />
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
                path="/perfil"
                element={
                  <AppLayout>
                    <Profile />
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
            </Route>

            <Route element={<AdminOnlyRoute />}>
              <Route
                path="/admin/usuarios"
                element={
                  <AppLayout>
                    <UserManagement />
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
