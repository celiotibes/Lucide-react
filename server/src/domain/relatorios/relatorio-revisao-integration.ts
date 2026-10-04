/**
 * Integração da Política de Revisão com a Geração de Relatórios
 *
 * Este módulo integra as verificações de política de revisão com o workflow de geração
 * de relatórios. Quando um relatório é gerado, verifica se há campos críticos alterados
 * ou thresholds excedidos, e cria automaticamente itens na fila de revisão.
 *
 * Uso:
 * const verificador = criarVerificadorRevisao({ db, filaService });
 *
 * // Após gerar um relatório:
 * await verificador.verificarRelatorio({
 *   documentoId: 'rel-123',
 *   tipoRelatorio: 'relatorios/executivo',
 *   dadosAntigos: relatorioAnterior,
 *   dadosNovos: relatorioGerado,
 *   usuarioId: usuario.id
 * });
 *
 * // Verificar se tem pendências:
 * if (verificador.temPendenciasRevisao('rel-123')) {
 *   // Bloquear publicação até revisão
 * }
 */

import type Database from 'better-sqlite3';
import type { FilaRevisaoService } from './fila-revisao-service.js';
import {
  relatarioNecessitaRevisao,
  campoNecessitaRevisao,
  verificarMudancaThreshold,
  CAMPOS_CRITICOS_REVISAO
} from './politicaRevisaoIA.js';

export interface VerificadorRevisaoData {
  db: Database.Database;
  filaService: FilaRevisaoService;
}

export interface DadosParaVerificar {
  documentoId: string;
  tipoRelatorio: string;
  dadosAntigos?: Record<string, any>;
  dadosNovos: Record<string, any>;
  usuarioId: string;
  descricao?: string;
}

export interface ResultadoVerificacao {
  precisaRevisao: boolean;
  motivos: string[];
  camposAlterados: string[];
  itemsCriados: string[];
}

/**
 * Verificador de revisão que integra com a política
 */
export class VerificadorRevisaoIA {
  private db: Database.Database;
  private filaService: FilaRevisaoService;
  private pendenciasCache: Map<string, boolean> = new Map();

  constructor(data: VerificadorRevisaoData) {
    this.db = data.db;
    this.filaService = data.filaService;
  }

  /**
   * Verifica se um relatório precisa revisão após geração/atualização
   */
  async verificarRelatorio(dados: DadosParaVerificar): Promise<ResultadoVerificacao> {
    const resultado: ResultadoVerificacao = {
      precisaRevisao: false,
      motivos: [],
      camposAlterados: [],
      itemsCriados: []
    };

    // 1. Verificar se o relatório é sensível
    if (relatarioNecessitaRevisao(dados.tipoRelatorio)) {
      resultado.motivos.push('relatorio_sensivel');
      resultado.precisaRevisao = true;
    }

    // 2. Verificar campos críticos alterados
    if (dados.dadosAntigos) {
      const camposAlterados = this.encontrarCamposAlterados(
        dados.dadosAntigos,
        dados.dadosNovos
      );

      resultado.camposAlterados = camposAlterados;

      // Verificar se há campos críticos alterados
      const camposCriticosAlterados = camposAlterados.filter(
        (campo) => (CAMPOS_CRITICOS_REVISAO as readonly string[]).includes(campo)
      );

      if (camposCriticosAlterados.length > 0) {
        resultado.motivos.push('campo_critico');
        resultado.precisaRevisao = true;
      }

      // 3. Verificar thresholds
      for (const campo of camposAlterados) {
        const valorAnterior = dados.dadosAntigos[campo];
        const valorNovo = dados.dadosNovos[campo];

        if (typeof valorAnterior === 'number' && typeof valorNovo === 'number') {
          const verificacao = verificarMudancaThreshold(
            valorAnterior,
            valorNovo,
            campo
          );

          if (verificacao.disparaRevisao) {
            resultado.motivos.push(verificacao.motivo || 'threshold_exceeded');
            resultado.precisaRevisao = true;
          }
        }
      }
    }

    // 4. Criar itens de revisão se necessário
    if (resultado.precisaRevisao) {
      const motivosPrincipal = [...new Set(resultado.motivos)];

      for (const motivo of motivosPrincipal) {
        try {
          const item = this.filaService.criarItemRevisao({
            documentoId: dados.documentoId,
            tipo: 'relatorio',
            motivo,
            solicitanteId: dados.usuarioId,
            status: 'pendente',
            descricao: dados.descricao || `Relatório ${dados.tipoRelatorio} requer revisão`,
            dadosAdicionais: {
              tipoRelatorio: dados.tipoRelatorio,
              camposAlterados: resultado.camposAlterados,
              dataGeracao: new Date().toISOString()
            }
          });

          resultado.itemsCriados.push(item.id);
          this.invalidarCache(dados.documentoId);
        } catch {
          console.error('Erro ao criar item de revisão', erro);
        }
      }
    }

    return resultado;
  }

  /**
   * Verifica se há pendências de revisão para um documento
   */
  temPendenciasRevisao(documentoId: string): boolean {
    // Verificar cache primeiro
    if (this.pendenciasCache.has(documentoId)) {
      return this.pendenciasCache.get(documentoId) === true;
    }

    // Consultar banco de dados
    const temPendencia = this.filaService.temPendencias(documentoId);
    this.pendenciasCache.set(documentoId, temPendencia);

    return temPendencia;
  }

  /**
   * Permite publicar relatório apenas se não há pendências
   */
  validarPublicacao(documentoId: string): {
    permitido: boolean;
    motivo?: string;
  } {
    if (this.temPendenciasRevisao(documentoId)) {
      const itens = this.filaService.obterPorDocumento(documentoId);
      const pendentes = itens.filter((i) => i.status === 'pendente');

      return {
        permitido: false,
        motivo: `Existem ${pendentes.length} item(ns) pendente(s) de revisão. Resolva todas as revisões antes de publicar.`
      };
    }

    return { permitido: true };
  }

  /**
   * Encontra campos que foram alterados entre duas versões
   */
  private encontrarCamposAlterados(
    dadosAntigos: Record<string, any>,
    dadosNovos: Record<string, any>
  ): string[] {
    const campos = new Set<string>();

    // Verificar campos novos e modificados
    for (const chave in dadosNovos) {
      if (JSON.stringify(dadosAntigos[chave]) !== JSON.stringify(dadosNovos[chave])) {
        campos.add(chave);
      }
    }

    // Verificar campos removidos
    for (const chave in dadosAntigos) {
      if (!(chave in dadosNovos)) {
        campos.add(chave);
      }
    }

    return Array.from(campos);
  }

  /**
   * Invalida o cache para um documento
   */
  private invalidarCache(documentoId: string): void {
    this.pendenciasCache.delete(documentoId);
  }

  /**
   * Limpa todo o cache
   */
  limparCache(): void {
    this.pendenciasCache.clear();
  }
}

/**
 * Factory para criar instância do verificador
 */
export function criarVerificadorRevisaoIA(
  data: VerificadorRevisaoData
): VerificadorRevisaoIA {
  return new VerificadorRevisaoIA(data);
}

/**
 * Exemplo de uso em uma rota de geração de relatório:
 *
 * router.post('/gerar', async (req, res) => {
 *   const relatorioAntigo = obterRelatorioAnterior(...);
 *   const relatorioNovo = gerarRelatorio(...);
 *
 *   const verificador = criarVerificadorRevisaoIA({ db, filaService });
 *   const resultado = await verificador.verificarRelatorio({
 *     documentoId: `rel-executivo-${mes}-${ano}`,
 *     tipoRelatorio: 'relatorios/executivo',
 *     dadosAntigos: relatorioAntigo,
 *     dadosNovos: relatorioNovo,
 *     usuarioId: usuarioId,
 *     descricao: `Relatório Executivo ${mes}/${ano}`
 *   });
 *
 *   if (resultado.precisaRevisao) {
 *     return res.json({
 *       sucesso: true,
 *       aviso: 'Relatório criado mas requer revisão',
 *       revisoesNecessarias: resultado.itemsCriados
 *     });
 *   }
 *
 *   return res.json({ sucesso: true, relatorio: relatorioNovo });
 * });
 */
