/**
 * Rotas LGPD - Lei Geral de Proteção de Dados Pessoais
 *
 * Implementa direitos do titular de dados:
 * - Acesso aos próprios dados (GET /api/lgpd/meus-dados)
 * - Exclusão de conta (POST /api/lgpd/deletar-conta)
 * - Auditoria de acessos (GET /api/lgpd/acessos)
 */

import { Router, Request, Response } from 'express';
import type { Database } from 'sql.js';
import {
  listarAcessosUsuario,
  registrarChamadaAPI,
  RegistroAuditoria
} from '../domain/erp/compliance-audit-log';

export interface ConfigLGPD {
  require2FA: boolean;
  anonimizarAoExcluir: boolean;
  retencaoAposExclusao: number; // dias para soft delete antes de hard delete
}

export const CONFIG_LGPD_PADRAO: ConfigLGPD = {
  require2FA: true,
  anonimizarAoExcluir: true,
  retencaoAposExclusao: 30,
};

/**
 * Estrutura de resposta para meus dados
 */
export interface MeusDados {
  usuario: {
    id: number;
    nome: string;
    email: string;
    data_criacao: string;
    ultimo_acesso: string;
  };
  dados_pessoais: Record<string, any>;
  dados_financeiros: Record<string, any>;
  dados_acessos: RegistroAuditoria[];
  data_exportacao: string;
}

/**
 * Estrutura de requisição para 2FA
 */
export interface RequisicaoComSeguranca {
  usuario_id: number;
  codigo_2fa?: string;
  confirmacao?: boolean;
}

/**
 * Estrutura de resposta para exclusão
 */
export interface ResultadoExclusao {
  sucesso: boolean;
  mensagem: string;
  data_exclusao: string;
  periodo_retencao_dias: number;
  data_exclusao_permanente: string;
}

/**
 * Registra tentativa de exclusão na auditoria
 */
function registrarTentativaExclusao(
  db: Database,
  usuarioId: number,
  sucesso: boolean,
  motivo?: string
): void {
  registrarChamadaAPI(db, {
    timestamp: new Date().toISOString(),
    usuario_id: usuarioId,
    usuario_nome: 'SISTEMA',
    ip_origem: '0.0.0.0',
    modulo_chamador: 'lgpd-api',
    tipo_operacao: 'delecao',
    entidade_afetada: 'usuario',
    id_entidade: usuarioId,
    descricao_alteracao: `Tentativa de exclusão de conta (${sucesso ? 'sucesso' : 'falha'})${motivo ? ': ' + motivo : ''}`,
    status: sucesso ? 'sucesso' : 'erro',
    mensagem_erro: sucesso ? undefined : motivo,
    tempo_processamento_ms: 0,
    assinado: false,
  });
}

/**
 * Valida código 2FA (placeholder - implementar com seu provedor)
 */
async function validar2FA(
  usuarioId: number,
  codigo: string
): Promise<boolean> {
  // TODO: Integrar com provedor de 2FA (Twilio, Authy, etc)
  // Por agora, aceitar qualquer código de 6 dígitos para testes
  return /^\d{6}$/.test(codigo);
}

/**
 * Anonimiza dados pessoais de um usuário
 */
function anonimizarUsuario(db: Database, usuarioId: number): void {
  try {
    const dataAgora = new Date().toISOString();

    // Anonimizar campos pessoais
    db.run(
      `UPDATE usuarios SET
        nome = 'Usuário Deletado',
        email = ?,
        cpf = NULL,
        telefone = NULL,
        data_atualizacao = ?
      WHERE id = ?`,
      [
        `anonimizado+${usuarioId}@example.com`,
        dataAgora,
        usuarioId,
      ]
    );

    // Soft delete - marcar como deletado
    db.run(
      `UPDATE usuarios SET
        ativo = 0,
        data_delecao = ?
      WHERE id = ?`,
      [dataAgora, usuarioId]
    );

    console.log(`[LGPD] Usuário ${usuarioId} anonimizado em ${dataAgora}`);
  } catch (erro) {
    console.error(`[LGPD] Erro ao anonimizar usuário ${usuarioId}:`, erro);
    throw erro;
  }
}

/**
 * Coleta todos os dados de um usuário (GDPR Article 20)
 */
function coletarMeusDados(db: Database, usuarioId: number): MeusDados {
  try {
    // Dados do usuário
    const usuarioResult = db.exec(
      `SELECT id, nome, email, created_at, last_access FROM usuarios WHERE id = ?`,
      [usuarioId]
    );

    let usuario: any = {
      id: usuarioId,
      nome: 'Usuário',
      email: 'desconhecido@example.com',
      data_criacao: new Date().toISOString(),
      ultimo_acesso: new Date().toISOString(),
    };

    if (usuarioResult[0]?.values && usuarioResult[0].values.length > 0) {
      const row = usuarioResult[0].values[0];
      usuario = {
        id: row[0],
        nome: row[1],
        email: row[2],
        data_criacao: row[3],
        ultimo_acesso: row[4],
      };
    }

    // Dados pessoais (filtrado de tabelas de negócio)
    const pessoaisResult = db.exec(
      `SELECT * FROM clientes WHERE usuario_id = ? LIMIT 1`,
      [usuarioId]
    );

    const dados_pessoais: Record<string, any> = {};
    if (pessoaisResult[0]?.values && pessoaisResult[0].values.length > 0) {
      const row = pessoaisResult[0].values[0];
      // Não incluir CPF/CNPJ descriptografados - indicar que estão encriptados
      dados_pessoais.cpf = '[ENCRIPTADO]';
      dados_pessoais.telefone = '[ENCRIPTADO]';
      dados_pessoais.endereco = row[5] || 'Não disponível';
    }

    // Dados financeiros (agregado)
    const financeiroResult = db.exec(
      `SELECT COUNT(*) as total_transacoes, SUM(CASE WHEN tipo='credito' THEN valor ELSE 0 END) as creditos,
              SUM(CASE WHEN tipo='debito' THEN valor ELSE 0 END) as debitos
       FROM transacoes WHERE usuario_id = ?`,
      [usuarioId]
    );

    let dados_financeiros: Record<string, any> = {
      total_transacoes: 0,
      creditos_totais: 0,
      debitos_totais: 0,
    };

    if (financeiroResult[0]?.values && financeiroResult[0].values.length > 0) {
      const row = financeiroResult[0].values[0];
      dados_financeiros = {
        total_transacoes: row[0],
        creditos_totais: row[1] || 0,
        debitos_totais: row[2] || 0,
      };
    }

    // Histórico de acessos (últimos 100)
    const dados_acessos = listarAcessosUsuario(db, usuarioId, 100);

    return {
      usuario,
      dados_pessoais,
      dados_financeiros,
      dados_acessos,
      data_exportacao: new Date().toISOString(),
    };
  } catch (erro) {
    console.error('[LGPD] Erro ao coletar meus dados:', erro);
    throw erro;
  }
}

/**
 * Cria rota LGPD
 */
export function criarRotasLGPD(db: Database, config: Partial<ConfigLGPD> = {}): Router {
  const router = Router();
  const configFinal: ConfigLGPD = { ...CONFIG_LGPD_PADRAO, ...config };

  /**
   * GET /api/lgpd/meus-dados
   * Retorna todos os dados pessoais do usuário autenticado
   * Requer autenticação (usuário_id na sessão)
   */
  router.get('/meus-dados', async (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).usuarioId || (req as any).usuario?.id;

      if (!usuarioId) {
        return res.status(401).json({
          erro: 'Não autenticado',
          codigo: 'NAUTH001',
        });
      }

      // Registrar acesso ao endpoint
      console.log(`[LGPD] Usuário ${usuarioId} acessou /meus-dados em ${new Date().toISOString()}`);

      const dados = coletarMeusDados(db, usuarioId);

      // Registrar auditoria
      registrarChamadaAPI(db, {
        timestamp: new Date().toISOString(),
        usuario_id: usuarioId,
        usuario_nome: dados.usuario.nome,
        ip_origem: req.ip || '0.0.0.0',
        modulo_chamador: 'lgpd-api',
        tipo_operacao: 'leitura',
        entidade_afetada: 'dados-pessoais',
        id_entidade: usuarioId,
        descricao_alteracao: `Exportação de dados pessoais (LGPD Art. 20)`,
        status: 'sucesso',
        tempo_processamento_ms: 0,
        assinado: false,
      });

      res.status(200).json({
        sucesso: true,
        dados,
      });
    } catch (erro) {
      console.error('[LGPD] Erro em GET /meus-dados:', erro);
      res.status(500).json({
        erro: 'Erro ao coletar dados',
        codigo: 'ERR_COLETA',
      });
    }
  });

  /**
   * GET /api/lgpd/acessos
   * Lista todos os acessos aos dados do usuário (auditoria de leitura)
   * Últimos 100 registros por padrão
   */
  router.get('/acessos', async (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).usuarioId || (req as any).usuario?.id;

      if (!usuarioId) {
        return res.status(401).json({
          erro: 'Não autenticado',
          codigo: 'NAUTH001',
        });
      }

      const limite = Math.min(parseInt(req.query.limite as string) || 100, 1000);
      const acessos = listarAcessosUsuario(db, usuarioId, limite);

      // Filtrar acessos onde o usuário foi lido
      const acessosFilhados = acessos.filter(
        a => a.tipo_operacao === 'leitura' && a.usuario_id === usuarioId
      );

      res.status(200).json({
        sucesso: true,
        total: acessosFilhados.length,
        acessos: acessosFilhados,
        periodo: {
          inicio: acessosFilhados[acessosFilhados.length - 1]?.timestamp,
          fim: acessosFilhados[0]?.timestamp,
        },
      });
    } catch (erro) {
      console.error('[LGPD] Erro em GET /acessos:', erro);
      res.status(500).json({
        erro: 'Erro ao listar acessos',
        codigo: 'ERR_ACESSOS',
      });
    }
  });

  /**
   * POST /api/lgpd/deletar-conta
   * Solicita exclusão de conta do usuário
   * Requer 2FA confirmation
   * Implementa soft delete + anonimização
   */
  router.post('/deletar-conta', async (req: Request, res: Response) => {
    try {
      const usuarioId = (req as any).usuarioId || (req as any).usuario?.id;

      if (!usuarioId) {
        return res.status(401).json({
          erro: 'Não autenticado',
          codigo: 'NAUTH001',
        });
      }

      const { codigo_2fa, confirmacao } = req.body as RequisicaoComSeguranca;

      // Validar 2FA se configurado
      if (configFinal.require2FA && !codigo_2fa) {
        registrarTentativaExclusao(db, usuarioId, false, 'Código 2FA não fornecido');
        return res.status(403).json({
          erro: 'Código 2FA obrigatório',
          codigo: 'NEED_2FA',
          requer_2fa: true,
        });
      }

      // Validar código 2FA
      if (configFinal.require2FA && codigo_2fa) {
        const valido = await validar2FA(usuarioId, codigo_2fa);
        if (!valido) {
          registrarTentativaExclusao(db, usuarioId, false, 'Código 2FA inválido');
          return res.status(403).json({
            erro: 'Código 2FA inválido',
            codigo: 'INVALID_2FA',
          });
        }
      }

      // Confirmar exclusão
      if (!confirmacao) {
        return res.status(400).json({
          erro: 'Confirmação necessária',
          codigo: 'NEED_CONFIRMATION',
          mensagem: 'Digite "CONFIRMO_EXCLUSAO" para confirmar a exclusão permanent da conta',
        });
      }

      if (confirmacao !== 'CONFIRMO_EXCLUSAO') {
        registrarTentativaExclusao(db, usuarioId, false, 'Confirmação incorreta');
        return res.status(400).json({
          erro: 'Confirmação inválida',
          codigo: 'INVALID_CONFIRMATION',
        });
      }

      // Executar anonimização e soft delete
      const dataExclusao = new Date();
      const dataExclusaoPermanente = new Date(
        dataExclusao.getTime() + configFinal.retencaoAposExclusao * 24 * 60 * 60 * 1000
      );

      if (configFinal.anonimizarAoExcluir) {
        anonimizarUsuario(db, usuarioId);
      }

      // Registrar exclusão na auditoria
      registrarTentativaExclusao(db, usuarioId, true);

      const resultado: ResultadoExclusao = {
        sucesso: true,
        mensagem: 'Conta marcada para exclusão',
        data_exclusao: dataExclusao.toISOString(),
        periodo_retencao_dias: configFinal.retencaoAposExclusao,
        data_exclusao_permanente: dataExclusaoPermanente.toISOString(),
      };

      res.status(200).json(resultado);
    } catch (erro) {
      console.error('[LGPD] Erro em POST /deletar-conta:', erro);
      res.status(500).json({
        erro: 'Erro ao processar exclusão',
        codigo: 'ERR_DELECAO',
      });
    }
  });

  return router;
}
