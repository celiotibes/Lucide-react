/**
 * Rotas HTTP para Assinatura Digital + LGPD Compliance
 *
 * POST /api/relatorios/desafio-2fa
 *   Envia desafio SMS (Ser Pro ID) para assinatura
 *
 * POST /api/relatorios/validar-2fa
 *   Valida código SMS antes de assinar
 *
 * POST /api/relatorios/:id/assinar
 *   Assina relatório digitalmente (após validação 2FA)
 *
 * POST /api/gdpr/anonimizar-pessoa
 *   Anonimiza uma pessoa (direito ao esquecimento)
 *
 * GET /api/gdpr/exportar-dados
 *   Exporta todos os dados de uma pessoa (direito de acesso)
 *
 * GET /api/auditoria/log-lgpd
 *   Obtém log de auditoria LGPD
 */

import express from "express";
import type Database from "better-sqlite3";
import type { AuthServiceDB } from "../domain/auth/auth-service-db.js";
import { criarMiddlewareAutenticacao } from "./auth-routes.js";
import { CertisignAssinador } from "../domain/assinatura/certisign-assinador.js";
import { SerProIdValidacao } from "../domain/assinatura/ser-pro-id-validacao.js";
import { AuditLGPD } from "../domain/auditoria/audit-lgpd.js";
import { DireitoAoEsquecimento } from "../domain/gdpr/direito-ao-esquecimento.js";
import { v4 as uuid } from "uuid";
import fs from "fs";
import path from "path";

export interface AssinaturasLGPDRoutesDeps {
  authService: AuthServiceDB;
  db: Database.Database;
  certisignApiKey?: string;
  serProIdApiKey?: string;
}

export function criarRotasAssinaturasLGPD({
  authService,
  db,
  certisignApiKey = "test-key",
  serProIdApiKey = "test-key",
}: AssinaturasLGPDRoutesDeps): express.Router {
  const router = express.Router();
  const exigirAutenticacao = criarMiddlewareAutenticacao(authService);

  // Inicializa serviços
  const assinador = new CertisignAssinador({
    apiKey: certisignApiKey,
  });
  const validador2fa = new SerProIdValidacao({
    apiKey: serProIdApiKey,
  });
  const auditLGPD = new AuditLGPD({
    db,
  });
  const direitoEsquecimento = new DireitoAoEsquecimento({
    db,
  });

  /**
   * POST /api/relatorios/desafio-2fa
   * Envia desafio SMS para validação 2FA
   *
   * Body: {
   *   usuario_id: string,
   *   usuario_cpf: string,
   *   contexto: string (ex: "assinatura_relatorio_dre_2024_01")
   * }
   */
  router.post("/desafio-2fa", exigirAutenticacao, async (req, res) => {
    try {
      const { usuario_id, usuario_cpf, contexto } = req.body ?? {};

      if (!usuario_id || !usuario_cpf) {
        res.status(400).json({
          sucesso: false,
          mensagem_erro: "usuario_id and usuario_cpf are required",
        });
        return;
      }

      if (!contexto) {
        res.status(400).json({
          sucesso: false,
          mensagem_erro: "contexto is required",
        });
        return;
      }

      // Envia desafio SMS
      const desafio = await validador2fa.enviarDesafioSMS(
        usuario_cpf,
        contexto
      );

      if (!desafio.sucesso) {
        // Registra tentativa de falha na auditoria
        auditLGPD.registrarAcao({
          usuario_id,
          acao: "FALHA_2FA",
          tabela: "assinaturas_digitais",
          ip_address: req.ip,
          user_agent: req.get("user-agent"),
          endpoint: req.originalUrl,
        });

        res.status(400).json(desafio);
        return;
      }

      // Registra sucesso na auditoria
      auditLGPD.registrarAcao({
        usuario_id,
        acao: "DESAFIO_2FA_ENVIADO",
        tabela: "assinaturas_digitais",
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
        endpoint: req.originalUrl,
      });

      res.status(200).json({
        sucesso: true,
        nonce: desafio.nonce,
        telefone_mascarado: desafio.telefone_mascarado,
        tentativas_restantes: desafio.tentativas_restantes,
        expira_em: desafio.expira_em,
      });
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      res.status(500).json({
        sucesso: false,
        mensagem_erro: `Failed to send SMS challenge: ${mensagem}`,
      });
    }
  });

  /**
   * POST /api/relatorios/validar-2fa
   * Valida código SMS
   *
   * Body: {
   *   nonce: string,
   *   codigo_sms: string (6 dígitos)
   * }
   */
  router.post("/validar-2fa", exigirAutenticacao, async (req, res) => {
    try {
      const { nonce, codigo_sms } = req.body ?? {};

      if (!nonce || !codigo_sms) {
        res.status(400).json({
          sucesso: false,
          mensagem_erro: "nonce and codigo_sms are required",
        });
        return;
      }

      // Valida código SMS
      const resultado = await validador2fa.validarRespostaSMS(
        nonce,
        codigo_sms
      );

      if (!resultado.sucesso) {
        res.status(400).json(resultado);
        return;
      }

      res.status(200).json(resultado);
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      res.status(500).json({
        sucesso: false,
        mensagem_erro: `Failed to validate SMS: ${mensagem}`,
      });
    }
  });

  /**
   * POST /api/relatorios/:id/assinar
   * Assina um relatório digitalmente
   *
   * Body: {
   *   nonce_2fa: string (após validação SMS),
   *   usuario_id: string,
   *   usuario_nome: string,
   *   usuario_cpf: string,
   *   relatorio_tipo: "DRE" | "FLUXO" | "MARGENS",
   *   relatorio_periodo: "YYYY-MM",
   *   pdf_url: string
   * }
   */
  router.post("/:id/assinar", exigirAutenticacao, async (req, res) => {
    const transaction = db.transaction(() => {
      try {
        const { id } = req.params;
        const {
          nonce_2fa,
          usuario_id,
          usuario_nome,
          usuario_cpf,
          relatorio_tipo,
          relatorio_periodo,
          pdf_url,
        } = req.body ?? {};

        // Validações
        if (!nonce_2fa || !usuario_id || !relatorio_tipo || !pdf_url) {
          res.status(400).json({
            sucesso: false,
            mensagem_erro: "Missing required fields",
          });
          return;
        }

        // Verifica validação 2FA
        const status2fa = validador2fa.obterStatusDesafio(nonce_2fa);
        if (!status2fa || !status2fa.validado) {
          res.status(403).json({
            sucesso: false,
            mensagem_erro: "2FA challenge not validated",
          });
          return;
        }

        // Lê PDF a ser assinado
        let pdfBuffer: Buffer;
        if (pdf_url.startsWith("http")) {
          // Em produção, fazer fetch
          res.status(400).json({
            sucesso: false,
            mensagem_erro: "Remote PDF URLs not supported in this version",
          });
          return;
        } else {
          // Arquivo local
          const pdfPath = path.join(process.cwd(), pdf_url);
          if (!fs.existsSync(pdfPath)) {
            res.status(404).json({
              sucesso: false,
              mensagem_erro: "PDF file not found",
            });
            return;
          }
          pdfBuffer = fs.readFileSync(pdfPath);
        }

        // Assina com Certisign
        const resultadoAssinatura = assinador.assinarPDF(
          pdfBuffer,
          "test-serial", // Em produção, usar certificado real
          ""
        );

        // Aguarda resultado
        Promise.resolve(resultadoAssinatura).then((resultado) => {
          if (!resultado.sucesso || !resultado.pdf_assinado) {
            auditLGPD.registrarAcao({
              usuario_id,
              acao: "ASSINATURA_FALHA",
              tabela: "assinaturas_digitais",
              registro_id: id,
              ip_address: req.ip,
              user_agent: req.get("user-agent"),
              endpoint: req.originalUrl,
              contem_dados_sensveis: true,
              tipo_dado_sensvel: "CPF",
            });

            res.status(400).json({
              sucesso: false,
              mensagem_erro:
                resultado.mensagem_erro || "Failed to sign PDF",
            });
            return;
          }

          // Salva PDF assinado
          const assinatura_id = uuid();
          const dataDir = path.join(process.cwd(), "data", "assinaturas");
          if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
          }

          const pdfAssinadoPath = path.join(
            dataDir,
            `${assinatura_id}.pdf`
          );
          fs.writeFileSync(pdfAssinadoPath, resultado.pdf_assinado);

          // Registra na DB
          const stmt = db.prepare(`
            INSERT INTO assinaturas_digitais (
              id,
              usuario_id,
              certificado_id,
              relatorio_id,
              relatorio_tipo,
              relatorio_periodo,
              hash_documento,
              assinatura_base64,
              timestamp_assinatura,
              validado_2fa,
              timestamp_validacao_2fa,
              nonce_2fa,
              status,
              pdf_assinado_url,
              criado_em,
              atualizado_em
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `);

          stmt.run(
            assinatura_id,
            usuario_id,
            "test-cert-id", // Em produção, usar certificado real
            id,
            relatorio_tipo,
            relatorio_periodo,
            resultado.hash_assinatura || "",
            resultado.pdf_assinado
              .toString("base64")
              .substring(0, 1000),
            resultado.timestamp,
            1, // validado_2fa = true
            new Date().toISOString(),
            nonce_2fa,
            "VALIDADO",
            `/data/assinaturas/${assinatura_id}.pdf`,
            new Date().toISOString(),
            new Date().toISOString()
          );

          // Registra sucesso na auditoria
          auditLGPD.registrarAcao({
            usuario_id,
            acao: "ASSINATURA_DIGITAL",
            tabela: "assinaturas_digitais",
            registro_id: assinatura_id,
            dados_novos: {
              assinatura_id,
              relatorio_tipo,
              relatorio_periodo,
              usuario_nome,
              timestamp: resultado.timestamp,
            },
            ip_address: req.ip,
            user_agent: req.get("user-agent"),
            endpoint: req.originalUrl,
            contem_dados_sensveis: true,
            tipo_dado_sensvel: "CPF",
          });

          // Limpa desafio 2FA
          validador2fa.limparDesafio(nonce_2fa);

          res.status(200).json({
            sucesso: true,
            assinatura_id,
            timestamp_assinatura: resultado.timestamp,
            certificado_id: "test-cert-id",
            pdf_assinado_url: `/data/assinaturas/${assinatura_id}.pdf`,
          });
        });
      } catch (erro) {
        const mensagem =
          erro instanceof Error ? erro.message : "Unknown error";
        res.status(500).json({
          sucesso: false,
          mensagem_erro: `Failed to sign document: ${mensagem}`,
        });
      }
    });

    try {
      transaction();
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      res.status(500).json({
        sucesso: false,
        mensagem_erro: `Transaction failed: ${mensagem}`,
      });
    }
  });

  /**
   * POST /api/gdpr/anonimizar-pessoa
   * Anonimiza uma pessoa (direito ao esquecimento)
   *
   * Body: {
   *   pessoa_tipo: "INQUILINO" | "PRESTADOR" | "FORNECEDOR",
   *   pessoa_id: string,
   *   motivo?: string
   * }
   */
  router.post("/anonimizar-pessoa", exigirAutenticacao, async (req, res) => {
    try {
      const { pessoa_tipo, pessoa_id } = req.body ?? {};
      const usuario_id = (req as unknown).usuario?.id;

      if (!pessoa_tipo || !pessoa_id) {
        res.status(400).json({
          sucesso: false,
          mensagem_erro: "pessoa_tipo and pessoa_id are required",
        });
        return;
      }

      // Anonimiza
      const resultado = await direitoEsquecimento.anonimizarPessoa(
        pessoa_tipo,
        pessoa_id,
        usuario_id
      );

      if (!resultado.sucesso) {
        res.status(400).json(resultado);
        return;
      }

      // Registra na auditoria
      auditLGPD.registrarAcao({
        usuario_id,
        acao: "ANONIMIZACAO",
        tabela: "pessoas_anonimizadas",
        registro_id: pessoa_id,
        dados_novos: {
          pessoa_tipo,
          campos_anonimizados: resultado.campos_anonimizados,
        },
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
        endpoint: req.originalUrl,
        contem_dados_sensveis: true,
        tipo_dado_sensvel: "CPF,EMAIL,TELEFONE",
      });

      res.status(200).json(resultado);
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      res.status(500).json({
        sucesso: false,
        mensagem_erro: `Failed to anonymize person: ${mensagem}`,
      });
    }
  });

  /**
   * GET /api/gdpr/exportar-dados
   * Exporta todos os dados de uma pessoa
   *
   * Query: ?pessoa_tipo=INQUILINO&pessoa_id=123
   */
  router.get("/exportar-dados", exigirAutenticacao, async (req, res) => {
    try {
      const { pessoa_tipo, pessoa_id } = req.query;
      const usuario_id = (req as unknown).usuario?.id;

      if (!pessoa_tipo || !pessoa_id) {
        res.status(400).json({
          sucesso: false,
          mensagem_erro: "pessoa_tipo and pessoa_id are required",
        });
        return;
      }

      // Exporta dados
      const dados = await direitoEsquecimento.exportarDadosPessoa(
        String(pessoa_tipo),
        String(pessoa_id)
      );

      if (!dados) {
        res.status(404).json({
          sucesso: false,
          mensagem_erro: "Person not found",
        });
        return;
      }

      // Registra na auditoria
      auditLGPD.registrarAcao({
        usuario_id,
        acao: "EXPORTACAO_DADOS",
        tabela: "pessoas_anonimizadas",
        registro_id: String(pessoa_id),
        ip_address: req.ip,
        user_agent: req.get("user-agent"),
        endpoint: req.originalUrl,
        contem_dados_sensveis: true,
      });

      res.status(200).json({
        sucesso: true,
        dados,
      });
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      res.status(500).json({
        sucesso: false,
        mensagem_erro: `Failed to export data: ${mensagem}`,
      });
    }
  });

  /**
   * GET /api/auditoria/log-lgpd
   * Obtém log de auditoria LGPD
   *
   * Query: ?usuario_id=123&dias=30&limite=100
   */
  router.get("/log-lgpd", exigirAutenticacao, async (req, res) => {
    try {
      const { usuario_id, dias = "30", limite = "100" } = req.query;
      const diasNum = parseInt(String(dias), 10);
      const limiteNum = parseInt(String(limite), 10);

      if (!usuario_id) {
        res.status(400).json({
          sucesso: false,
          mensagem_erro: "usuario_id is required",
        });
        return;
      }

      // Obtém histórico
      const registros = auditLGPD.obterAcessosUsuario(
        String(usuario_id),
        diasNum,
        limiteNum
      );

      res.status(200).json({
        sucesso: true,
        total: registros.length,
        registros,
      });
    } catch (erro) {
      const mensagem =
        erro instanceof Error ? erro.message : "Unknown error";
      res.status(500).json({
        sucesso: false,
        mensagem_erro: `Failed to fetch audit log: ${mensagem}`,
      });
    }
  });

  return router;
}
