/**
 * Dashboard Layout & Components (PHASE 5)
 * Customizable dashboard with drag-drop layout and multiple templates
 *
 * Widget Types:
 * - KPI Cards: Margem Lucro, ROI, Liquidez, Solvabilidade
 * - Line Charts: Tendência de KPIs
 * - Bar Charts: Comparação módulos
 * - Gauge Meters: Liquidez corrente, taxa ocupação
 * - Status Tiles: Alertas ativos, anomalias
 *
 * Dashboard Templates:
 * - CEO View: High-level KPIs, strategic alerts
 * - CFO View: Financial details, cash flow, profitability
 * - Manager View: Module performance, team productivity
 * - Auditor View: Data integrity, access logs, compliance
 */

import { createHash } from "crypto";

// ============================================================================
// TIPOS E INTERFACES
// ============================================================================

export type WidgetType =
  | "kpi_card"
  | "line_chart"
  | "bar_chart"
  | "gauge_meter"
  | "status_tile"
  | "table"
  | "heatmap";

export type DashboardTemplate = "ceo" | "cfo" | "manager" | "auditor" | "custom";

export interface Widget {
  id: string;
  tipo: WidgetType;
  titulo: string;
  descricao?: string;
  posicao: {
    x: number;
    y: number;
    largura: number;
    altura: number;
  };
  dados: {
    fonte_dados: string;
    kpi_mapeado?: string;
    atualizar_intervalo?: number; // ms
    filtros?: Record<string, any>;
  };
  tema: {
    cor_fundo?: string;
    cor_texto?: string;
    cor_destaque?: string;
  };
  ativo: boolean;
}

export interface Dashboard {
  id: string;
  usuario_id: string;
  nome: string;
  descricao?: string;
  template_base: DashboardTemplate;
  widgets: Widget[];
  tamanho_grid: {
    colunas: number;
    linhas: number;
  };
  responsivo: boolean;
  tema: "light" | "dark";
  criado_em: string;
  atualizado_em: string;
  hash_verificacao: string;
}

export interface LayoutConfig {
  dashboard_id: string;
  widgets_ordem: string[]; // IDs dos widgets em ordem
  layout_salvo: boolean;
  data_salvamento: string;
}

export interface DashboardTemplate_Config {
  nome: DashboardTemplate;
  descricao: string;
  widgets_padrao: Widget[];
  tamanho_grid: { colunas: number; linhas: number };
  permisos_minimos: string[];
}

// ============================================================================
// CLASSE: GERENCIADOR DE DASHBOARDS
// ============================================================================

export class DashboardLayoutManager {
  private dashboards: Map<string, Dashboard> = new Map();
  private layouts: Map<string, LayoutConfig> = new Map();
  private templates: Map<DashboardTemplate, DashboardTemplate_Config> =
    new Map();
  private historico: Map<string, Dashboard[]> = new Map();

  constructor() {
    this.inicializarTemplatesPadrao();
  }

  /**
   * Cria um novo dashboard
   */
  public criarDashboard(config: {
    usuario_id: string;
    nome: string;
    template_base: DashboardTemplate;
    tema?: "light" | "dark";
  }): Dashboard {
    // Validação
    if (!config.usuario_id || !config.nome) {
      throw new Error("usuario_id e nome são obrigatórios");
    }

    const id = `dash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const template = this.templates.get(config.template_base);

    if (!template) {
      throw new Error(`Template ${config.template_base} não encontrado`);
    }

    const dashboard: Dashboard = {
      id,
      usuario_id: config.usuario_id,
      nome: config.nome,
      template_base: config.template_base,
      widgets: JSON.parse(JSON.stringify(template.widgets_padrao)), // Deep copy
      tamanho_grid: template.tamanho_grid,
      responsivo: true,
      tema: config.tema || "light",
      criado_em: new Date().toISOString(),
      atualizado_em: new Date().toISOString(),
      hash_verificacao: "",
    };

    dashboard.hash_verificacao = this.gerarHashDashboard(dashboard);
    this.dashboards.set(id, dashboard);

    // Armazenar no histórico
    if (!this.historico.has(config.usuario_id)) {
      this.historico.set(config.usuario_id, []);
    }
    this.historico.get(config.usuario_id)!.push(dashboard);

    return dashboard;
  }

  /**
   * Obtém dashboard pelo ID
   */
  public obterDashboard(dashboard_id: string): Dashboard | null {
    return this.dashboards.get(dashboard_id) || null;
  }

  /**
   * Lista dashboards de um usuário
   */
  public listarDashboardsUsuario(usuario_id: string): Dashboard[] {
    const dashboards: Dashboard[] = [];
    for (const dashboard of this.dashboards.values()) {
      if (dashboard.usuario_id === usuario_id) {
        dashboards.push(dashboard);
      }
    }
    return dashboards;
  }

  /**
   * Adiciona um novo widget ao dashboard
   */
  public adicionarWidget(
    dashboard_id: string,
    widget_config: {
      tipo: WidgetType;
      titulo: string;
      posicao: { x: number; y: number; largura: number; altura: number };
      dados: {
        fonte_dados: string;
        kpi_mapeado?: string;
        atualizar_intervalo?: number;
        filtros?: Record<string, any>;
      };
      tema?: { cor_fundo?: string; cor_texto?: string; cor_destaque?: string };
    }
  ): Widget | null {
    const dashboard = this.dashboards.get(dashboard_id);
    if (!dashboard) {
      throw new Error(`Dashboard ${dashboard_id} não encontrado`);
    }

    const widget: Widget = {
      id: `widget_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      tipo: widget_config.tipo,
      titulo: widget_config.titulo,
      posicao: widget_config.posicao,
      dados: widget_config.dados,
      tema: widget_config.tema || {},
      ativo: true,
    };

    // Validar posição no grid
    if (
      widget.posicao.x < 0 ||
      widget.posicao.y < 0 ||
      widget.posicao.x + widget.posicao.largura > dashboard.tamanho_grid.colunas ||
      widget.posicao.y + widget.posicao.altura > dashboard.tamanho_grid.linhas
    ) {
      throw new Error("Posição do widget fora dos limites do grid");
    }

    dashboard.widgets.push(widget);
    dashboard.atualizado_em = new Date().toISOString();
    dashboard.hash_verificacao = this.gerarHashDashboard(dashboard);

    return widget;
  }

  /**
   * Remove widget do dashboard
   */
  public removerWidget(dashboard_id: string, widget_id: string): boolean {
    const dashboard = this.dashboards.get(dashboard_id);
    if (!dashboard) {
      return false;
    }

    const index = dashboard.widgets.findIndex((w) => w.id === widget_id);
    if (index === -1) {
      return false;
    }

    dashboard.widgets.splice(index, 1);
    dashboard.atualizado_em = new Date().toISOString();
    dashboard.hash_verificacao = this.gerarHashDashboard(dashboard);

    return true;
  }

  /**
   * Atualiza posição de um widget (drag-drop)
   */
  public atualizarPosicaoWidget(
    dashboard_id: string,
    widget_id: string,
    nova_posicao: { x: number; y: number; largura?: number; altura?: number }
  ): Widget | null {
    const dashboard = this.dashboards.get(dashboard_id);
    if (!dashboard) {
      return null;
    }

    const widget = dashboard.widgets.find((w) => w.id === widget_id);
    if (!widget) {
      return null;
    }

    // Validar nova posição
    const largura = nova_posicao.largura || widget.posicao.largura;
    const altura = nova_posicao.altura || widget.posicao.altura;

    if (
      nova_posicao.x < 0 ||
      nova_posicao.y < 0 ||
      nova_posicao.x + largura > dashboard.tamanho_grid.colunas ||
      nova_posicao.y + altura > dashboard.tamanho_grid.linhas
    ) {
      throw new Error("Nova posição fora dos limites do grid");
    }

    widget.posicao.x = nova_posicao.x;
    widget.posicao.y = nova_posicao.y;
    if (nova_posicao.largura) widget.posicao.largura = nova_posicao.largura;
    if (nova_posicao.altura) widget.posicao.altura = nova_posicao.altura;

    dashboard.atualizado_em = new Date().toISOString();
    dashboard.hash_verificacao = this.gerarHashDashboard(dashboard);

    return widget;
  }

  /**
   * Salva layout do dashboard
   */
  public salvarLayout(dashboard_id: string): LayoutConfig | null {
    const dashboard = this.dashboards.get(dashboard_id);
    if (!dashboard) {
      return null;
    }

    const layout: LayoutConfig = {
      dashboard_id,
      widgets_ordem: dashboard.widgets.map((w) => w.id),
      layout_salvo: true,
      data_salvamento: new Date().toISOString(),
    };

    this.layouts.set(dashboard_id, layout);
    return layout;
  }

  /**
   * Restaura layout anterior
   */
  public restaurarLayout(dashboard_id: string): Dashboard | null {
    const dashboard = this.dashboards.get(dashboard_id);
    if (!dashboard) {
      return null;
    }

    const historico = this.historico.get(dashboard.usuario_id);
    if (!historico || historico.length < 2) {
      return null; // Sem histórico suficiente
    }

    // Retornar versão anterior (antes da última)
    const versao_anterior = historico[historico.length - 2];
    this.dashboards.set(dashboard_id, JSON.parse(JSON.stringify(versao_anterior)));

    return versao_anterior;
  }

  /**
   * Alterna tema do dashboard
   */
  public alternarTema(
    dashboard_id: string,
    novo_tema: "light" | "dark"
  ): Dashboard | null {
    const dashboard = this.dashboards.get(dashboard_id);
    if (!dashboard) {
      return null;
    }

    dashboard.tema = novo_tema;
    dashboard.atualizado_em = new Date().toISOString();
    dashboard.hash_verificacao = this.gerarHashDashboard(dashboard);

    return dashboard;
  }

  /**
   * Exporta dashboard como JSON
   */
  public exportarDashboard(dashboard_id: string): string | null {
    const dashboard = this.dashboards.get(dashboard_id);
    if (!dashboard) {
      return null;
    }

    return JSON.stringify(dashboard, null, 2);
  }

  /**
   * Importa dashboard a partir de JSON
   */
  public importarDashboard(
    usuario_id: string,
    json_dados: string
  ): Dashboard | null {
    try {
      const dados = JSON.parse(json_dados);

      // Validar estrutura
      if (!dados.nome || !dados.widgets) {
        throw new Error("JSON inválido");
      }

      const dashboard: Dashboard = {
        id: `dash_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        usuario_id,
        nome: `${dados.nome} (Importado)`,
        template_base: dados.template_base || "custom",
        widgets: dados.widgets,
        tamanho_grid: dados.tamanho_grid || { colunas: 12, linhas: 8 },
        responsivo: dados.responsivo !== false,
        tema: dados.tema || "light",
        criado_em: new Date().toISOString(),
        atualizado_em: new Date().toISOString(),
        hash_verificacao: "",
      };

      dashboard.hash_verificacao = this.gerarHashDashboard(dashboard);
      this.dashboards.set(dashboard.id, dashboard);

      return dashboard;
    } catch (error) {
      console.error("Erro ao importar dashboard:", error);
      return null;
    }
  }

  /**
   * Obtém estatísticas do dashboard
   */
  public obterEstatisticas(dashboard_id: string): Record<string, any> | null {
    const dashboard = this.dashboards.get(dashboard_id);
    if (!dashboard) {
      return null;
    }

    const widgets_por_tipo: Record<string, number> = {};
    dashboard.widgets.forEach((widget) => {
      widgets_por_tipo[widget.tipo] = (widgets_por_tipo[widget.tipo] || 0) + 1;
    });

    return {
      total_widgets: dashboard.widgets.length,
      widgets_ativos: dashboard.widgets.filter((w) => w.ativo).length,
      widgets_por_tipo,
      ultima_atualizacao: dashboard.atualizado_em,
      tempo_criacao: new Date(dashboard.criado_em).getTime(),
      dias_existencia: Math.floor(
        (Date.now() - new Date(dashboard.criado_em).getTime()) / (1000 * 60 * 60 * 24)
      ),
    };
  }

  // ========================================================================
  // MÉTODOS PRIVADOS
  // ========================================================================

  private inicializarTemplatesPadrao(): void {
    // Template CEO
    this.templates.set("ceo", {
      nome: "ceo",
      descricao: "Dashboard estratégico para CEOs",
      permisos_minimos: ["admin", "ceo"],
      tamanho_grid: { colunas: 12, linhas: 8 },
      widgets_padrao: [
        {
          id: "widget_kpi_margem",
          tipo: "kpi_card",
          titulo: "Margem de Lucro",
          posicao: { x: 0, y: 0, largura: 3, altura: 2 },
          dados: {
            fonte_dados: "kpi_engine",
            kpi_mapeado: "margem_lucro",
            atualizar_intervalo: 5000,
          },
          tema: { cor_destaque: "#4CAF50" },
          ativo: true,
        },
        {
          id: "widget_kpi_roi",
          tipo: "kpi_card",
          titulo: "ROI",
          posicao: { x: 3, y: 0, largura: 3, altura: 2 },
          dados: {
            fonte_dados: "kpi_engine",
            kpi_mapeado: "roi",
            atualizar_intervalo: 5000,
          },
          tema: { cor_destaque: "#2196F3" },
          ativo: true,
        },
        {
          id: "widget_chart_tendencia",
          tipo: "line_chart",
          titulo: "Tendência de Receita",
          posicao: { x: 0, y: 2, largura: 6, altura: 3 },
          dados: {
            fonte_dados: "kpi_engine",
            atualizar_intervalo: 60000,
          },
          ativo: true,
        },
        {
          id: "widget_alertas",
          tipo: "status_tile",
          titulo: "Alertas Ativos",
          posicao: { x: 6, y: 0, largura: 3, altura: 2 },
          dados: {
            fonte_dados: "kpi_engine",
            atualizar_intervalo: 5000,
          },
          ativo: true,
        },
      ],
    });

    // Template CFO
    this.templates.set("cfo", {
      nome: "cfo",
      descricao: "Dashboard financeiro para CFOs",
      permisos_minimos: ["admin", "cfo", "finance"],
      tamanho_grid: { colunas: 12, linhas: 10 },
      widgets_padrao: [
        {
          id: "widget_kpi_liquidez",
          tipo: "gauge_meter",
          titulo: "Liquidez Corrente",
          posicao: { x: 0, y: 0, largura: 3, altura: 2 },
          dados: {
            fonte_dados: "kpi_engine",
            kpi_mapeado: "liquidez_corrente",
            atualizar_intervalo: 5000,
          },
          tema: { cor_destaque: "#FF9800" },
          ativo: true,
        },
        {
          id: "widget_kpi_solvabilidade",
          tipo: "gauge_meter",
          titulo: "Solvabilidade",
          posicao: { x: 3, y: 0, largura: 3, altura: 2 },
          dados: {
            fonte_dados: "kpi_engine",
            kpi_mapeado: "solvabilidade",
            atualizar_intervalo: 5000,
          },
          tema: { cor_destaque: "#F44336" },
          ativo: true,
        },
        {
          id: "widget_fluxo_caixa",
          tipo: "bar_chart",
          titulo: "Fluxo de Caixa",
          posicao: { x: 6, y: 0, largura: 6, altura: 3 },
          dados: {
            fonte_dados: "relatorios_consolidacao",
            atualizar_intervalo: 60000,
          },
          ativo: true,
        },
      ],
    });

    // Template Manager
    this.templates.set("manager", {
      nome: "manager",
      descricao: "Dashboard de desempenho para Managers",
      permisos_minimos: ["manager", "admin"],
      tamanho_grid: { colunas: 12, linhas: 8 },
      widgets_padrao: [
        {
          id: "widget_performance_modulos",
          tipo: "bar_chart",
          titulo: "Desempenho por Módulo",
          posicao: { x: 0, y: 0, largura: 12, altura: 4 },
          dados: {
            fonte_dados: "relatorios_consolidacao",
            atualizar_intervalo: 60000,
          },
          ativo: true,
        },
      ],
    });

    // Template Auditor
    this.templates.set("auditor", {
      nome: "auditor",
      descricao: "Dashboard de auditoria e conformidade",
      permisos_minimos: ["auditor", "admin"],
      tamanho_grid: { colunas: 12, linhas: 10 },
      widgets_padrao: [
        {
          id: "widget_audit_trail",
          tipo: "table",
          titulo: "Trilha de Auditoria",
          posicao: { x: 0, y: 0, largura: 12, altura: 5 },
          dados: {
            fonte_dados: "user_audit_dashboard",
            atualizar_intervalo: 30000,
          },
          ativo: true,
        },
      ],
    });
  }

  private gerarHashDashboard(dashboard: Dashboard): string {
    const dados = {
      nome: dashboard.nome,
      widgets_count: dashboard.widgets.length,
      template: dashboard.template_base,
    };
    return createHash("sha256")
      .update(JSON.stringify(dados))
      .digest("hex")
      .substring(0, 16);
  }
}

// ============================================================================
// INSTÂNCIA SINGLETON
// ============================================================================

export const dashboardManager = new DashboardLayoutManager();
