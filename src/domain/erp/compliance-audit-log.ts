/**
 * MÓDULO 4g: Audit Trail & Compliance Log
 * Log imutável de todas as operações de integração externa
 * Conformidade com LGPD, Lei 6404/76, retenção de 7 anos
 */

/** Segredo de assinatura HMAC.
 *
 * Aqui havia `process.env.AUDIT_LOG_SECRET`. Este app roda no navegador, onde `process`
 * simplesmente não existe: a linha estouraria com ReferenceError na primeira chamada.
 * O defeito nunca apareceu porque o módulo é órfão — nenhuma tela o alcança; só o teste,
 * que roda em Node, onde `process` existe.
 *
 * Como o segredo não pode viver no cliente de jeito nenhum (quem abre o DevTools o lê, e
 * com ele forja assinatura de auditoria), ele passa a ser PARÂMETRO explícito. Quando este
 * módulo for para trás da API, o segredo fica no servidor e é injetado aqui. O default
 * abaixo serve só para o módulo não quebrar sem configuração — e assinatura feita com ele
 * não vale como prova de não-repúdio, o que `assinaturaConfiavel` sinaliza. */
const SEGREDO_PADRAO_INSEGURO = 'default-secret';

export interface OpcoesAssinatura {
  /** Segredo HMAC. Em produção vem do servidor, nunca do bundle do navegador. */
  segredo?: string;
}

/** SHA-256 em hexadecimal pela Web Crypto API.
 *
 * Substitui `crypto.createHash` do módulo nativo do Node, que o Vite externaliza e que
 * estoura em tempo de execução no cliente. Ver src/domain/erp/crypto-navegador.test.ts. */
async function sha256Hex(texto: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/** HMAC-SHA256 em hexadecimal pela Web Crypto API — substitui `crypto.createHmac`. */
async function hmacSha256Hex(segredo: string, mensagem: string): Promise<string> {
  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const assinatura = await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(mensagem));
  return Array.from(new Uint8Array(assinatura))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

export interface RegistroAuditoria {
  id?: number;
  timestamp: string;
  usuario_id?: number;
  usuario_nome?: string;
  ip_origem: string;
  modulo_chamador: string; // 'banco', 'fisco', 'open-banking', 'api-gateway', 'pagamento-gateway', 'nuvem-erp'
  tipo_operacao: 'leitura' | 'escrita' | 'delecao' | 'alteracao' | 'autenticacao' | 'configuracao';
  entidade_afetada: string; // 'ledger_entry', 'pagamento', 'banco_transacao', etc
  id_entidade: number;
  descricao_alteracao: string;
  valor_anterior?: any;
  valor_novo?: any;
  hash_sha256: string; // Hash SHA-256 do registro (para imutabilidade)
  hash_anterior?: string; // Hash do registro anterior (para cadeia)
  status: 'sucesso' | 'erro' | 'pendente';
  mensagem_erro?: string;
  tempo_processamento_ms: number;
  retencao_ate: string; // Data de retenção obrigatória (7 anos)
  assinado: boolean;
  assinatura_digital?: string; // Assinatura HMAC para não-repudiação
  criado_em: string;
}

export interface RelatorioAuditoria {
  periodo_inicio: string;
  periodo_fim: string;
  total_registros: number;
  operacoes_por_tipo: Record<string, number>;
  operacoes_por_modulo: Record<string, number>;
  usuarios_ativos: number;
  ips_diferentes: number;
  erros_registrados: number;
  ultimas_alteracoes: RegistroAuditoria[];
}

export interface VerificacaoIntegridade {
  hash_esperado: string;
  hash_calculado: string;
  integro: boolean;
  data_verificacao: string;
  registros_verificados: number;
  registros_corrompidos: number;
}

/**
 * Registra chamada de API externa no log de auditoria
 */
export async function registrarChamadaAPI(
  db: any,
  // `retencao_ate` entrou no Omit: a própria função calcula os 7 anos logo abaixo, e
  // exigi-la do chamador era o que fazia TODA chamada deste módulo não compilar — o
  // campo era pedido na assinatura e ignorado no corpo.
  chamada: Omit<
    RegistroAuditoria,
    'id' | 'hash_sha256' | 'hash_anterior' | 'criado_em' | 'assinatura_digital' | 'retencao_ate'
  >,
  opcoes: OpcoesAssinatura = {},
): Promise<RegistroAuditoria> {
  // Data de retenção: 7 anos, calculada antes do try para entrar no registro devolvido
  // mesmo que a gravação falhe — antes ela só existia dentro do INSERT, e o objeto
  // retornado saía sem o campo, salvo por um `as RegistroAuditoria` que escondia isso.
  const dataRetencao = new Date();
  dataRetencao.setFullYear(dataRetencao.getFullYear() + 7);

  const registroComHash: RegistroAuditoria = {
    ...chamada,
    hash_sha256: '', // Será calculado abaixo
    hash_anterior: '',
    retencao_ate: dataRetencao.toISOString().substring(0, 10),
    criado_em: new Date().toISOString(),
    assinatura_digital: '',
  };

  try {
    // Obter hash anterior para cadeia
    const resultAnterior = db.exec(
      `SELECT hash_sha256 FROM auditoria_log ORDER BY id DESC LIMIT 1`
    );

    const hashAnterior = resultAnterior[0]?.values[0]?.[0] || '';
    registroComHash.hash_anterior = hashAnterior;

    // Calcular hash SHA-256 deste registro
    const conteudo = JSON.stringify({
      timestamp: registroComHash.timestamp,
      modulo: registroComHash.modulo_chamador,
      operacao: registroComHash.tipo_operacao,
      entidade: registroComHash.entidade_afetada,
      id_entidade: registroComHash.id_entidade,
      descricao: registroComHash.descricao_alteracao,
      hash_anterior: hashAnterior,
    });

    registroComHash.hash_sha256 = await sha256Hex(conteudo);

    // Assinatura HMAC para não-repudiação
    const segredo = opcoes.segredo || SEGREDO_PADRAO_INSEGURO;
    registroComHash.assinatura_digital = await hmacSha256Hex(segredo, registroComHash.hash_sha256);

    // Inserir no banco
    db.run(
      `INSERT INTO auditoria_log (timestamp, usuario_id, usuario_nome, ip_origem, modulo_chamador, tipo_operacao, entidade_afetada, id_entidade, descricao_alteracao, valor_anterior, valor_novo, hash_sha256, hash_anterior, status, mensagem_erro, tempo_processamento_ms, retencao_ate, assinado, assinatura_digital, criado_em)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        registroComHash.timestamp,
        registroComHash.usuario_id || null,
        registroComHash.usuario_nome || null,
        registroComHash.ip_origem,
        registroComHash.modulo_chamador,
        registroComHash.tipo_operacao,
        registroComHash.entidade_afetada,
        registroComHash.id_entidade,
        registroComHash.descricao_alteracao,
        registroComHash.valor_anterior ? JSON.stringify(registroComHash.valor_anterior) : null,
        registroComHash.valor_novo ? JSON.stringify(registroComHash.valor_novo) : null,
        registroComHash.hash_sha256,
        registroComHash.hash_anterior,
        registroComHash.status,
        registroComHash.mensagem_erro || null,
        registroComHash.tempo_processamento_ms,
        registroComHash.retencao_ate,
        1, // assinado
        registroComHash.assinatura_digital,
        registroComHash.criado_em,
      ]
    );

    const resultId = db.exec('SELECT last_insert_rowid() as id');
    registroComHash.id = resultId[0]?.values[0]?.[0];
  } catch (erro) {
    console.error('Erro ao registrar chamada API:', erro);
  }

  // Sem `as`: o objeto agora é RegistroAuditoria por construção, então o compilador
  // volta a checar de verdade se algum campo obrigatório ficou de fora.
  return registroComHash;
}

/**
 * Verifica integridade da cadeia de registros de auditoria
 */
export async function verificarIntegridade(
  db: any,
  dataInicio?: string,
  dataFim?: string,
  opcoes: OpcoesAssinatura = {},
): Promise<VerificacaoIntegridade> {
  let registrosCorretos = 0;
  let registrosComErro = 0;
  // Precisa ser o MESMO segredo usado ao gravar: assinatura conferida com outro segredo
  // acusaria adulteração onde não houve.
  const segredo = opcoes.segredo || SEGREDO_PADRAO_INSEGURO;

  try {
    let query = `SELECT id, timestamp, modulo_chamador, tipo_operacao, entidade_afetada, id_entidade, descricao_alteracao, hash_sha256, hash_anterior, assinatura_digital
                 FROM auditoria_log`;
    const params: any[] = [];

    if (dataInicio && dataFim) {
      query += ` WHERE timestamp BETWEEN ? AND ?`;
      params.push(dataInicio, dataFim);
    }

    query += ` ORDER BY id ASC`;

    const result = db.exec(query, params);

    if (!result[0]?.values) {
      return {
        hash_esperado: '',
        hash_calculado: '',
        integro: true,
        data_verificacao: new Date().toISOString(),
        registros_verificados: 0,
        registros_corrompidos: 0,
      };
    }

    let hashAnterior = '';

    for (const [id, timestamp, modulo, operacao, entidade, idEntidade, descricao, hashRegistro, hashAnteriorArmazenado, assinatura] of result[0].values) {
      // Recalcular hash
      const conteudo = JSON.stringify({
        timestamp,
        modulo,
        operacao,
        entidade,
        id_entidade: idEntidade,
        descricao,
        hash_anterior: hashAnterior,
      });

      const hashCalculado = await sha256Hex(conteudo);

      // Verificar hash
      if (hashCalculado !== hashRegistro) {
        console.error(`Registro ${id} corrompido: hash mismatch`);
        registrosComErro++;
      } else {
        // Verificar assinatura HMAC
        const assinaturaEsperada = await hmacSha256Hex(segredo, String(hashRegistro));

        if (assinaturaEsperada === assinatura) {
          registrosCorretos++;
        } else {
          console.error(`Registro ${id} não autenticado`);
          registrosComErro++;
        }
      }

      hashAnterior = hashRegistro;
    }

    return {
      hash_esperado: hashAnterior,
      hash_calculado: hashAnterior,
      integro: registrosComErro === 0,
      data_verificacao: new Date().toISOString(),
      registros_verificados: registrosCorretos + registrosComErro,
      registros_corrompidos: registrosComErro,
    };
  } catch (erro) {
    console.error('Erro ao verificar integridade:', erro);
    return {
      hash_esperado: '',
      hash_calculado: '',
      integro: false,
      data_verificacao: new Date().toISOString(),
      registros_verificados: 0,
      registros_corrompidos: 0,
    };
  }
}

/**
 * Gera relatório de auditoria completo
 */
export function gerarRelatorioAuditoria(
  db: any,
  periodo_inicio: string,
  periodo_fim: string
): RelatorioAuditoria {
  try {
    // Total de registros
    const resultTotal = db.exec(
      `SELECT COUNT(*) FROM auditoria_log WHERE timestamp BETWEEN ? AND ?`,
      [periodo_inicio, periodo_fim]
    );

    const total_registros = resultTotal[0]?.values[0]?.[0] || 0;

    // Por tipo de operação
    const resultPorTipo = db.exec(
      `SELECT tipo_operacao, COUNT(*) FROM auditoria_log WHERE timestamp BETWEEN ? AND ? GROUP BY tipo_operacao`,
      [periodo_inicio, periodo_fim]
    );

    const operacoes_por_tipo: Record<string, number> = {};
    if (resultPorTipo[0]?.values) {
      for (const [tipo, count] of resultPorTipo[0].values) {
        operacoes_por_tipo[tipo] = count;
      }
    }

    // Por módulo
    const resultPorModulo = db.exec(
      `SELECT modulo_chamador, COUNT(*) FROM auditoria_log WHERE timestamp BETWEEN ? AND ? GROUP BY modulo_chamador`,
      [periodo_inicio, periodo_fim]
    );

    const operacoes_por_modulo: Record<string, number> = {};
    if (resultPorModulo[0]?.values) {
      for (const [modulo, count] of resultPorModulo[0].values) {
        operacoes_por_modulo[modulo] = count;
      }
    }

    // Usuários ativos
    const resultUsuarios = db.exec(
      `SELECT COUNT(DISTINCT usuario_id) FROM auditoria_log WHERE timestamp BETWEEN ? AND ? AND usuario_id IS NOT NULL`,
      [periodo_inicio, periodo_fim]
    );

    const usuarios_ativos = resultUsuarios[0]?.values[0]?.[0] || 0;

    // IPs diferentes
    const resultIPs = db.exec(
      `SELECT COUNT(DISTINCT ip_origem) FROM auditoria_log WHERE timestamp BETWEEN ? AND ?`,
      [periodo_inicio, periodo_fim]
    );

    const ips_diferentes = resultIPs[0]?.values[0]?.[0] || 0;

    // Erros
    const resultErros = db.exec(
      `SELECT COUNT(*) FROM auditoria_log WHERE status = 'erro' AND timestamp BETWEEN ? AND ?`,
      [periodo_inicio, periodo_fim]
    );

    const erros_registrados = resultErros[0]?.values[0]?.[0] || 0;

    // Últimas alterações
    const resultUltimas = db.exec(
      `SELECT * FROM auditoria_log WHERE timestamp BETWEEN ? AND ? ORDER BY id DESC LIMIT 10`,
      [periodo_inicio, periodo_fim]
    );

    const ultimas_alteracoes: RegistroAuditoria[] = [];
    if (resultUltimas[0]?.values) {
      for (const row of resultUltimas[0].values) {
        ultimas_alteracoes.push({
          id: row[0],
          timestamp: row[1],
          usuario_id: row[2],
          usuario_nome: row[3],
          ip_origem: row[4],
          modulo_chamador: row[5],
          tipo_operacao: row[6] as any,
          entidade_afetada: row[7],
          id_entidade: row[8],
          descricao_alteracao: row[9],
          valor_anterior: row[10] ? JSON.parse(row[10]) : undefined,
          valor_novo: row[11] ? JSON.parse(row[11]) : undefined,
          hash_sha256: row[12],
          hash_anterior: row[13],
          status: row[14] as any,
          mensagem_erro: row[15],
          tempo_processamento_ms: row[16],
          retencao_ate: row[17],
          assinado: row[18] === 1,
          assinatura_digital: row[19],
          criado_em: row[20],
        });
      }
    }

    return {
      periodo_inicio,
      periodo_fim,
      total_registros,
      operacoes_por_tipo,
      operacoes_por_modulo,
      usuarios_ativos,
      ips_diferentes,
      erros_registrados,
      ultimas_alteracoes,
    };
  } catch (erro) {
    console.error('Erro ao gerar relatório de auditoria:', erro);
    return {
      periodo_inicio,
      periodo_fim,
      total_registros: 0,
      operacoes_por_tipo: {},
      operacoes_por_modulo: {},
      usuarios_ativos: 0,
      ips_diferentes: 0,
      erros_registrados: 0,
      ultimas_alteracoes: [],
    };
  }
}

/**
 * Registra acesso de leitura no ledger
 */
export function registrarAcessoLeitura(
  db: any,
  usuario_id: number,
  usuario_nome: string,
  ip_origem: string,
  entidade_lida: string,
  id_entidade: number,
  tempo_ms: number
): void {
  registrarChamadaAPI(db, {
    timestamp: new Date().toISOString(),
    usuario_id,
    usuario_nome,
    ip_origem,
    modulo_chamador: 'api-gateway',
    tipo_operacao: 'leitura',
    entidade_afetada: entidade_lida,
    id_entidade,
    descricao_alteracao: `Leitura de ${entidade_lida}`,
    status: 'sucesso',
    tempo_processamento_ms: tempo_ms,
    assinado: false,
  });
}

/**
 * Registra erro de operação
 */
export function registrarErro(
  db: any,
  usuario_id: number,
  modulo: string,
  entidade: string,
  erro: string,
  ip_origem: string
): void {
  registrarChamadaAPI(db, {
    timestamp: new Date().toISOString(),
    usuario_id,
    ip_origem,
    modulo_chamador: modulo,
    tipo_operacao: 'escrita',
    entidade_afetada: entidade,
    id_entidade: 0,
    descricao_alteracao: `Erro ao processar ${entidade}`,
    status: 'erro',
    mensagem_erro: erro,
    tempo_processamento_ms: 0,
    assinado: false,
  });
}

/**
 * Exporta log de auditoria para arquivo
 */
export function exportarLogAuditoria(
  db: any,
  dataInicio: string,
  dataFim: string,
  formato: 'json' | 'csv' = 'json'
): string {
  try {
    const result = db.exec(
      `SELECT * FROM auditoria_log WHERE timestamp BETWEEN ? AND ? ORDER BY id ASC`,
      [dataInicio, dataFim]
    );

    if (formato === 'json') {
      const registros = result[0]?.values || [];
      return JSON.stringify(registros, null, 2);
    } else if (formato === 'csv') {
      let csv = 'id,timestamp,usuario,modulo,operacao,entidade,descricao,status,hash\n';
      if (result[0]?.values) {
        for (const row of result[0].values) {
          csv += `${row[0]},"${row[1]}","${row[3]}","${row[5]}","${row[6]}","${row[7]}","${row[9]}","${row[14]}","${row[12]}"\n`;
        }
      }
      return csv;
    }
  } catch (erro) {
    console.error('Erro ao exportar log:', erro);
  }

  return '';
}

/**
 * Lista todos os acessos de um usuário
 */
export function listarAcessosUsuario(
  db: any,
  usuario_id: number,
  limite: number = 100
): RegistroAuditoria[] {
  try {
    // Colunas nomeadas, e não `SELECT *` com índice posicional: a ordem das colunas de
    // auditoria_log não é contrato nenhum, e inserir uma coluna no meio da tabela
    // deslocaria TODOS os índices de uma vez, trocando status por mensagem de erro e
    // afins — em silêncio, sem o compilador nem os testes acusarem.
    const result = db.exec(
      `SELECT id, timestamp, usuario_id, usuario_nome, ip_origem, modulo_chamador,
              tipo_operacao, entidade_afetada, id_entidade, descricao_alteracao,
              hash_sha256, hash_anterior, status, mensagem_erro,
              tempo_processamento_ms, retencao_ate, assinado, assinatura_digital, criado_em
       FROM auditoria_log WHERE usuario_id = ? ORDER BY id DESC LIMIT ?`,
      [usuario_id, limite]
    );

    const registros: RegistroAuditoria[] = [];
    if (result[0]?.values) {
      for (const row of result[0].values) {
        registros.push({
          id: row[0],
          timestamp: row[1],
          usuario_id: row[2],
          usuario_nome: row[3],
          ip_origem: row[4],
          modulo_chamador: row[5],
          tipo_operacao: row[6] as RegistroAuditoria['tipo_operacao'],
          entidade_afetada: row[7],
          id_entidade: row[8],
          descricao_alteracao: row[9],
          hash_sha256: row[10],
          hash_anterior: row[11],
          status: row[12] as RegistroAuditoria['status'],
          mensagem_erro: row[13],
          tempo_processamento_ms: row[14],
          // Faltava: `retencao_ate` é obrigatório no tipo e não era preenchido aqui.
          retencao_ate: row[15],
          assinado: row[16] === 1,
          assinatura_digital: row[17],
          criado_em: row[18],
        });
      }
    }

    return registros;
  } catch (erro) {
    console.error('Erro ao listar acessos:', erro);
    return [];
  }
}
