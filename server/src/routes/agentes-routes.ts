/**
 * Rotas de API para Agentes Econômicos
 *
 * Endpoints:
 * POST /api/agentes - Criar novo agente
 * GET /api/agentes/:id - Obter agente
 * PUT /api/agentes/:id - Atualizar agente
 * GET /api/agentes - Listar agentes
 * POST /api/agentes/:id/validar - Validar agente
 * GET /api/agentes/:id/validacoes - Obter histórico de validações
 * POST /api/agentes/:id/verificar-duplicata - Verificar duplicatas
 */

import { Router, Request, Response } from "express";
import Database from "better-sqlite3";
import { v4 as uuidv4 } from "uuid";
import {
  CriarAgenteEconomicoSchema,
  AtualizarAgenteEconomicoSchema,
  cpfValido,
  cnpjValido,
  cleanCPFCNPJ,
  TipoValidacao,
  ResultadoValidacao,
} from "../domain/erp/agentes-tipos";
import {
  AgenteRegistryService,
} from "../domain/erp/agentes-registry";

export function createAgentesRoutes(db: Database.Database): Router {
  const router = Router();
  const registryService = new AgenteRegistryService(db);

  /**
   * POST /api/agentes
   * Criar novo agente econômico
   * Validações:
   * - CPF/CNPJ deve ser válido
   * - CPF/CNPJ deve ser único
   * - Detecta duplicatas suspeitas
   * - Realiza verificação com órgãos públicos
   */
  router.post("/", async (req: Request, res: Response) => {
    try {
      // Valida schema
      const validacao = CriarAgenteEconomicoSchema.safeParse(req.body);
      if (!validacao.success) {
        return res.status(400).json({
          erro: "Dados inválidos",
          detalhes: validacao.error.errors,
        });
      }

      const dados = validacao.data;
      const usuarioId = (req as unknown).usuario?.id || "sistema";

      // Normaliza CPF/CNPJ
      const cpfCnpj = cleanCPFCNPJ(dados.cpf_cnpj);

      // Valida CPF/CNPJ
      let validacaoCPFCNPJ;
      if (cpfCnpj.length === 11) {
        validacaoCPFCNPJ = cpfValido(cpfCnpj);
      } else if (cpfCnpj.length === 14) {
        validacaoCPFCNPJ = cnpjValido(cpfCnpj);
      } else {
        return res.status(400).json({
          erro: "CPF ou CNPJ inválido",
          detalhes: "Deve conter 11 ou 14 dígitos",
        });
      }

      if (!validacaoCPFCNPJ.valido) {
        return res.status(400).json({
          erro: "CPF/CNPJ inválido",
          detalhes: validacaoCPFCNPJ.erro,
        });
      }

      // Verifica duplicata de CPF/CNPJ
      const duplicatas = registryService.detectarDuplicataTaxID(cpfCnpj);
      if (duplicatas.length > 0) {
        return res.status(409).json({
          erro: "CPF/CNPJ já cadastrado",
          detalhes: `Encontrado agente com mesmo CPF/CNPJ: ${duplicatas[0].agente_id_existente}`,
          duplicatas,
        });
      }

      // Verifica OFAC (se for pessoa jurídica)
      if (cpfCnpj.length === 14) {
        const naoEstaNoOfac = await registryService.verificarOFAC(
          cpfCnpj,
          dados.nome
        );
        if (!naoEstaNoOfac) {
          return res.status(403).json({
            erro: "Agente bloqueado",
            detalhes: "CPF/CNPJ consta em lista de sanções (OFAC)",
          });
        }
      }

      // Cria agente no banco
      const id = uuidv4();
      const agora = new Date().toISOString();

      db.prepare(
        `
        INSERT INTO agentes_economicos (
          id, tipo_entidade, cpf_cnpj, nome, nome_fantasia, pessoa_fisica_pf_nome_mae,
          papel, regime_tributario, inscricao_estadual, inscricao_municipal,
          classificacao_nfse, email, telefone, celular,
          endereco_logradouro, endereco_numero, endereco_complemento,
          endereco_bairro, endereco_cidade, endereco_estado, endereco_cep,
          endereco_pais, ativo, criado_em, criado_por, atualizado_em,
          atualizado_por, observacoes, tags, validado
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
      `
      ).run(
        id,
        dados.tipo_entidade,
        cpfCnpj,
        dados.nome,
        dados.nome_fantasia || null,
        dados.pessoa_fisica_pf_nome_mae || null,
        dados.papel,
        dados.regime_tributario || null,
        dados.inscricao_estadual || null,
        dados.inscricao_municipal || null,
        dados.classificacao_nfse || null,
        dados.email || null,
        dados.telefone || null,
        dados.celular || null,
        dados.endereco?.logradouro || null,
        dados.endereco?.numero || null,
        dados.endereco?.complemento || null,
        dados.endereco?.bairro || null,
        dados.endereco?.cidade || null,
        dados.endereco?.estado || null,
        dados.endereco?.cep || null,
        dados.endereco?.pais || "Brasil",
        1,
        agora,
        usuarioId,
        agora,
        usuarioId,
        dados.observacoes || null,
        dados.tags || null,
        0 // Não validado por padrão
      );

      // Registra validação inicial de CPF/CNPJ
      registryService.registrarValidacao(
        id,
        TipoValidacao.CPF_CNPJ,
        ResultadoValidacao.APROVADO,
        usuarioId,
        "CPF/CNPJ validado no sistema"
      );

      return res.status(201).json({
        id,
        mensagem: "Agente criado com sucesso",
        cpf_cnpj: cpfCnpj,
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("Erro ao criar agente:", mensagem);
      return res.status(500).json({
        erro: "Erro interno do servidor",
        detalhes: mensagem,
      });
    }
  });

  /**
   * POST /api/agentes/:id/validar
   * Validar agente contra órgãos públicos
   * Realiza verificação em Receita Federal e registra resultado
   */
  router.post("/:id/validar", async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const usuarioId = (req as unknown).usuario?.id || "sistema";

      // Obtém agente
      const agente = db
        .prepare("SELECT * FROM agentes_economicos WHERE id = ?")
        .get(id) as unknown;

      if (!agente) {
        return res.status(404).json({
          erro: "Agente não encontrado",
        });
      }

      // Verifica CPF/CNPJ baseado no tipo
      let resultado;
      const cpfCnpj = agente.cpf_cnpj;

      if (agente.tipo_entidade === "pessoa_fisica") {
        resultado = await registryService.verifySoleCPF(cpfCnpj);
      } else {
        resultado = await registryService.verifySoleCNPJ(cpfCnpj);
      }

      // Determina resultado da validação
      const resultadoValidacao = resultado.valido
        ? ResultadoValidacao.APROVADO
        : ResultadoValidacao.REJEITADO;

      // Registra no banco
      registryService.registrarValidacao(
        id,
        TipoValidacao.CPF_CNPJ,
        resultadoValidacao,
        usuarioId,
        resultado.erro,
        resultado.detalhes || resultado
      );

      // Atualiza status do agente se aprovado
      if (resultado.valido) {
        db.prepare(
          `
          UPDATE agentes_economicos
          SET validado = 1, validado_em = ?, validado_por = ?, atualizado_em = ?, atualizado_por = ?
          WHERE id = ?
        `
        ).run(new Date().toISOString(), usuarioId, new Date().toISOString(), usuarioId, id);
      }

      return res.json({
        agente_id: id,
        validado: resultado.valido,
        resultado: resultadoValidacao,
        detalhes: resultado,
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("Erro ao validar agente:", mensagem);
      return res.status(500).json({
        erro: "Erro ao validar agente",
        detalhes: mensagem,
      });
    }
  });

  /**
   * POST /api/agentes/:id/verificar-duplicata
   * Verifica se existem agentes duplicados
   */
  router.post("/:id/verificar-duplicata", (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Obtém agente
      const agente = db
        .prepare("SELECT * FROM agentes_economicos WHERE id = ?")
        .get(id) as unknown;

      if (!agente) {
        return res.status(404).json({
          erro: "Agente não encontrado",
        });
      }

      // Busca duplicatas
      const duplicatas = registryService.detectarDuplicataTaxID(
        agente.cpf_cnpj,
        id
      );

      return res.json({
        agente_id: id,
        cpf_cnpj: agente.cpf_cnpj,
        tem_duplicata: duplicatas.length > 0,
        duplicatas,
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("Erro ao verificar duplicata:", mensagem);
      return res.status(500).json({
        erro: "Erro ao verificar duplicata",
        detalhes: mensagem,
      });
    }
  });

  /**
   * GET /api/agentes/:id/validacoes
   * Obtém histórico de validações de um agente
   */
  router.get("/:id/validacoes", (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Verifica se agente existe
      const agente = db
        .prepare("SELECT id FROM agentes_economicos WHERE id = ?")
        .get(id);

      if (!agente) {
        return res.status(404).json({
          erro: "Agente não encontrado",
        });
      }

      // Obtém validações
      const validacoes = db
        .prepare(
          `
          SELECT id, agente_id, tipo_validacao, resultado, motivo, detalhes,
                 executado_em, executado_por
          FROM agentes_validacoes
          WHERE agente_id = ?
          ORDER BY executado_em DESC
        `
        )
        .all(id) as unknown[];

      const validacoesFormatadas = validacoes.map((v) => ({
        id: v.id,
        agente_id: v.agente_id,
        tipo_validacao: v.tipo_validacao,
        resultado: v.resultado,
        motivo: v.motivo,
        detalhes: v.detalhes ? JSON.parse(v.detalhes) : undefined,
        executado_em: v.executado_em,
        executado_por: v.executado_por,
      }));

      return res.json({
        agente_id: id,
        total: validacoesFormatadas.length,
        validacoes: validacoesFormatadas,
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("Erro ao obter validações:", mensagem);
      return res.status(500).json({
        erro: "Erro ao obter validações",
        detalhes: mensagem,
      });
    }
  });

  /**
   * GET /api/agentes/:id
   * Obtém um agente específico
   */
  router.get("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const agente = db
        .prepare("SELECT * FROM agentes_economicos WHERE id = ?")
        .get(id) as unknown;

      if (!agente) {
        return res.status(404).json({
          erro: "Agente não encontrado",
        });
      }

      // Formata resposta
      const agenteFormatado = {
        ...agente,
        endereco: agente.endereco_logradouro
          ? {
              logradouro: agente.endereco_logradouro,
              numero: agente.endereco_numero,
              complemento: agente.endereco_complemento,
              bairro: agente.endereco_bairro,
              cidade: agente.endereco_cidade,
              estado: agente.endereco_estado,
              cep: agente.endereco_cep,
              pais: agente.endereco_pais,
            }
          : undefined,
      };

      return res.json(agenteFormatado);
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("Erro ao obter agente:", mensagem);
      return res.status(500).json({
        erro: "Erro ao obter agente",
        detalhes: mensagem,
      });
    }
  });

  /**
   * PUT /api/agentes/:id
   * Atualizar agente
   */
  router.put("/:id", (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const usuarioId = (req as unknown).usuario?.id || "sistema";

      // Verifica se agente existe
      const agente = db
        .prepare("SELECT * FROM agentes_economicos WHERE id = ?")
        .get(id) as unknown;

      if (!agente) {
        return res.status(404).json({
          erro: "Agente não encontrado",
        });
      }

      // Valida dados parciais
      const validacao = AtualizarAgenteEconomicoSchema.safeParse(req.body);
      if (!validacao.success) {
        return res.status(400).json({
          erro: "Dados inválidos",
          detalhes: validacao.error.errors,
        });
      }

      const dados = validacao.data;
      const agora = new Date().toISOString();

      // Prepara UPDATE dinâmico
      const campos: string[] = [];
      const valores: unknown[] = [];

      Object.entries(dados).forEach(([chave, valor]) => {
        if (valor !== undefined) {
          campos.push(`${chave} = ?`);
          valores.push(valor);
        }
      });

      // Sempre atualiza timestamp
      campos.push("atualizado_em = ?");
      campos.push("atualizado_por = ?");
      valores.push(agora);
      valores.push(usuarioId);
      valores.push(id);

      if (campos.length > 2) {
        db.prepare(
          `UPDATE agentes_economicos SET ${campos.join(", ")} WHERE id = ?`
        ).run(...valores);
      }

      return res.json({
        id,
        mensagem: "Agente atualizado com sucesso",
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("Erro ao atualizar agente:", mensagem);
      return res.status(500).json({
        erro: "Erro ao atualizar agente",
        detalhes: mensagem,
      });
    }
  });

  /**
   * GET /api/agentes
   * Listar agentes com paginação
   */
  router.get("/", (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 20, 100);
      const offset = parseInt(req.query.offset as string) || 0;
      const tipo = req.query.tipo as string;
      const papel = req.query.papel as string;
      const validado = req.query.validado as string;
      const ativo = req.query.ativo as string;

      // Monta WHERE dinamicamente
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (tipo) {
        conditions.push("tipo_entidade = ?");
        params.push(tipo);
      }

      if (papel) {
        conditions.push("papel LIKE ?");
        params.push(`%${papel}%`);
      }

      if (validado !== undefined) {
        conditions.push("validado = ?");
        params.push(validado === "true" ? 1 : 0);
      }

      if (ativo !== undefined) {
        conditions.push("ativo = ?");
        params.push(ativo === "true" ? 1 : 0);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

      // Total
      const total = db
        .prepare(`SELECT COUNT(*) as count FROM agentes_economicos ${where}`)
        .get(...params) as unknown;

      // Paginação
      const agentes = db
        .prepare(
          `
          SELECT * FROM agentes_economicos
          ${where}
          ORDER BY criado_em DESC
          LIMIT ? OFFSET ?
        `
        )
        .all(...params, limit, offset) as unknown[];

      return res.json({
        total: total.count,
        limit,
        offset,
        agentes,
      });
    } catch (erro) {
      const mensagem = erro instanceof Error ? erro.message : "Erro desconhecido";
      console.error("Erro ao listar agentes:", mensagem);
      return res.status(500).json({
        erro: "Erro ao listar agentes",
        detalhes: mensagem,
      });
    }
  });

  return router;
}
