/**
 * AuthContext - Global Authentication Context
 * Provides authentication state and methods to all components
 *
 * Usage:
 * 1. Wrap app with <AuthProvider>
 * 2. Use useAuth() hook in components
 */

import React, { createContext, useContext, ReactNode } from "react";
import { useAuth } from "../hooks/useAuth";
import { AuthService } from "../domain/auth/auth-service";
import { AuditTrailService } from "../domain/auth/audit-trail";

interface AuthContextType {
  // Re-export everything from useAuth hook
  contexto: ReturnType<typeof useAuth>["contexto"];
  usuario: ReturnType<typeof useAuth>["usuario"];
  autenticado: ReturnType<typeof useAuth>["autenticado"];
  role: ReturnType<typeof useAuth>["role"];
  carregando: ReturnType<typeof useAuth>["carregando"];
  erro: ReturnType<typeof useAuth>["erro"];
  login: ReturnType<typeof useAuth>["login"];
  logout: ReturnType<typeof useAuth>["logout"];
  temPermissao: ReturnType<typeof useAuth>["temPermissao"];
  podeLerPrestador: ReturnType<typeof useAuth>["podeLerPrestador"];
  podeModificarApontamentos: ReturnType<typeof useAuth>["podeModificarApontamentos"];
  podeAprovarPagamento: ReturnType<typeof useAuth>["podeAprovarPagamento"];
  guard: ReturnType<typeof useAuth>["guard"];
  // Services for direct access if needed
  authService: AuthService;
  auditService: AuditTrailService;
}

// Create context with undefined default (will be provided by AuthProvider)
const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
  authService: AuthService;
  auditService: AuditTrailService;
}

/**
 * AuthProvider component - Must wrap the app to provide auth context
 */
export function AuthProvider({
  children,
  authService,
  auditService,
}: AuthProviderProps) {
  const authHook = useAuth(authService, auditService);

  const value: AuthContextType = {
    // Auth state from hook
    contexto: authHook.contexto,
    usuario: authHook.usuario,
    autenticado: authHook.autenticado,
    role: authHook.role,
    carregando: authHook.carregando,
    erro: authHook.erro,
    // Auth methods from hook
    login: authHook.login,
    logout: authHook.logout,
    temPermissao: authHook.temPermissao,
    podeLerPrestador: authHook.podeLerPrestador,
    podeModificarApontamentos: authHook.podeModificarApontamentos,
    podeAprovarPagamento: authHook.podeAprovarPagamento,
    guard: authHook.guard,
    // Services
    authService,
    auditService,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}

/**
 * Hook to use auth context in components
 * Must be used inside AuthProvider
 */
export function useAuthContext(): AuthContextType {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuthContext must be used inside AuthProvider");
  }
  return context;
}
