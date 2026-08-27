import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { ApiError, getToken, setToken } from "@/lib/api";
import type { User } from "@/lib/types";
import * as authService from "@/services/auth";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  setUser: (user: User | null) => void;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Sem token guardado, nem vale bater no back — já cai direto pra tela de login.
    if (!getToken()) {
      setLoading(false);
      return;
    }
    authService
      .me()
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) {
          console.error(err);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  async function logout() {
    await authService.logout();
    setToken(null);
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, setUser, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth precisa estar dentro de <AuthProvider>");
  return ctx;
}
