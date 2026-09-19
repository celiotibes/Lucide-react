/**
 * useAuth Hook
 * Fornece contexto de autenticação para componentes React
 */

import { useState, useCallback, useEffect } from "react";
import { AuthService, ContextoAutenticacao, Usuario, UserRole } from "../domain/auth/auth-service";
import { AuditTrailService } from "../domain/auth/audit-trail";
import { PermissionGuard, criarPermissionGuard } from "../domain/auth/permission-guard";

/**
 * Hook de autenticação
 * Gerencia contexto de usuário, login, logout e verificação de permissões
 */
export function useAuth(authService: AuthService, auditService: AuditTrailService) {
  const [contexto, setContexto] = useState<ContextoAutenticacao>({
    usuario: null,
    autenticado: false,
  });
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [guard] = useState(() => criarPermissionGuard(authService, auditService));

  // Carregar sessão do localStorage ao montar
  useEffect(() => {
    const token = localStorage.getItem("auth_token");
    if (token) {
      const ctx = authService.validarToken(token);
      if (ctx) {
        setContexto(ctx);
      } else {
        localStorage.removeItem("auth_token");
      }
    }
    setCarregando(false);
  }, [authService]);

  // Login
  const login = useCallback(
    async (email: string, senha: string, usuarios: Usuario[]) => {
      setCarregando(true);
      setErro(null);

      try {
        // BUG real: faltava o await. authService.autenticar é async (auth-service.ts);
        // sem await, `resultado` era a própria Promise, então `resultado.sucesso` era
        // sempre undefined e todo login era tratado como falha (!resultado.sucesso).
        const resultado = await authService.autenticar(email, senha, usuarios);

        if (!resultado.sucesso) {
          setErro(resultado.erro || "Falha ao autenticar");
          setCarregando(false);
          return {
            sucesso: false,
            erro: resultado.erro || "Falha ao autenticar",
          };
        }

        const token = resultado.token!;
        const ctx = authService.validarToken(token);

        if (ctx) {
          setContexto(ctx);
          localStorage.setItem("auth_token", token);

          auditService.registrarAcao(ctx, "login", "usuario", email, {
            descricao: `${ctx.usuario?.nome} realizou login`,
            resultado: "sucesso",
          });

          setCarregando(false);
          return { sucesso: true };
        }

        setErro("Falha ao criar sessão");
        setCarregando(false);
        return { sucesso: false, erro: "Falha ao criar sessão" };
      } catch (err) {
        const mensagem = err instanceof Error ? err.message : "Erro desconhecido";
        setErro(mensagem);
        setCarregando(false);
        return { sucesso: false, erro: mensagem };
      }
    },
    [authService, auditService]
  );

  // Logout
  const logout = useCallback(() => {
    if (contexto.token) {
      auditService.registrarAcao(contexto, "logout", "usuario", contexto.usuario?.id || "", {
        descricao: `${contexto.usuario?.nome} realizou logout`,
        resultado: "sucesso",
      });

      authService.logout(contexto.token);
      localStorage.removeItem("auth_token");
    }

    setContexto({
      usuario: null,
      autenticado: false,
    });
  }, [contexto, authService, auditService]);

  // Verificar permissão
  const temPermissao = useCallback(
    (recurso: string, operacao: "criar" | "ler" | "atualizar" | "deletar" | "aprovar") => {
      return authService.temPermissao(contexto, recurso, operacao);
    },
    [contexto, authService]
  );

  // Verificar acesso a prestador
  const podeLerPrestador = useCallback(
    (prestador_id: number) => {
      return authService.podeLerPrestador(contexto, prestador_id);
    },
    [contexto, authService]
  );

  const podeModificarApontamentos = useCallback(
    (prestador_id: number) => {
      return authService.podeModificarApontamentos(contexto, prestador_id);
    },
    [contexto, authService]
  );

  const podeAprovarPagamento = useCallback(
    () => {
      return authService.podeAprovarPagamento(contexto);
    },
    [contexto, authService]
  );

  return {
    // Estado
    contexto,
    usuario: contexto.usuario,
    autenticado: contexto.autenticado,
    role: contexto.usuario?.role,
    carregando,
    erro,

    // Métodos
    login,
    logout,

    // Permissões
    temPermissao,
    podeLerPrestador,
    podeModificarApontamentos,
    podeAprovarPagamento,

    // Guard
    guard,
  };
}

/**
 * Hook para proteger um componente
 * Se não autenticado, renderiza mensagem de erro
 */
export function useProtegido(contexto: ContextoAutenticacao | undefined) {
  if (!contexto?.autenticado) {
    return {
      protegido: false,
      erro: "Você precisa estar autenticado para acessar este recurso",
    };
  }

  return {
    protegido: true,
  };
}
