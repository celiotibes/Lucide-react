import React, { useState } from "react";
import { AuthService, Usuario } from "../domain/auth/auth-service";
import { AuditTrailService } from "../domain/auth/audit-trail";

interface LoginFormProps {
  onLoginSuccess: (token: string) => void;
  usuarios: Usuario[];
  authService: AuthService;
  auditService: AuditTrailService;
}

export function LoginForm({
  onLoginSuccess,
  usuarios,
  authService,
  auditService,
}: LoginFormProps) {
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setCarregando(true);
    setErro(null);

    try {
      // autenticar() é assíncrono desde que a validação passou a usar bcrypt.compare.
      const resultado = await authService.autenticar(email, senha, usuarios);

      if (!resultado.sucesso) {
        setErro(resultado.erro || "Falha ao autenticar");
        setCarregando(false);
        return;
      }

      const token = resultado.token!;
      const contexto = authService.validarToken(token);

      if (contexto) {
        auditService.registrarAcao(contexto, "login", "usuario", email, {
          descricao: `${contexto.usuario?.nome} realizou login`,
          resultado: "sucesso",
        });
        onLoginSuccess(token);
      } else {
        setErro("Falha ao criar sessão");
      }
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Erro desconhecido");
    } finally {
      setCarregando(false);
    }
  };

  return (
    <div className="w-full max-w-md mx-auto p-4">
      <div className="bg-white rounded-lg shadow-md p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">
          Prestação de Serviços
        </h1>
        <p className="text-gray-600 mb-6">Faça login para continuar</p>

        {erro && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
            {erro}
          </div>
        )}

        <form onSubmit={handleLogin} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="seu@email.com"
              required
              disabled={carregando}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Senha
            </label>
            <input
              type="password"
              value={senha}
              onChange={(e) => setSenha(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="••••••••"
              required
              disabled={carregando}
            />
            <p className="text-xs text-gray-500 mt-1">
              Senha de teste: senha123
            </p>
          </div>

          <button
            type="submit"
            disabled={carregando}
            className="w-full px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {carregando ? "Entrando..." : "Entrar"}
          </button>
        </form>

        <div className="mt-6 p-3 bg-blue-50 border border-blue-200 rounded-lg text-sm text-gray-700">
          <p className="font-semibold mb-2">Usuários de teste:</p>
          <ul className="space-y-1 text-xs">
            <li>• admin@example.com (Admin - acesso total)</li>
            <li>• gestor@example.com (Gestor - aprovação)</li>
            <li>• paulo@example.com (Prestador - seus dados)</li>
          </ul>
          <p className="mt-2 font-semibold">Senha (todos): senha123</p>
        </div>
      </div>
    </div>
  );
}
