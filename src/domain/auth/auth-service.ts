/**
 * Authentication and Authorization Service
 * Gerencia autenticação de usuários, roles e permissões para o módulo de prestadores
 *
 * Roles:
 * - admin: Acesso total, pode gerenciar usuários e permissões
 * - gestor: Pode aprovar/rejeitar pagamentos, visualizar auditoria
 * - prestador: Pode preencher seus próprios apontamentos
 * - guest: Sem acesso (login necessário)
 */

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
   * NOTA: Em produção, usar bcrypt e hash de senha!
   * Para testes: senha padrão é "senha123"
   */
  autenticar(
    email: string,
    senha: string,
    usuarios: Usuario[]
  ): { sucesso: boolean; token?: string; erro?: string } {
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

    // FIXME: Em produção, usar bcrypt.compare(senha, usuario.senha_hash)
    // Para testes/dev, validar contra senha padrão "senha123"
    const senhaValida = senha === "senha123";
    if (!senhaValida) {
      this.tentativasFalhas.set(email, tentativas + 1);
      return {
        sucesso: false,
        erro: "Email ou senha inválidos",
      };
    }

    // Sucesso - gerar token
    const token = this.gerarToken();
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
   */
  validarToken(token: string): ContextoAutenticacao | null {
    return this.sessoes.get(token) || null;
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
   * Gera um token aleatório
   * FIXME: Em produção, usar JWT com assinatura
   */
  private gerarToken(): string {
    return (
      "token_" +
      Math.random().toString(36).substring(2, 15) +
      Math.random().toString(36).substring(2, 15)
    );
  }

  /**
   * Cria um novo usuário (apenas para admins)
   */
  criarUsuario(
    novo_usuario: Omit<Usuario, "id" | "data_criacao">,
    contexto: ContextoAutenticacao
  ): { sucesso: boolean; usuario?: Usuario; erro?: string } {
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
}

// Singleton global
export const authService = new AuthService();
