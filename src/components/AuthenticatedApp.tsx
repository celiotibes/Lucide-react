import React, { useState, useEffect } from "react";
import { AuthService, Usuario } from "../domain/auth/auth-service";
import { AuditTrailService } from "../domain/auth/audit-trail";
import { AuthProvider, useAuthContext } from "../context/AuthContext";
import { LoginForm } from "./LoginForm";
import { PauloBruxelPrestadorPanel } from "./PauloBruxelPrestadorPanel";

// Test users
const USUARIOS_TESTE: Usuario[] = [
  {
    id: "user_admin_1",
    nome: "Admin User",
    email: "admin@example.com",
    role: "admin",
    ativo: true,
    data_criacao: "2026-01-01",
  },
  {
    id: "user_gestor_1",
    nome: "Gestor User",
    email: "gestor@example.com",
    role: "gestor",
    ativo: true,
    data_criacao: "2026-01-01",
  },
  {
    id: "user_prestador_1",
    nome: "Paulo Bruxel",
    email: "paulo@example.com",
    role: "prestador",
    prestador_id: 1,
    ativo: true,
    data_criacao: "2026-01-01",
  },
];

/**
 * H-2 FIX: Inner component that uses auth context
 * This consolidates to use single useAuthContext pattern
 */
function AuthenticatedAppContent() {
  const { contexto, usuario, autenticado, logout, authService, auditService } = useAuthContext();

  // Check if user has access to the application
  const temAcesso =
    usuario?.role === "admin" ||
    usuario?.role === "gestor" ||
    usuario?.role === "prestador";

  if (!temAcesso) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Acesso Negado</h1>
          <p className="text-gray-600">
            Seu perfil não tem permissão para acessar este sistema.
          </p>
          <button
            onClick={logout}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Voltar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-100">
      {/* Header with user info and logout */}
      <div className="bg-white border-b border-gray-200 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <div>
            <h1 className="text-lg font-bold text-gray-800">
              Prestação de Serviços
            </h1>
            <p className="text-sm text-gray-600">
              Olá, {usuario?.nome} ({usuario?.role})
            </p>
          </div>
          <button
            onClick={logout}
            className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 font-medium"
          >
            Sair
          </button>
        </div>
      </div>

      {/* Main content */}
      <div className="max-w-7xl mx-auto py-6">
        <PauloBruxelPrestadorPanel
          contexto={contexto}
          authService={authService}
          auditService={auditService}
        />
      </div>
    </div>
  );
}

/**
 * AuthenticatedApp - Outer component that manages services and auth state
 * H-1 FIX: Create services once with useState to persist across renders
 * H-2 FIX: Use AuthProvider + useAuthContext pattern for single auth implementation
 */
export function AuthenticatedApp() {
  // H-1 FIX: Create AuthService and AuditTrailService once with useState to persist across renders
  // This prevents session loss on re-renders
  const [authService] = useState(() => new AuthService());
  const [auditService] = useState(() => new AuditTrailService());
  const [showLogin, setShowLogin] = useState(true);

  const handleLoginSuccess = () => {
    setShowLogin(false);
  };

  if (showLogin) {
    return (
      <div className="min-h-screen bg-gray-100">
        <LoginForm
          onLoginSuccess={handleLoginSuccess}
          usuarios={USUARIOS_TESTE}
          authService={authService}
          auditService={auditService}
        />
      </div>
    );
  }

  // Wrap content with AuthProvider to provide context to all components
  return (
    <AuthProvider authService={authService} auditService={auditService}>
      <AuthenticatedAppContent />
    </AuthProvider>
  );
}
