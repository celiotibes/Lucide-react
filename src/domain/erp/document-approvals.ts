/**
 * DOCUMENT APPROVAL WORKFLOWS
 *
 * Gerencia workflows de aprovação de documentos com:
 * - Estados: draft → submitted → review → approved/rejected
 * - Múltiplos níveis de aprovação (gerente, diretor, financeiro)
 * - Notificações simuladas para cada nível
 * - Rastreamento de rejeições com feedback
 */

export type ApprovalStatus = 'draft' | 'submitted' | 'under_review' | 'approved' | 'rejected';
export type ApprovalLevel = 'manager' | 'director' | 'financial';
export type DocumentType = 'contrato' | 'despesa' | 'reembolso' | 'contato_fornecedor';

export interface DocumentApprovalRequest {
  id: string;
  documento_id: number;
  tipo_documento: DocumentType;
  entidade_id: number;
  valor: number;
  descricao: string;
  solicitante_id: number;
  data_criacao: string;
  status: ApprovalStatus;
}

export interface ApprovalStep {
  id: string;
  request_id: string;
  nivel: ApprovalLevel;
  responsavel_id: number;
  data_atribuida: string;
  data_revisao?: string;
  status: 'pendente' | 'aprovado' | 'rejeitado';
  comentario?: string;
  motivo_rejeicao?: string;
}

export interface ApprovalNotification {
  id: string;
  request_id: string;
  responsavel_id: number;
  tipo: 'atribuicao' | 'rejeicao' | 'aprovacao';
  mensagem: string;
  data_envio: string;
  lido: boolean;
}

export function criarRequisicaoAprovacao(
  db: any,
  documento: {
    documento_id: number;
    tipo_documento: DocumentType;
    entidade_id: number;
    valor: number;
    descricao: string;
    solicitante_id: number;
  }
): { sucesso: boolean; request_id?: string; errors?: string[] } {
  // Validar documento
  const validacao = validarRequisicaoAprovacao(documento);
  if (!validacao.valida) {
    return { sucesso: false, errors: validacao.erros };
  }

  try {
    const request_id = `APR_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const data_criacao = new Date().toISOString();

    db.run(
      `CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        documento_id INTEGER NOT NULL,
        tipo_documento TEXT NOT NULL,
        entidade_id INTEGER NOT NULL,
        valor REAL NOT NULL,
        descricao TEXT NOT NULL,
        solicitante_id INTEGER NOT NULL,
        data_criacao TEXT NOT NULL,
        status TEXT DEFAULT 'draft'
      )`
    );

    db.run(
      `INSERT INTO approval_requests (id, documento_id, tipo_documento, entidade_id, valor, descricao, solicitante_id, data_criacao, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        request_id,
        documento.documento_id,
        documento.tipo_documento,
        documento.entidade_id,
        documento.valor,
        documento.descricao,
        documento.solicitante_id,
        data_criacao,
        'draft',
      ]
    );

    return { sucesso: true, request_id };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao criar requisição: ${String(erro)}`] };
  }
}

function validarRequisicaoAprovacao(documento: any): { valida: boolean; erros: string[] } {
  const erros: string[] = [];
  if (!documento.documento_id) erros.push('documento_id obrigatório');
  if (!documento.tipo_documento) erros.push('tipo_documento obrigatório');
  if (!documento.entidade_id) erros.push('entidade_id obrigatório');
  if (documento.valor <= 0) erros.push('valor deve ser positivo');
  if (!documento.descricao) erros.push('descricao obrigatória');
  if (!documento.solicitante_id) erros.push('solicitante_id obrigatório');
  return { valida: erros.length === 0, erros };
}

export function submeterAprovacao(
  db: any,
  request_id: string
): { sucesso: boolean; errors?: string[] } {
  try {
    // Verificar se existe
    const resultado = db.exec(
      `SELECT id FROM approval_requests WHERE id = ?`,
      [request_id]
    );

    if (!resultado[0]?.values?.length) {
      return { sucesso: false, errors: ['Requisição não encontrada'] };
    }

    // Atualizar status
    db.run(
      `UPDATE approval_requests SET status = ? WHERE id = ?`,
      ['submitted', request_id]
    );

    // Criar etapas de aprovação
    const niveis: ApprovalLevel[] = ['manager', 'director', 'financial'];
    for (const nivel of niveis) {
      const step_id = `STEP_${request_id}_${nivel}`;
      db.run(
        `CREATE TABLE IF NOT EXISTS approval_steps (
          id TEXT PRIMARY KEY,
          request_id TEXT NOT NULL,
          nivel TEXT NOT NULL,
          responsavel_id INTEGER,
          data_atribuida TEXT NOT NULL,
          data_revisao TEXT,
          status TEXT DEFAULT 'pendente',
          comentario TEXT,
          motivo_rejeicao TEXT,
          FOREIGN KEY (request_id) REFERENCES approval_requests(id)
        )`
      );

      db.run(
        `INSERT INTO approval_steps (id, request_id, nivel, data_atribuida, status)
         VALUES (?, ?, ?, ?, ?)`,
        [step_id, request_id, nivel, new Date().toISOString(), 'pendente']
      );
    }

    // Registrar notificação para o primeiro nível
    notificarAprovadores(db, request_id, 'manager', 'Novo documento aguardando revisão');

    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao submeter: ${String(erro)}`] };
  }
}

export function aprovarNivel(
  db: any,
  request_id: string,
  nivel: ApprovalLevel,
  responsavel_id: number,
  comentario?: string
): { sucesso: boolean; proximoNivel?: ApprovalLevel; errors?: string[] } {
  try {
    db.run(
      `UPDATE approval_steps SET status = ?, responsavel_id = ?, data_revisao = ?, comentario = ?
       WHERE request_id = ? AND nivel = ?`,
      ['aprovado', responsavel_id, new Date().toISOString(), comentario || '', request_id, nivel]
    );

    // Determinar próximo nível
    const niveis: ApprovalLevel[] = ['manager', 'director', 'financial'];
    const indiceAtual = niveis.indexOf(nivel);

    if (indiceAtual < niveis.length - 1) {
      const proximoNivel = niveis[indiceAtual + 1];
      notificarAprovadores(db, request_id, proximoNivel, `Aprovação de ${nivel} concluída`);
      return { sucesso: true, proximoNivel };
    } else {
      // Todas as etapas aprovadas
      db.run(
        `UPDATE approval_requests SET status = ? WHERE id = ?`,
        ['approved', request_id]
      );
      notificarSolicitante(db, request_id, 'aprovacao', 'Seu documento foi aprovado com sucesso!');
      return { sucesso: true };
    }
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao aprovar: ${String(erro)}`] };
  }
}

export function rejeitarNivel(
  db: any,
  request_id: string,
  nivel: ApprovalLevel,
  responsavel_id: number,
  motivo_rejeicao: string
): { sucesso: boolean; errors?: string[] } {
  try {
    db.run(
      `UPDATE approval_steps SET status = ?, responsavel_id = ?, data_revisao = ?, motivo_rejeicao = ?
       WHERE request_id = ? AND nivel = ?`,
      ['rejeitado', responsavel_id, new Date().toISOString(), motivo_rejeicao, request_id, nivel]
    );

    // Atualizar status geral
    db.run(
      `UPDATE approval_requests SET status = ? WHERE id = ?`,
      ['rejected', request_id]
    );

    // Notificar solicitante com motivo
    notificarSolicitante(
      db,
      request_id,
      'rejeicao',
      `Seu documento foi rejeitado por ${nivel}: ${motivo_rejeicao}`
    );

    return { sucesso: true };
  } catch (erro) {
    return { sucesso: false, errors: [`Erro ao rejeitar: ${String(erro)}`] };
  }
}

export function obterStatusAprovacao(
  db: any,
  request_id: string
): DocumentApprovalRequest | null {
  try {
    const resultado = db.exec(
      `SELECT * FROM approval_requests WHERE id = ?`,
      [request_id]
    );

    if (!resultado[0]?.values?.length) {
      return null;
    }

    const [id, doc_id, tipo, entidade, valor, desc, solicitante, criacao, status] = resultado[0].values[0];
    return {
      id,
      documento_id: doc_id,
      tipo_documento: tipo as DocumentType,
      entidade_id: entidade,
      valor,
      descricao: desc,
      solicitante_id: solicitante,
      data_criacao: criacao,
      status: status as ApprovalStatus,
    };
  } catch {
    return null;
  }
}

export function obterEtapasAprovacao(
  db: any,
  request_id: string
): ApprovalStep[] {
  try {
    const resultado = db.exec(
      `SELECT id, request_id, nivel, responsavel_id, data_atribuida, data_revisao, status, comentario, motivo_rejeicao
       FROM approval_steps WHERE request_id = ?`,
      [request_id]
    );

    if (!resultado[0]?.values) {
      return [];
    }

    return resultado[0].values.map(
      ([id, req_id, nivel, resp_id, data_atrib, data_rev, status, comentario, motivo]) => ({
        id,
        request_id: req_id,
        nivel: nivel as ApprovalLevel,
        responsavel_id: resp_id,
        data_atribuida: data_atrib,
        data_revisao: data_rev,
        status: status as 'pendente' | 'aprovado' | 'rejeitado',
        comentario,
        motivo_rejeicao: motivo,
      })
    );
  } catch {
    return [];
  }
}

function notificarAprovadores(
  db: any,
  request_id: string,
  nivel: ApprovalLevel,
  mensagem: string
): void {
  try {
    db.run(
      `CREATE TABLE IF NOT EXISTS approval_notifications (
        id TEXT PRIMARY KEY,
        request_id TEXT NOT NULL,
        responsavel_id INTEGER,
        tipo TEXT NOT NULL,
        mensagem TEXT NOT NULL,
        data_envio TEXT NOT NULL,
        lido INTEGER DEFAULT 0,
        FOREIGN KEY (request_id) REFERENCES approval_requests(id)
      )`
    );

    const notification_id = `NOTIF_${request_id}_${nivel}_${Date.now()}`;
    db.run(
      `INSERT INTO approval_notifications (id, request_id, tipo, mensagem, data_envio, lido)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [notification_id, request_id, 'atribuicao', `${nivel}: ${mensagem}`, new Date().toISOString(), 0]
    );
  } catch {
    // Silencioso - notificação é não-crítica
  }
}

function notificarSolicitante(
  db: any,
  request_id: string,
  tipo: 'aprovacao' | 'rejeicao',
  mensagem: string
): void {
  try {
    const notification_id = `NOTIF_${request_id}_${tipo}_${Date.now()}`;
    db.run(
      `INSERT INTO approval_notifications (id, request_id, tipo, mensagem, data_envio, lido)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [notification_id, request_id, tipo, mensagem, new Date().toISOString(), 0]
    );
  } catch {
    // Silencioso - notificação é não-crítica
  }
}

export function obterNotificacoes(
  db: any,
  responsavel_id?: number
): ApprovalNotification[] {
  try {
    let query = `SELECT id, request_id, responsavel_id, tipo, mensagem, data_envio, lido FROM approval_notifications`;
    const params: any[] = [];

    if (responsavel_id) {
      query += ` WHERE responsavel_id = ?`;
      params.push(responsavel_id);
    }

    query += ` ORDER BY data_envio DESC LIMIT 50`;

    const resultado = db.exec(query, params);

    if (!resultado[0]?.values) {
      return [];
    }

    return resultado[0].values.map(
      ([id, req_id, resp_id, tipo, msg, data, lido]) => ({
        id,
        request_id: req_id,
        responsavel_id: resp_id,
        tipo: tipo as 'atribuicao' | 'rejeicao' | 'aprovacao',
        mensagem: msg,
        data_envio: data,
        lido: Boolean(lido),
      })
    );
  } catch {
    return [];
  }
}

export function obterRequisicoesAguardandoAprovacao(
  db: any,
  responsavel_id: number,
  nivel: ApprovalLevel
): DocumentApprovalRequest[] {
  try {
    const resultado = db.exec(
      `SELECT DISTINCT ar.id, ar.documento_id, ar.tipo_documento, ar.entidade_id, ar.valor, ar.descricao, ar.solicitante_id, ar.data_criacao, ar.status
       FROM approval_requests ar
       JOIN approval_steps ast ON ar.id = ast.request_id
       WHERE ast.nivel = ? AND ast.status = 'pendente'`,
      [nivel]
    );

    if (!resultado[0]?.values) {
      return [];
    }

    return resultado[0].values.map(
      ([id, doc_id, tipo, entidade, valor, desc, solicitante, criacao, status]) => ({
        id,
        documento_id: doc_id,
        tipo_documento: tipo as DocumentType,
        entidade_id: entidade,
        valor,
        descricao: desc,
        solicitante_id: solicitante,
        data_criacao: criacao,
        status: status as ApprovalStatus,
      })
    );
  } catch {
    return [];
  }
}
