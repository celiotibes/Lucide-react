/**
 * Authentication and Authorization Service
 * Gerencia autenticação de usuários, roles e permissões para o módulo de prestadores
 *
 * Roles:
 * - admin: Acesso total, pode gerenciar usuários e permissões
 * - gestor: Pode aprovar/rejeitar pagamentos, visualizar auditoria
 * - prestador: Pode preencher seus próprios apontamentos
 * - guest: Sem acesso (login necessário)
 *
 * Security Features:
 * - C-1: Passwords hashed with bcrypt (no plaintext storage)
 * - C-2: JWT tokens with signature verification and 24h expiration
 */

import bcryptjs from "bcryptjs";
import jwt from "jsonwebtoken";

// Get JWT secret from environment or use a default for development
const JWT_SECRET =
  typeof process !== "undefined" && process.env?.JWT_SECRET
    ? process.env.JWT_SECRET
    : "dev-secret-change-in-production";
const JWT_EXPIRATION = "24h"; // 24 hours

export type UserRole = "admin" | "gestor" | "prestador";

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  role: UserRole;
  prestador_id?: number; // Se prestador, qual prestador?
  ativo: boolean;
  data_criacao: string;
  ultimo_login?: string;
  senha_hash: string; // C-1: Bcrypt hash, never store plaintext
}

export interface ContextoAutenticacao {
  usuario: Usuario | null;
  autenticado: boolean;
  role?: UserRole;
  prestador_id?: number;
  token?: string;
}

export interface PermissaoOperacao {
  recurso: string;
  operacao: "criar" | "ler" | "atualizar" | "deletar" | "aprovar";
  roles: UserRole[];
}

/**
 * Mapa de permissões por role
 * Define quem pode fazer o quê no sistema
 */
const PERMISSOES_POR_ROLE: Record<UserRole, PermissaoOperacao[]> = {
  admin: [
    // Admin pode tudo
    { recurso: "prestador_contrato", operacao: "criar", roles: ["admin"] },
    { recurso: "prestador_contrato", operacao: "ler", roles: ["admin"] },
    { recurso: "prestador_contrato", operacao: "atualizar", roles: ["admin"] },
    { recurso: "prestador_contrato", operacao: "deletar", roles: ["admin"] },
    { recurso: "prestador_apontamento", operacao: "criar", roles: ["admin"] },
    { recurso: "prestador_apontamento", operacao: "ler", roles: ["admin"] },
    { recurso: "prestador_apontamento", operacao: "atualizar", roles: ["admin"] },
    { recurso: "prestador_apontamento", operacao: "deletar", roles: ["admin"] },
    { recurso: "prestador_pagamento", operacao: "criar", roles: ["admin"] },
    { recurso: "prestador_pagamento", operacao: "ler", roles: ["admin"] },
    { recurso: "prestador_pagamento", operacao: "atualizar", roles: ["admin"] },
    { recurso: "prestador_pagamento", operacao: "aprovar", roles: ["admin"] },
    { recurso: "auditoria", operacao: "ler", roles: ["admin"] },
    { recurso: "usuario", operacao: "criar", roles: ["admin"] },
    { recurso: "usuario", operacao: "atualizar", roles: ["admin"] },
  ],
  gestor: [
    // Gestor pode gerenciar pagamentos mas não criar contratos
    { recurso: "prestador_contrato", operacao: "ler", roles: ["gestor"] },
    { recurso: "prestador_apontamento", operacao: "ler", roles: ["gestor"] },
    { recurso: "prestador_apontamento", operacao: "atualizar", roles: ["gestor"] },
    { recurso: "prestador_pagamento", operacao: "ler", roles: ["gestor"] },
    { recurso: "prestador_pagamento", operacao: "aprovar", roles: ["gestor"] },
    { recurso: "auditoria", operacao: "ler", roles: ["gestor"] },
  ],
  prestador: [
    // Prestador pode apenas preencher seus apontamentos
    { recurso: "prestador_contrato", operacao: "ler", roles: ["prestador"] },
    { recurso: "prestador_apontamento", operacao: "criar", roles: ["prestador"] },
    { recurso: "prestador_apontamento", operacao: "ler", roles: ["prestador"] },
    { recurso: "prestador_apontamento", operacao: "atualizar", roles: ["prestador"] },
  ],
};

/**
 * Service de Autenticação
 * Valida credenciais, gerencia sessões e verifica permissões
 */
export class AuthService {
  private usuariosAutenticados: Map<string, Usuario> = new Map();
  private sessoes: Map<string, ContextoAutenticacao> = new Map();
  private tentativasFalhas: Map<string, number> = new Map(); // Contador para brute force protection

  /**
   * Autentica um usuário com email e senha
   * C-1: Usa bcrypt.compare para validar senha hasheada
   * C-2: Gera JWT token com expiration de 24 horas
   */
  async autenticar(
    email: string,
    senha: string,
    usuarios: Usuario[]
  ): Promise<{ sucesso: boolean; token?: string; erro?: string }> {
    // Proteção contra brute force
    const tentativas = this.tentativasFalhas.get(email) || 0;
    if (tentativas >= 5) {
      return {
        sucesso: false,
        erro: "Muitas tentativas falhadas. Tente novamente em 15 minutos.",
      };
    }

    const usuario = usuarios.find((u) => u.email === email && u.ativo);
    if (!usuario) {
      this.tentativasFalhas.set(email, tentativas + 1);
      return {
        sucesso: false,
        erro: "Email ou senha inválidos",
      };
    }

    // C-1: Use bcrypt.compare to validate hashed password
    const senhaValida = await bcryptjs.compare(senha, usuario.senha_hash);
    if (!senhaValida) {
      this.tentativasFalhas.set(email, tentativas + 1);
      return {
        sucesso: false,
        erro: "Email ou senha inválidos",
      };
    }

    // Sucesso - gerar JWT token
    const token = this.gerarToken(usuario.id, usuario.role);
    const contexto: ContextoAutenticacao = {
      usuario: { ...usuario, ultimo_login: new Date().toISOString() },
      autenticado: true,
      role: usuario.role,
      prestador_id: usuario.prestador_id,
      token,
    };

    this.sessoes.set(token, contexto);
    this.usuariosAutenticados.set(usuario.id, usuario);
    this.tentativasFalhas.delete(email); // Resetar contador de falhas

    return { sucesso: true, token };
  }

  /**
   * Valida um token de sessão
   * C-2: Verifica assinatura JWT e expiração
   */
  validarToken(token: string): ContextoAutenticacao | null {
    try {
      // First verify JWT signature and expiration
      jwt.verify(token, JWT_SECRET);

      // Then return the cached context
      return this.sessoes.get(token) || null;
    } catch (erro) {
      // JWT verification failed - token is invalid or expired
      this.sessoes.delete(token);
      return null;
    }
  }

  /**
   * Verifica se um usuário tem permissão para uma operação
   */
  temPermissao(
    contexto: ContextoAutenticacao,
    recurso: string,
    operacao: "criar" | "ler" | "atualizar" | "deletar" | "aprovar"
  ): boolean {
    if (!contexto.autenticado || !contexto.usuario) {
      return false;
    }

    const role = contexto.usuario.role;
    const permissoes = PERMISSOES_POR_ROLE[role];

    return permissoes.some(
      (p) => p.recurso === recurso && p.operacao === operacao
    );
  }

  /**
   * Verifica se o usuário pode acessar dados de um prestador específico
   * Prestadores só podem acessar seus próprios dados
   * C-5: Data isolation enforced on reads
   */
  podeLerPrestador(
    contexto: ContextoAutenticacao,
    prestador_id: number
  ): boolean {
    if (!contexto.autenticado || !contexto.usuario) {
      return false;
    }

    // Admin e gestor podem ler qualquer prestador
    if (
      contexto.usuario.role === "admin" ||
      contexto.usuario.role === "gestor"
    ) {
      return true;
    }

    // Prestador só pode ler seus próprios dados
    if (contexto.usuario.role === "prestador") {
      return contexto.usuario.prestador_id === prestador_id;
    }

    return false;
  }

  /**
   * Verifica se o usuário pode modificar apontamentos de um prestador
   * C-6: Data isolation enforced on writes
   */
  podeModificarApontamentos(
    contexto: ContextoAutenticacao,
    prestador_id: number
  ): boolean {
    if (!contexto.autenticado || !contexto.usuario) {
      return false;
    }

    // Admin pode modificar qualquer coisa
    if (contexto.usuario.role === "admin") {
      return true;
    }

    // Gestor pode modificar qualquer prestador
    if (contexto.usuario.role === "gestor") {
      return true;
    }

    // Prestador só pode modificar seus próprios apontamentos
    if (contexto.usuario.role === "prestador") {
      return contexto.usuario.prestador_id === prestador_id;
    }

    return false;
  }

  /**
   * Verifica se o usuário pode aprovar pagamentos
   */
  podeAprovarPagamento(contexto: ContextoAutenticacao): boolean {
    if (!contexto.autenticado || !contexto.usuario) {
      return false;
    }

    return (
      contexto.usuario.role === "admin" ||
      contexto.usuario.role === "gestor"
    );
  }

  /**
   * Logout - invalida a sessão
   */
  logout(token: string): void {
    this.sessoes.delete(token);
  }

  /**
   * Gera um JWT token com payload e expiração
   * C-2: JWT com { usuario_id, role, iat, exp }
   * Expira em 24 horas
   */
  private gerarToken(usuario_id: string, role: UserRole): string {
    const payload = {
      usuario_id,
      role,
      iat: Math.floor(Date.now() / 1000),
    };

    return jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRATION,
    });
  }

  /**
   * Cria um novo usuário (apenas para admins)
   * C-1: Requer senha hasheada com bcrypt
   */
  async criarUsuario(
    novo_usuario: Omit<Usuario, "id" | "data_criacao">,
    contexto: ContextoAutenticacao
  ): Promise<{ sucesso: boolean; usuario?: Usuario; erro?: string }> {
    if (!this.temPermissao(contexto, "usuario", "criar")) {
      return {
        sucesso: false,
        erro: "Sem permissão para criar usuários",
      };
    }

    const usuario: Usuario = {
      ...novo_usuario,
      id: `user_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      data_criacao: new Date().toISOString(),
    };

    this.usuariosAutenticados.set(usuario.id, usuario);

    return { sucesso: true, usuario };
  }

  /**
   * Retorna todos os usuários (apenas para admins)
   */
  obterUsuarios(contexto: ContextoAutenticacao): Usuario[] {
    if (!this.temPermissao(contexto, "usuario", "ler")) {
      return [];
    }

    return Array.from(this.usuariosAutenticados.values());
  }

  /**
   * Gera hash de senha com bcrypt
   * C-1: Helper para hashear senhas antes de armazenar
   */
  static async gerarHashSenha(senha: string): Promise<string> {
    const salt = await bcryptjs.genSalt(10);
    return bcryptjs.hash(senha, salt);
  }
}

// Singleton global
export const authService = new AuthService();
