/**
 * Permission Guard Service
 * Middleware para verificar permissões e registrar auditoria
 */

import { AuthService, ContextoAutenticacao, UserRole } from "./auth-service";
import { AuditTrailService, TipoAcao } from "./audit-trail";

export class PermissionGuard {
  constructor(
    private authService: AuthService,
    private auditService: AuditTrailService
  ) {}

  /**
   * Verifica se contexto está autenticado, se não registra acesso negado
   */
  garantirAutenticacao(contexto: ContextoAutenticacao | null): contexto is ContextoAutenticacao {
    if (!contexto?.autenticado) {
      // Não há contexto, então não podemos registrar
      console.warn("[SECURITY] Tentativa de acesso sem autenticação");
      return false;
    }
    return true;
  }

  /**
   * Verifica permissão e registra auditoria
   */
  verificarPermissao(
    contexto: ContextoAutenticacao,
    recurso: string,
    operacao: "criar" | "ler" | "atualizar" | "deletar" | "aprovar"
  ): { permitido: boolean; motivo?: string } {
    if (!contexto.autenticado || !contexto.usuario) {
      this.auditService.registrarAcessoNegado(
        contexto,
        recurso,
        operacao,
        "Usuário não autenticado"
      );
      return {
        permitido: false,
        motivo: "Não autenticado",
      };
    }

    const temPermissao = this.authService.temPermissao(contexto, recurso, operacao);

    if (!temPermissao) {
      this.auditService.registrarAcessoNegado(
        contexto,
        recurso,
        operacao,
        `Role '${contexto.usuario.role}' não tem permissão para '${operacao}' em '${recurso}'`
      );
      return {
        permitido: false,
        motivo: `Seu role (${contexto.usuario.role}) não tem permissão para esta ação`,
      };
    }

    return { permitido: true };
  }

  /**
   * Wrapper para operações de leitura com auditoria
   */
  comLeitura<T>(
    contexto: ContextoAutenticacao,
    recurso: string,
    operacao: () => T,
    opcoes?: { recurso_id?: string; prestador_id?: number }
  ): { sucesso: boolean; dados?: T; erro?: string } {
    // Verificar autenticação
    if (!contexto.autenticado) {
      this.auditService.registrarAcessoNegado(contexto, recurso, "ler", "Não autenticado");
      return { sucesso: false, erro: "Não autenticado" };
    }

    // Verificar permissão
    const permissao = this.verificarPermissao(contexto, recurso, "ler");
    if (!permissao.permitido) {
      return { sucesso: false, erro: permissao.motivo };
    }

    try {
      const dados = operacao();

      this.auditService.registrarAcao(
        contexto,
        "login", // Placeholder - melhorar tipagem
        recurso,
        opcoes?.recurso_id || recurso,
        {
          descricao: `Leitura de ${recurso}`,
          resultado: "sucesso",
          prestador_id: opcoes?.prestador_id,
        }
      );

      return { sucesso: true, dados };
    } catch (erro) {
      this.auditService.registrarAcao(
        contexto,
        "login",
        recurso,
        opcoes?.recurso_id || recurso,
        {
          descricao: `Leitura falhou: ${erro instanceof Error ? erro.message : "Erro desconhecido"}`,
          resultado: "falha",
          motivo_falha: erro instanceof Error ? erro.message : "Erro desconhecido",
          prestador_id: opcoes?.prestador_id,
        }
      );

      return { sucesso: false, erro: "Falha ao ler dados" };
    }
  }

  /**
   * Wrapper para operações de escrita com auditoria
   */
  comEscrita<T>(
    contexto: ContextoAutenticacao,
    tipo_acao: TipoAcao,
    recurso: string,
    recurso_id: string,
    operacao: () => T,
    opcoes?: {
      valores_antigos?: Record<string, any>;
      valores_novos?: Record<string, any>;
      endereco_ip?: string;
      prestador_id?: number;
    }
  ): { sucesso: boolean; dados?: T; erro?: string } {
    // Verificar autenticação
    if (!contexto.autenticado) {
      this.auditService.registrarAcessoNegado(contexto, recurso, "escrever", "Não autenticado");
      return { sucesso: false, erro: "Não autenticado" };
    }

    // Mapear tipo de ação para operação
    let operacaoPermissao: "criar" | "atualizar" | "deletar" | "aprovar" = "atualizar";
    if (tipo_acao.includes("criar")) operacaoPermissao = "criar";
    if (tipo_acao.includes("deletar")) operacaoPermissao = "deletar";
    if (tipo_acao.includes("aprovar")) operacaoPermissao = "aprovar";

    // Verificar permissão
    const permissao = this.verificarPermissao(contexto, recurso, operacaoPermissao);
    if (!permissao.permitido) {
      return { sucesso: false, erro: permissao.motivo };
    }

    // Verificar se é prestador tentando modificar dados de outro prestador
    if (
      contexto.usuario?.role === "prestador" &&
      opcoes?.prestador_id &&
      contexto.usuario.prestador_id !== opcoes.prestador_id
    ) {
      this.auditService.registrarAcessoNegado(
        contexto,
        recurso,
        "atualizar",
        "Prestador tentando modificar dados de outro prestador"
      );
      return {
        sucesso: false,
        erro: "Você só pode modificar seus próprios dados",
      };
    }

    try {
      const dados = operacao();

      this.auditService.registrarAcao(contexto, tipo_acao, recurso, recurso_id, {
        descricao: `Ação: ${tipo_acao}`,
        valores_antigos: opcoes?.valores_antigos,
        valores_novos: opcoes?.valores_novos,
        endereco_ip: opcoes?.endereco_ip,
        resultado: "sucesso",
        prestador_id: opcoes?.prestador_id,
      });

      return { sucesso: true, dados };
    } catch (erro) {
      this.auditService.registrarAcao(contexto, tipo_acao, recurso, recurso_id, {
        descricao: `Ação falhou: ${erro instanceof Error ? erro.message : "Erro desconhecido"}`,
        resultado: "falha",
        motivo_falha: erro instanceof Error ? erro.message : "Erro desconhecido",
        prestador_id: opcoes?.prestador_id,
      });

      return { sucesso: false, erro: `Falha ao ${tipo_acao}` };
    }
  }

  /**
   * Helper para operações de prestador
   * Valida que o usuário é prestador ou gestor/admin e tem acesso ao prestador
   */
  validarAcessoPrestador(
    contexto: ContextoAutenticacao,
    prestador_id: number
  ): { permitido: boolean; motivo?: string } {
    if (!contexto.autenticado || !contexto.usuario) {
      return { permitido: false, motivo: "Não autenticado" };
    }

    // Admin sempre pode acessar
    if (contexto.usuario.role === "admin") {
      return { permitido: true };
    }

    // Gestor pode acessar qualquer prestador
    if (contexto.usuario.role === "gestor") {
      return { permitido: true };
    }

    // Prestador só pode acessar seus próprios dados
    if (
      contexto.usuario.role === "prestador" &&
      contexto.usuario.prestador_id === prestador_id
    ) {
      return { permitido: true };
    }

    return {
      permitido: false,
      motivo: "Você não tem acesso aos dados deste prestador",
    };
  }
}

/**
 * Factory para criar guards com serviços
 */
export function criarPermissionGuard(
  authService: AuthService,
  auditService: AuditTrailService
): PermissionGuard {
  return new PermissionGuard(authService, auditService);
}
