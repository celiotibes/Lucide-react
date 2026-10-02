/**
 * Rotas HTTP para Sistema de Detecção de Anomalias em Fluxo de Caixa
 *
 * POST   /api/anomalias/analisar/:transacaoId   — Análise manual de uma transação
 * GET    /api/anomalias/alertas                 — Lista alertas (com filtros)
 * GET    /api/anomalias/estatisticas            — Estatísticas e métricas
 * PATCH  /api/anomalias/alertas/:id/revisar     — Marca alerta como revisado
 */

import express from "express";
import Database from "better-sqlite3";
import {
  avaliarAnomaliaAgregada,
  registrarAlertaAnomalia,
  listarAlertas,
  obterAlerta,
  obterEstatisticasAnomalias,
  marcarAnomaliaRevisada,
} from "../domain/anomalias/detectores-anomalias.js";

export interface AnomalasRoutesDeps {
  db: Database.Database;
}

export function criarRotasAnomalias({ db }: AnomalasRoutesDeps): express.Router {
  const router = express.Router();

  /**
   * POST /api/anomalias/analisar/:transacaoId
   *
   * Análise manual de uma transação específica (trigger pode ser manual ou automático)
   * Retorna resultado agregado dos 3 métodos.
   *
   * Query params:
   * - valor: number (obrigatório) — valor da transação
   * - periodo_dias: number (opcional, default=90) — período de histórico para análise
   *
   * Resposta:
   * {
   *   transacao_id: string,
   *   severidade: "baixa" | "media" | "critica",
   *   confianca: 0-100,
   *   metodos_dispararam: string[],
   *   scores_individuais: { sigma_2, iqr, percentil },
   *   alerta_id: string (se persistido),
   *   descricao: string
   * }
   */
  router.post("/analisar/:transacaoId", (req, res) => {
    try {
      const { transacaoId } = req.params;
      const { valor, periodo_dias } = req.query;

      // Validação
      if (!valor || isNaN(Number(valor))) {
        res.status(400).json({ erro: "Parâmetro 'valor' obrigatório e deve ser numérico" });
        return;
      }

      const valorNum = Number(valor);
      const periodo = periodo_dias ? Math.max(1, Math.min(365, Number(periodo_dias))) : 90;

      // Analisa
      const resultado = avaliarAnomaliaAgregada(db, valorNum, periodo);

      // Registra se severidade >= média
      let alerta_id: string | null = null;
      if (resultado.severidade !== "baixa") {
        const alerta = registrarAlertaAnomalia(db, transacaoId, resultado, null);
        alerta_id = alerta.id;
      }

      res.json({
        transacao_id: transacaoId,
        severidade: resultado.severidade,
        confianca: resultado.confianca,
        metodos_dispararam: resultado.metodos_dispararam,
        scores_individuais: resultado.scores_individuais,
        alerta_id,
        descricao: gerarDescricaoResposta(resultado),
      });
    } catch (erro) {
      console.error("Erro ao analisar anomalia:", erro instanceof Error ? erro.message : String(erro));
      res.status(500).json({ erro: "Falha ao analisar anomalia" });
    }
  });

  /**
   * GET /api/anomalias/alertas
   *
   * Lista alertas registrados com filtros opcionais
   *
   * Query params:
   * - severidade: "baixa" | "media" | "critica" (opcional)
   * - dias: number (opcional, default=30) — últimos N dias
   * - revisado: boolean (opcional) — true/false para filtrar por status de revisão
   * - limite: number (opcional, default=100) — máximo de resultados
   *
   * Resposta:
   * {
   *   alertas: AlertaAnomalia[],
   *   total: number,
   *   filtros: { severidade?, dias?, revisado?, limite? }
   * }
   */
  router.get("/alertas", (req, res) => {
    try {
      const { severidade, dias, revisado, limite } = req.query;

      const opcoes: any = {
        limite: Math.min(Math.max(1, Number(limite) || 100), 1000),
      };

      if (severidade && ["baixa", "media", "critica"].includes(String(severidade))) {
        opcoes.severidade = String(severidade);
      }

      if (dias) {
        opcoes.dias = Math.max(1, Math.min(365, Number(dias)));
      }

      if (revisado !== undefined) {
        opcoes.revisado = String(revisado) === "true";
      }

      const alertas = listarAlertas(db, opcoes);

      res.json({
        alertas,
        total: alertas.length,
        filtros: {
          severidade: opcoes.severidade,
          dias: opcoes.dias,
          revisado: opcoes.revisado,
          limite: opcoes.limite,
        },
      });
    } catch (erro) {
      console.error("Erro ao listar alertas:", erro instanceof Error ? erro.message : String(erro));
      res.status(500).json({ erro: "Falha ao listar alertas" });
    }
  });

  /**
   * GET /api/anomalias/estatisticas
   *
   * Retorna estatísticas agregadas de anomalias detectadas
   *
   * Query params:
   * - dias: number (opcional, default=30) — período analisado
   *
   * Resposta:
   * {
   *   total: number,
   *   criticas: number,
   *   medias: number,
   *   baixas: number,
   *   revisadas: number,
   *   taxa_revisao: number (%), // percentual de alertas revisados
   *   periodo_dias: number
   * }
   */
  router.get("/estatisticas", (req, res) => {
    try {
      const { dias } = req.query;
      const periodo = dias ? Math.max(1, Math.min(365, Number(dias))) : 30;

      const stats = obterEstatisticasAnomalias(db, periodo);

      res.json({
        ...stats,
        periodo_dias: periodo,
      });
    } catch (erro) {
      console.error("Erro ao obter estatísticas:", erro instanceof Error ? erro.message : String(erro));
      res.status(500).json({ erro: "Falha ao obter estatísticas" });
    }
  });

  /**
   * PATCH /api/anomalias/alertas/:id/revisar
   *
   * Marca um alerta como revisado (auditoria + feedback humano)
   *
   * Body:
   * {
   *   usuario_id: string,
   *   motivo: string (ex: "falso positivo", "confirmado fraude", "ação tomada")
   * }
   *
   * Resposta:
   * {
   *   alerta_id: string,
   *   revisado: 1,
   *   revisado_em: ISO8601,
   *   motivo: string
   * }
   */
  router.patch("/alertas/:id/revisar", (req, res) => {
    try {
      const { id } = req.params;
      const { usuario_id, motivo } = req.body;

      // Validação
      if (!usuario_id || !motivo) {
        res.status(400).json({ erro: "usuario_id e motivo são obrigatórios" });
        return;
      }

      // Verifica se alerta existe
      const alerta = obterAlerta(db, id);
      if (!alerta) {
        res.status(404).json({ erro: "Alerta não encontrado" });
        return;
      }

      if (alerta.revisado === 1) {
        res.status(400).json({ erro: "Alerta já foi revisado" });
        return;
      }

      // Marca como revisado
      marcarAnomaliaRevisada(db, id, usuario_id, motivo);

      res.json({
        alerta_id: id,
        revisado: 1,
        revisado_em: new Date().toISOString(),
        motivo,
      });
    } catch (erro) {
      console.error("Erro ao revisar anomalia:", erro instanceof Error ? erro.message : String(erro));
      res.status(500).json({ erro: "Falha ao revisar anomalia" });
    }
  });

  return router;
}

// ============================================================
// HELPER: Gera descrição amigável da resposta
// ============================================================

function gerarDescricaoResposta(resultado: any): string {
  const { severidade, confianca, metodos_dispararam } = resultado;

  let desc = "";

  if (severidade === "critica") {
    desc = `CRÍTICA: ${metodos_dispararam.length} métodos concordam de que esta transação é anomalosa (confiança: ${confianca}%)`;
  } else if (severidade === "media") {
    desc = `MÉDIA: ${metodos_dispararam.length} método(s) detectou(aram) anomalia (confiança: ${confianca}%)`;
  } else {
    desc = `BAIXA: Possível anomalia, mas com baixa confiança (${confianca}%)`;
  }

  if (resultado.scores_individuais.sigma_2) {
    desc += ` [2-Sigma: z=${resultado.scores_individuais.sigma_2.z_score.toFixed(2)}]`;
  }
  if (resultado.scores_individuais.iqr) {
    desc += ` [IQR: ${resultado.scores_individuais.iqr.confianca}% acima limite]`;
  }
  if (resultado.scores_individuais.percentil) {
    desc += ` [P${resultado.scores_individuais.percentil.percentil}: ${resultado.scores_individuais.percentil.confianca}%]`;
  }

  return desc;
}
