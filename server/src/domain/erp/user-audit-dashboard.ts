/**
 * User Audit & Access Dashboard (PHASE 5)
 * Tracking user activity, data access audit, and LGPD compliance
 *
 * Rastreamento:
 * - Login/Logout events
 * - Actions performed (create, read, update, delete)
 * - Reports accessed
 * - Data exports
 *
 * Auditoria de Acesso:
 * - Which data users accessed (row-level)
 * - Permission changes
 * - Sensitive data access
 *
 * Conformidade LGPD:
 * - Data anonymization on deletion
 * - Retention policies
 * - Right to be forgotten
 * - Data portability
 */

import { createHash } from "crypto";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export type TipoEvento = "login" | "logout" | "create" | "read" | "update" | "delete" | "export" | "download" | "permission_change";
export type TipoRecurso = "relatorio" | "dashboard" | "ledger" | "usuario" | "documento";

export interface EventoAuditoria {
  id: string;
  usuario_id: string;
  tipo_evento: TipoEvento;
  tipo_recurso: TipoRecurso;
  recurso_id: string;
  descricao: string;
  endereco_ip: string;
  user_agent: string;
  status: "sucesso" | "falha" | "negado";
  data_evento: string;
  detalhes: Record<string, any>;
}

export interface AtividadeUsuario {
  usuario_id: string;
  nome: string;
  email: string;
  total_eventos: number;
  ultimo_login: string;
  total_logins_7d: number;
  acao_mais_comum: string;
  dados_acessados: string[];
  relatorios_acessados: number;
}

export interface AuditoriaAcesso {
  usuario_id: string;
  recurso_id: string;
  tipo_recurso: TipoRecurso;
  data_acesso: string;
  tipo_acesso: "leitura" | "escrita" | "exclusão";
  motivo?: string;
  autorizado: boolean;
}

export interface DashboardAuditoria {
  periodo: string;
  total_eventos_auditados: number;
  usuarios_ativos: number;
  acessos_negados: number;
  dados_sensíveis_acessados: number;
  anomalias_detectadas: string[];
  usuarios_mais_ativos: AtividadeUsuario[];
  eventos_recentes: EventoAuditoria[];
}

export interface ConfiguracaoLGPD {
  dias_retencao_padrao: number;
  anonimizar_ao_deletar: boolean;
  permitir_export_dados: boolean;
  notificar_acesso_sensivel: boolean;
  tempo_expiracao_sessao_minutos: number;
}

// ============================================================================
// CLASSE: AUDIT DASHBOARD
// ============================================================================

export class UserAuditDashboard {
  private eventos_auditoria: Map<string, EventoAuditoria> = new Map();
  private atividades_usuario: Map<string, AtividadeUsuario> = new Map();
  private auditoria_acesso: Map<string, AuditoriaAcesso[]> = new Map();
  private configuracao_lgpd: ConfiguracaoLGPD = {
    dias_retencao_padrao: 90,
    anonimizar_ao_deletar: true,
    permitir_export_dados: true,
    notificar_acesso_sensivel: true,
    tempo_expiracao_sessao_minutos: 480, // 8 horas
  };
  private dados_sensitivos: Set<string> = new Set();

  constructor() {
    // Adicionar dados conhecidos como sensíveis
    this.dados_sensitivos.add("salario");
    this.dados_sensitivos.add("cpf");
    this.dados_sensitivos.add("banco");
    this.dados_sensitivos.add("senha");
    this.dados_sensitivos.add("pii"); // Personally Identifiable Information
  }

  /**
   * Registra um evento de auditoria
   */
  public registrarEvento(config: {
    usuario_id: string;
    tipo_evento: TipoEvento;
    tipo_recurso: TipoRecurso;
    recurso_id: string;
    descricao: string;
    endereco_ip: string;
    user_agent: string;
    status: "sucesso" | "falha" | "negado";
    detalhes?: Record<string, any>;
  }): EventoAuditoria {
    const id = `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const evento: EventoAuditoria = {
      id,
      usuario_id: config.usuario_id,
      tipo_evento: config.tipo_evento,
      tipo_recurso: config.tipo_recurso,
      recurso_id: config.recurso_id,
      descricao: config.descricao,
      endereco_ip: config.endereco_ip,
      user_agent: config.user_agent,
      status: config.status,
      data_evento: new Date().toISOString(),
      detalhes: config.detalhes || {},
    };

    this.eventos_auditoria.set(id, evento);

    // Atualizar atividade do usuário
    this.atualizarAtividadeUsuario(config.usuario_id, evento);

    // Verificar se é acesso a dados sensíveis
    if (this.ehAcessoDadosSensivel(evento)) {
      this.notificarAcessoDadosSensivel(evento);
    }

    return evento;
  }

  /**
   * Registra acesso a dados
   */
  public registrarAcessoDados(config: {
    usuario_id: string;
    recurso_id: string;
    tipo_recurso: TipoRecurso;
    tipo_acesso: "leitura" | "escrita" | "exclusão";
    motivo?: string;
    autorizado: boolean;
  }): AuditoriaAcesso {
    const auditoria: AuditoriaAcesso = {
      usuario_id: config.usuario_id,
      recurso_id: config.recurso_id,
      tipo_recurso: config.tipo_recurso,
      data_acesso: new Date().toISOString(),
      tipo_acesso: config.tipo_acesso,
      motivo: config.motivo,
      autorizado: config.autorizado,
    };

    const chave = `${config.usuario_id}_${config.recurso_id}`;
    if (!this.auditoria_acesso.has(chave)) {
      this.auditoria_acesso.set(chave, []);
    }

    this.auditoria_acesso.get(chave)!.push(auditoria);

    return auditoria;
  }

  /**
   * Obtém atividade de um usuário
   */
  public obterAtividadeUsuario(usuario_id: string): AtividadeUsuario | null {
    return this.atividades_usuario.get(usuario_id) || null;
  }

  /**
   * Obtém eventos de auditoria com filtros
   */
  public obterEventosAuditoria(filtros?: {
    usuario_id?: string;
    tipo_evento?: TipoEvento;
    tipo_recurso?: TipoRecurso;
    data_inicio?: string;
    data_fim?: string;
    limite?: number;
  }): EventoAuditoria[] {
    let eventos = Array.from(this.eventos_auditoria.values());

    if (filtros?.usuario_id) {
      eventos = eventos.filter((e) => e.usuario_id === filtros.usuario_id);
    }

    if (filtros?.tipo_evento) {
      eventos = eventos.filter((e) => e.tipo_evento === filtros.tipo_evento);
    }

    if (filtros?.tipo_recurso) {
      eventos = eventos.filter((e) => e.tipo_recurso === filtros.tipo_recurso);
    }

    if (filtros?.data_inicio && filtros?.data_fim) {
      const inicio = new Date(filtros.data_inicio).getTime();
      const fim = new Date(filtros.data_fim).getTime();
      eventos = eventos.filter((e) => {
        const data = new Date(e.data_evento).getTime();
        return data >= inicio && data <= fim;
      });
    }

    // Ordenar por data descendente
    eventos.sort(
      (a, b) =>
        new Date(b.data_evento).getTime() - new Date(a.data_evento).getTime()
    );

    // Aplicar limite
    if (filtros?.limite) {
      eventos = eventos.slice(0, filtros.limite);
    }

    return eventos;
  }

  /**
   * Obtém relatório de auditoria de acesso
   */
  public obterRelatorioAuditoriaAcesso(usuario_id?: string): AuditoriaAcesso[] {
    const acessos: AuditoriaAcesso[] = [];

    for (const [chave, lista] of this.auditoria_acesso.entries()) {
      if (usuario_id && !chave.startsWith(usuario_id)) {
        continue;
      }
      acessos.push(...lista);
    }

    // Ordenar por data
    acessos.sort(
      (a, b) =>
        new Date(b.data_acesso).getTime() - new Date(a.data_acesso).getTime()
    );

    return acessos;
  }

  /**
   * Obtém dashboard de auditoria
   */
  public obterDashboardAuditoria(periodo_dias: number = 7): DashboardAuditoria {
    const data_inicio = new Date();
    data_inicio.setDate(data_inicio.getDate() - periodo_dias);

    const eventos_periodo = this.obterEventosAuditoria({
      data_inicio: data_inicio.toISOString(),
      data_fim: new Date().toISOString(),
    });

    const usuarios_unicos = new Set<string>();
    const acessos_negados = eventos_periodo.filter((e) => e.status === "negado")
      .length;
    const dados_sensivel_acessos = eventos_periodo.filter((e) =>
      this.ehAcessoDadosSensivel(e)
    ).length;

    const anomalias = this.detectarAnomalias(eventos_periodo);

    // Usuários mais ativos
    const atividades_map = new Map<string, AtividadeUsuario>();
    for (const evento of eventos_periodo) {
      usuarios_unicos.add(evento.usuario_id);
      const atividade = this.atividades_usuario.get(evento.usuario_id);
      if (atividade) {
        atividades_map.set(evento.usuario_id, atividade);
      }
    }

    const usuarios_mais_ativos = Array.from(atividades_map.values())
      .sort((a, b) => b.total_eventos - a.total_eventos)
      .slice(0, 10);

    // Últimos eventos
    const eventos_recentes = eventos_periodo.slice(0, 20);

    return {
      periodo: `${periodo_dias} dias`,
      total_eventos_auditados: eventos_periodo.length,
      usuarios_ativos: usuarios_unicos.size,
      acessos_negados,
      dados_sensíveis_acessados: dados_sensivel_acessos,
      anomalias_detectadas: anomalias,
      usuarios_mais_ativos,
      eventos_recentes,
    };
  }

  /**
   * Implementa "Right to be forgotten" (LGPD)
   */
  public diretoSerEsquecido(usuario_id: string): boolean {
    try {
      // Anonimizar todos os dados do usuário
      const eventos = Array.from(this.eventos_auditoria.values()).filter(
        (e) => e.usuario_id === usuario_id
      );

      for (const evento of eventos) {
        evento.usuario_id = this.anonimizarDado(usuario_id);
        evento.detalhes = this.anonimizarObjeto(evento.detalhes);
      }

      // Remover atividade do usuário
      this.atividades_usuario.delete(usuario_id);

      // Anonimizar auditoria de acesso
      for (const [chave, lista] of this.auditoria_acesso.entries()) {
        if (chave.startsWith(usuario_id)) {
          for (const auditoria of lista) {
            auditoria.usuario_id = this.anonimizarDado(usuario_id);
          }
        }
      }

      console.log(`Usuário ${usuario_id} foi anonimizado conforme LGPD`);
      return true;
    } catch (error) {
      console.error(`Erro ao processar Right to be Forgotten: ${error}`);
      return false;
    }
  }

  /**
   * Exporta dados do usuário (Data Portability - LGPD)
   */
  public exportarDadosUsuario(usuario_id: string): string {
    const dados = {
      usuario_id,
      eventos_auditoria: Array.from(this.eventos_auditoria.values()).filter(
        (e) => e.usuario_id === usuario_id
      ),
      atividade: this.atividades_usuario.get(usuario_id),
      auditoria_acesso: this.obterRelatorioAuditoriaAcesso(usuario_id),
      data_exportacao: new Date().toISOString(),
    };

    return JSON.stringify(dados, null, 2);
  }

  /**
   * Define configuração LGPD
   */
  public definirConfiguracao(config: Partial<ConfiguracaoLGPD>): void {
    this.configuracao_lgpd = {
      ...this.configuracao_lgpd,
      ...config,
    };
  }

  /**
   * Limpa dados antigos baseado em política de retenção
   */
  public limparDadosAntigos(): { registros_deletados: number } {
    const cutoff_date = new Date();
    cutoff_date.setDate(
      cutoff_date.getDate() - this.configuracao_lgpd.dias_retencao_padrao
    );

    let deletados = 0;
    const eventos_para_manter = [];

    for (const evento of this.eventos_auditoria.values()) {
      const data_evento = new Date(evento.data_evento);
      if (data_evento < cutoff_date) {
        if (this.configuracao_lgpd.anonimizar_ao_deletar) {
          evento.usuario_id = this.anonimizarDado(evento.usuario_id);
          eventos_para_manter.push(evento);
        }
        deletados++;
      } else {
        eventos_para_manter.push(evento);
      }
    }

    // Reconstruir mapa
    this.eventos_auditoria.clear();
    for (const evento of eventos_para_manter) {
      this.eventos_auditoria.set(evento.id, evento);
    }

    return { registros_deletados: deletados };
  }

  /**
   * Gera relatório de conformidade LGPD
   */
  public gerarRelatorioConformidade(): Record<string, any> {
    return {
      data_geracao: new Date().toISOString(),
      configuracao_lgpd: this.configuracao_lgpd,
      total_eventos_auditados: this.eventos_auditoria.size,
      usuarios_rastreados: this.atividades_usuario.size,
      regras_conformidade: {
        anonimizacao_ativada: this.configuracao_lgpd.anonimizar_ao_deletar,
        retencao_dias: this.configuracao_lgpd.dias_retencao_padrao,
        exportacao_dados_permitida: this.configuracao_lgpd.permitir_export_dados,
        alerta_dados_sensivel: this.configuracao_lgpd.notificar_acesso_sensivel,
      },
      conformidade_status: "em_dia",
    };
  }

  // ========================================================================
  // MÉTODOS PRIVADOS
  // ========================================================================

  private atualizarAtividadeUsuario(
    usuario_id: string,
    evento: EventoAuditoria
  ): void {
    let atividade = this.atividades_usuario.get(usuario_id);

    if (!atividade) {
      atividade = {
        usuario_id,
        nome: "Usuário " + usuario_id,
        email: `${usuario_id}@empresa.com`,
        total_eventos: 0,
        ultimo_login: new Date().toISOString(),
        total_logins_7d: 0,
        acao_mais_comum: "",
        dados_acessados: [],
        relatorios_acessados: 0,
      };

      this.atividades_usuario.set(usuario_id, atividade);
    }

    atividade.total_eventos++;

    if (evento.tipo_evento === "login") {
      atividade.ultimo_login = evento.data_evento;
      atividade.total_logins_7d++;
    }

    if (evento.tipo_recurso === "relatorio") {
      atividade.relatorios_acessados++;
    }

    if (evento.tipo_evento === "read") {
      atividade.dados_acessados.push(evento.recurso_id);
    }
  }

  private ehAcessoDadosSensivel(evento: EventoAuditoria): boolean {
    const descricao_lower = evento.descricao.toLowerCase();

    for (const dado_sensivel of this.dados_sensitivos) {
      if (descricao_lower.includes(dado_sensivel)) {
        return true;
      }
    }

    return false;
  }

  private notificarAcessoDadosSensivel(evento: EventoAuditoria): void {
    if (this.configuracao_lgpd.notificar_acesso_sensivel) {
      console.log(
        `ALERTA: Dados sensíveis acessados por ${evento.usuario_id} - ${evento.descricao}`
      );
    }
  }

  private detectarAnomalias(eventos: EventoAuditoria[]): string[] {
    const anomalias: string[] = [];

    // Detectar múltiplas tentativas falhadas de login
    const logins_falhados = eventos.filter(
      (e) => e.tipo_evento === "login" && e.status === "falha"
    );
    if (logins_falhados.length > 5) {
      anomalias.push(
        `Múltiplas tentativas de login falhadas (${logins_falhados.length})`
      );
    }

    // Detectar acessos negados
    const acessos_negados = eventos.filter((e) => e.status === "negado");
    if (acessos_negados.length > 10) {
      anomalias.push(`Múltiplos acessos negados (${acessos_negados.length})`);
    }

    // Detectar atividades fora do horário
    const atividades_notarnas = eventos.filter((e) => {
      const hora = new Date(e.data_evento).getHours();
      return hora < 6 || hora > 22;
    });

    if (atividades_notarnas.length > eventos.length / 2) {
      anomalias.push("Atividades anormais fora do horário comercial");
    }

    return anomalias;
  }

  private anonimizarDado(valor: string): string {
    return createHash("sha256").update(valor).digest("hex").substring(0, 16);
  }

  private anonimizarObjeto(obj: Record<string, any>): Record<string, any> {
    const resultado: Record<string, any> = {};

    for (const [chave, valor] of Object.entries(obj)) {
      if (typeof valor === "string") {
        resultado[chave] = this.anonimizarDado(valor);
      } else {
        resultado[chave] = valor;
      }
    }

    return resultado;
  }
}

// ============================================================================
// INSTÂNCIA SINGLETON
// ============================================================================

export const userAuditDashboard = new UserAuditDashboard();
