import React, { useState, useEffect } from "react";
import { useAuth } from "../hooks/useAuth";
import { AuthService, Usuario } from "../domain/auth/auth-service";
import { AuditTrailService } from "../domain/auth/audit-trail";
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

export function AuthenticatedApp() {
  const authService = new AuthService();
  const auditService = new AuditTrailService();
  const [token, setToken] = useState<string | null>(null);

  // Restore token from localStorage on mount
  useEffect(() => {
    const savedToken = localStorage.getItem("auth_token");
    if (savedToken) {
      const contexto = authService.validarToken(savedToken);
      if (contexto) {
        setToken(savedToken);
      } else {
        localStorage.removeItem("auth_token");
      }
    }
  }, []);

  const handleLoginSuccess = (newToken: string) => {
    setToken(newToken);
    localStorage.setItem("auth_token", newToken);
  };

  const handleLogout = () => {
    if (token) {
      const contexto = authService.validarToken(token);
      if (contexto) {
        auditService.registrarAcao(contexto, "logout", "usuario", contexto.usuario?.id || "", {
          descricao: `${contexto.usuario?.nome} realizou logout`,
          resultado: "sucesso",
        });
      }
      authService.logout(token);
    }
    setToken(null);
    localStorage.removeItem("auth_token");
  };

  if (!token) {
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

  const contexto = authService.validarToken(token);
  if (!contexto) {
    handleLogout();
    return null;
  }

  // Check if user has access to the application
  const temAcesso =
    contexto.usuario?.role === "admin" ||
    contexto.usuario?.role === "gestor" ||
    contexto.usuario?.role === "prestador";

  if (!temAcesso) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center">
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h1 className="text-2xl font-bold text-red-600 mb-2">Acesso Negado</h1>
          <p className="text-gray-600">
            Seu perfil não tem permissão para acessar este sistema.
          </p>
          <button
            onClick={handleLogout}
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
              Olá, {contexto.usuario?.nome} ({contexto.usuario?.role})
            </p>
          </div>
          <button
            onClick={handleLogout}
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
