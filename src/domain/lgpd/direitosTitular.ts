/**
 * MÓDULO LGPD: Direitos do titular (Lei 13.709/2018, art. 18 — acesso, portabilidade,
 * exclusão e correção).
 *
 * Reconstrução do domínio apagado (`compliance-lgpd.ts`), que não tinha tabela nem teste
 * contra nada real (ver docs/dominios-a-reconstruir.md, seção 6). Diferente do módulo
 * antigo, aqui cada solicitação é registrada em `solicitacoes_lgpd` e o "atendimento" faz
 * uma busca REAL pelos dados pessoais espalhados pelo sistema — nunca um mock.
 *
 * FONTES DE DADO PESSOAL: só tabelas que de fato guardam um CPF/CNPJ real (nunca
 * `imoveis.proprietario_nome`/`co_titular_nome`, por exemplo — são nomes soltos, sem CPF
 * associado no schema atual; incluir um "match" por nome seria fabricar correspondência
 * sem prova, o mesmo princípio de "nunca fabricar dado" já aplicado a rateio por fração
 * ideal incompleta em `rateios.base_incompleta`). Três das fontes abaixo (`pessoas`,
 * `partes_processo`, `pagamentos_iniciados`) pertencem a domínios reconstruídos em
 * paralelo por outros agentes (Contas Pessoais, Advocacia, Open Banking/Pagamentos) — a
 * busca checa a existência da tabela em tempo de execução (`tabelaExiste`) antes de
 * consultar, então este módulo funciona tanto antes quanto depois desses domínios
 * existirem no schema, sem exigir uma ordem de merge específica.
 *
 * A TENSÃO REAL (exclusão): dado financeiro tem retenção legal obrigatória (Lei 6404/76 —
 * o próprio `auditoria_log.retencao_ate`, em compliance-audit-log.ts, usa 7 anos como
 * prazo). "Direito ao esquecimento" não é absoluto quando colide com obrigação legal de
 * guarda de escrituração contábil (LGPD art. 16, II admite guarda para cumprimento de
 * obrigação legal). `atenderExclusao` por isso RECUSA a exclusão inteira, com o motivo
 * explícito, sempre que qualquer registro pessoal encontrado ainda estiver dentro do
 * prazo de retenção (ou vinculado a uma relação ainda em curso — contrato vigente,
 * processo ativo); só quando NENHUM registro estiver retido é que os campos de IDENTIDADE
 * (nome, CPF, telefone, e-mail) são anonimizados — nunca os valores/lançamentos contábeis
 * em si, que continuam íntegros no razão, só descolados da identidade da pessoa.
 */
import type { Database } from "sql.js";
import { consultar, executar } from "../../db/connection";
import { registrarLog, resumirDiferenca } from "../auditoria/logAlteracoes";

export type TipoSolicitacaoLGPD = "acesso" | "portabilidade" | "exclusao" | "correcao";
export type StatusSolicitacaoLGPD = "pendente" | "atendida" | "recusada";

export interface SolicitacaoLGPD {
  id: number;
  titular_nome: string;
  titular_cpf: string;
  tipo: TipoSolicitacaoLGPD;
  status: StatusSolicitacaoLGPD;
  data_solicitacao: string;
  data_atendimento: string | null;
  motivo_recusa: string | null;
  detalhes: string | null;
}

export interface RegistroPessoalEncontrado {
  tabela: string;
  registro_id: number;
  campos: Record<string, unknown>;
}

export interface ResultadoExclusaoLGPD {
  solicitacao: SolicitacaoLGPD;
  aceita: boolean;
  motivo_recusa?: string;
  registros_anonimizados?: { tabela: string; registro_id: number }[];
}

// Prazo de guarda obrigatória de documento/lançamento contábil (Lei 6404/76) — mesmo
// valor usado em compliance-audit-log.ts para `retencao_ate`. Repetido aqui (não
// importado de lá) porque aquele módulo é sobre OUTRA coisa (log de acesso/API), não
// sobre dado pessoal de titular; a constante é a mesma por serem a mesma lei, não porque
// os módulos dependam um do outro.
const RETENCAO_ANOS = 7;

const NOME_ANONIMIZADO = "[titular removido — LGPD]";
const CPF_ANONIMIZADO = "ANONIMIZADO";

function tabelaExiste(db: Database, nome: string): boolean {
  return consultar(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?", [nome]).length > 0;
}

function anosDesde(dataISO: string, referencia: Date = new Date()): number {
  return (referencia.getTime() - new Date(dataISO).getTime()) / (365.25 * 24 * 3600 * 1000);
}

function buscarSolicitacao(db: Database, id: number): SolicitacaoLGPD {
  const [solicitacao] = consultar<SolicitacaoLGPD>(db, "SELECT * FROM solicitacoes_lgpd WHERE id = ?", [id]);
  if (!solicitacao) throw new Error(`Solicitação LGPD ${id} não encontrada.`);
  return solicitacao;
}

function validarSolicitacaoPendente(solicitacao: SolicitacaoLGPD, tipoEsperado: TipoSolicitacaoLGPD, cpf: string): void {
  if (solicitacao.tipo !== tipoEsperado) {
    throw new Error(`Solicitação ${solicitacao.id} é do tipo '${solicitacao.tipo}', não '${tipoEsperado}'.`);
  }
  if (solicitacao.status !== "pendente") {
    throw new Error(`Solicitação ${solicitacao.id} já foi ${solicitacao.status}, não pode ser atendida de novo.`);
  }
  if (solicitacao.titular_cpf !== cpf) {
    throw new Error(`CPF informado ('${cpf}') não corresponde ao titular da solicitação ('${solicitacao.titular_cpf}').`);
  }
}

/** Registra uma nova solicitação do titular — sempre nasce 'pendente'. */
export function registrarSolicitacao(
  db: Database,
  dados: { titular_nome: string; titular_cpf: string; tipo: TipoSolicitacaoLGPD; detalhes?: string },
): SolicitacaoLGPD {
  const dataSolicitacao = new Date().toISOString();
  executar(
    db,
    `INSERT INTO solicitacoes_lgpd (titular_nome, titular_cpf, tipo, status, data_solicitacao, detalhes)
     VALUES (?, ?, ?, 'pendente', ?, ?)`,
    [dados.titular_nome, dados.titular_cpf, dados.tipo, dataSolicitacao, dados.detalhes ?? null],
  );
  const [{ id }] = consultar<{ id: number }>(db, "SELECT last_insert_rowid() as id");
  return buscarSolicitacao(db, id);
}

/** Busca TODOS os dados pessoais de um CPF espalhados pelo sistema — o núcleo comum de
 * acesso e portabilidade (art. 18, I e V). Ver comentário do módulo para a lista de
 * fontes e por que cada uma entra ou não. */
export function buscarDadosPessoaisPorCpf(db: Database, cpf: string): RegistroPessoalEncontrado[] {
  const registros: RegistroPessoalEncontrado[] = [];

  for (const r of consultar<{ id: number; tipo: string; nome: string; endereco: string | null; regime_tributario: string | null }>(
    db,
    "SELECT id, tipo, nome, endereco, regime_tributario FROM entidades_legais WHERE cpf_cnpj = ?",
    [cpf],
  )) {
    registros.push({
      tabela: "entidades_legais",
      registro_id: r.id,
      campos: { tipo: r.tipo, nome: r.nome, endereco: r.endereco, regime_tributario: r.regime_tributario },
    });
  }

  for (const r of consultar<{
    id: number;
    tipo: string;
    valor: number | null;
    data_documento: string | null;
    nome_contraparte: string | null;
    descricao_produto_servico: string | null;
  }>(
    db,
    "SELECT id, tipo, valor, data_documento, nome_contraparte, descricao_produto_servico FROM documentos WHERE cnpj_cpf_contraparte = ?",
    [cpf],
  )) {
    registros.push({
      tabela: "documentos",
      registro_id: r.id,
      campos: {
        tipo: r.tipo,
        valor: r.valor,
        data_documento: r.data_documento,
        nome_contraparte: r.nome_contraparte,
        descricao_produto_servico: r.descricao_produto_servico,
      },
    });
  }

  for (const r of consultar<{ id: number; contrato_id: number; nome: string; papel: string; telefone: string | null; email: string | null }>(
    db,
    "SELECT id, contrato_id, nome, papel, telefone, email FROM contrato_locatarios WHERE cpf = ?",
    [cpf],
  )) {
    registros.push({
      tabela: "contrato_locatarios",
      registro_id: r.id,
      campos: { contrato_id: r.contrato_id, nome: r.nome, papel: r.papel, telefone: r.telefone, email: r.email },
    });
  }

  for (const r of consultar<{ id: number; nome: string; servico: string }>(
    db,
    "SELECT id, nome, servico FROM prestadores WHERE cpf_cnpj = ?",
    [cpf],
  )) {
    registros.push({ tabela: "prestadores", registro_id: r.id, campos: { nome: r.nome, servico: r.servico } });
  }

  for (const r of consultar<{ id: number; tipo: string; nome_contraparte: string | null; imovel_id: number | null }>(
    db,
    "SELECT id, tipo, nome_contraparte, imovel_id FROM regras_categorizacao_documentos WHERE cnpj_cpf = ?",
    [cpf],
  )) {
    registros.push({
      tabela: "regras_categorizacao_documentos",
      registro_id: r.id,
      campos: { tipo: r.tipo, nome_contraparte: r.nome_contraparte, imovel_id: r.imovel_id },
    });
  }

  if (tabelaExiste(db, "pessoas")) {
    for (const r of consultar<{ id: number; nome: string; tipo_relacao: string }>(
      db,
      "SELECT id, nome, tipo_relacao FROM pessoas WHERE cpf = ?",
      [cpf],
    )) {
      registros.push({ tabela: "pessoas", registro_id: r.id, campos: { nome: r.nome, tipo_relacao: r.tipo_relacao } });
    }
  }

  if (tabelaExiste(db, "partes_processo")) {
    for (const r of consultar<{ id: number; processo_id: number; nome: string; papel: string; representado_por_nos: number }>(
      db,
      "SELECT id, processo_id, nome, papel, representado_por_nos FROM partes_processo WHERE cpf_cnpj = ?",
      [cpf],
    )) {
      registros.push({
        tabela: "partes_processo",
        registro_id: r.id,
        campos: { processo_id: r.processo_id, nome: r.nome, papel: r.papel, representado_por_nos: r.representado_por_nos },
      });
    }
  }

  if (tabelaExiste(db, "pagamentos_iniciados")) {
    for (const r of consultar<{ id: number; destinatario_nome: string; tipo: string; valor: number; status: string; data_solicitacao: string }>(
      db,
      "SELECT id, destinatario_nome, tipo, valor, status, data_solicitacao FROM pagamentos_iniciados WHERE destinatario_documento = ?",
      [cpf],
    )) {
      registros.push({
        tabela: "pagamentos_iniciados",
        registro_id: r.id,
        campos: { destinatario_nome: r.destinatario_nome, tipo: r.tipo, valor: r.valor, status: r.status, data_solicitacao: r.data_solicitacao },
      });
    }
  }

  return registros;
}

/** Direito de acesso (art. 18, I): retorna todos os dados pessoais encontrados e marca a
 * solicitação como atendida. */
export function atenderAcesso(
  db: Database,
  solicitacao_id: number,
  cpf: string,
): { solicitacao: SolicitacaoLGPD; registros: RegistroPessoalEncontrado[] } {
  const solicitacao = buscarSolicitacao(db, solicitacao_id);
  validarSolicitacaoPendente(solicitacao, "acesso", cpf);

  const registros = buscarDadosPessoaisPorCpf(db, cpf);
  const tabelasDistintas = new Set(registros.map((r) => r.tabela)).size;
  const dataAtendimento = new Date().toISOString();
  const detalhes = `Acesso concedido: ${registros.length} registro(s) encontrado(s) em ${tabelasDistintas} tabela(s).`;
  executar(db, "UPDATE solicitacoes_lgpd SET status = 'atendida', data_atendimento = ?, detalhes = ? WHERE id = ?", [
    dataAtendimento,
    detalhes,
    solicitacao_id,
  ]);

  return { solicitacao: buscarSolicitacao(db, solicitacao_id), registros };
}

/** Direito de portabilidade (art. 18, V): mesma busca do acesso, formatada como export
 * JSON portável (estrutura simples e documentada, sem dependência de formato proprietário). */
export function atenderPortabilidade(
  db: Database,
  solicitacao_id: number,
  cpf: string,
): { solicitacao: SolicitacaoLGPD; exportacaoJson: string } {
  const solicitacao = buscarSolicitacao(db, solicitacao_id);
  validarSolicitacaoPendente(solicitacao, "portabilidade", cpf);

  const registros = buscarDadosPessoaisPorCpf(db, cpf);
  const exportacaoJson = JSON.stringify(
    { titular_cpf: cpf, titular_nome: solicitacao.titular_nome, gerado_em: new Date().toISOString(), registros },
    null,
    2,
  );

  const dataAtendimento = new Date().toISOString();
  const detalhes = `Portabilidade concedida: export gerado com ${registros.length} registro(s).`;
  executar(db, "UPDATE solicitacoes_lgpd SET status = 'atendida', data_atendimento = ?, detalhes = ? WHERE id = ?", [
    dataAtendimento,
    detalhes,
    solicitacao_id,
  ]);

  return { solicitacao: buscarSolicitacao(db, solicitacao_id), exportacaoJson };
}

interface AvaliacaoRetencao {
  retida: boolean;
  motivo?: string;
}

/** Decide se um registro pessoal encontrado ainda está sob retenção legal ativa — a
 * tensão central da exclusão. Cada `case` reflete uma regra de negócio real diferente
 * (data do documento, vigência do contrato, atividade financeira do prestador/pessoa,
 * status do processo), não um prazo genérico aplicado cegamente a tudo. */
function avaliarRetencao(db: Database, tabela: string, registroId: number): AvaliacaoRetencao {
  switch (tabela) {
    case "entidades_legais":
      // Âncora contábil do sistema inteiro (periodos_contabeis, ledger_entries,
      // pagamentos_iniciados etc. referenciam entidade_id) — nunca é alvo de exclusão de
      // titular. Desassociar-se como entidade não é uma operação de dado pessoal, é
      // descontinuar o próprio sistema, fora do escopo deste módulo.
      return { retida: true, motivo: "entidades_legais é a entidade contábil fundamental do sistema — nunca é anonimizada por exclusão LGPD." };

    case "documentos": {
      const [d] = consultar<{ data_documento: string | null }>(db, "SELECT data_documento FROM documentos WHERE id = ?", [registroId]);
      if (!d || d.data_documento == null) {
        return { retida: true, motivo: "documento sem data conhecida — retenção não pode ser confirmada como expirada." };
      }
      if (anosDesde(d.data_documento) < RETENCAO_ANOS) {
        return { retida: true, motivo: `documento de ${d.data_documento}, dentro do prazo de retenção contábil de ${RETENCAO_ANOS} anos (Lei 6404/76).` };
      }
      return { retida: false };
    }

    case "contrato_locatarios": {
      const [c] = consultar<{ data_fim: string | null }>(
        db,
        `SELECT cl.data_fim AS data_fim FROM contrato_locatarios cli JOIN contratos_locacao cl ON cl.id = cli.contrato_id WHERE cli.id = ?`,
        [registroId],
      );
      if (!c || c.data_fim == null) return { retida: true, motivo: "contrato de locação ainda vigente (sem data_fim)." };
      if (anosDesde(c.data_fim) < RETENCAO_ANOS) {
        return { retida: true, motivo: `contrato encerrado em ${c.data_fim}, dentro do prazo de retenção de ${RETENCAO_ANOS} anos.` };
      }
      return { retida: false };
    }

    case "prestadores": {
      const [t] = consultar<{ ultima: string | null }>(db, "SELECT MAX(data) as ultima FROM transacoes WHERE prestador_id = ?", [registroId]);
      if (!t?.ultima) return { retida: false }; // nunca movimentou financeiramente — cadastro solto, sem tensão de retenção
      if (anosDesde(t.ultima) < RETENCAO_ANOS) {
        return { retida: true, motivo: `última transação vinculada em ${t.ultima}, dentro do prazo de retenção de ${RETENCAO_ANOS} anos.` };
      }
      return { retida: false };
    }

    case "regras_categorizacao_documentos":
      // Regra de auto-preenchimento (conveniência de UI), não é lançamento contábil —
      // sem nenhuma tensão de retenção legal.
      return { retida: false };

    case "pessoas": {
      const [m] = consultar<{ ultima: string | null }>(
        db,
        `SELECT MAX(mp.data) as ultima FROM movimentos_pessoais mp JOIN contas_pessoais cp ON cp.id = mp.conta_pessoal_id WHERE cp.pessoa_id = ?`,
        [registroId],
      );
      if (!m?.ultima) return { retida: false };
      if (anosDesde(m.ultima) < RETENCAO_ANOS) {
        return { retida: true, motivo: `último movimento financeiro pessoal em ${m.ultima}, dentro do prazo de retenção de ${RETENCAO_ANOS} anos.` };
      }
      return { retida: false };
    }

    case "partes_processo": {
      const [p] = consultar<{ status: string; data_encerramento: string | null }>(
        db,
        `SELECT pl.status AS status, pl.data_encerramento AS data_encerramento
         FROM partes_processo pp JOIN processos_legais pl ON pl.id = pp.processo_id WHERE pp.id = ?`,
        [registroId],
      );
      if (!p) return { retida: false };
      if (p.status === "ativo" || p.status === "suspenso") {
        return { retida: true, motivo: `processo judicial ainda em curso (status='${p.status}').` };
      }
      if (p.data_encerramento == null || anosDesde(p.data_encerramento) < RETENCAO_ANOS) {
        return {
          retida: true,
          motivo: `processo encerrado/arquivado em ${p.data_encerramento ?? "data desconhecida"}, dentro do prazo de retenção de ${RETENCAO_ANOS} anos.`,
        };
      }
      return { retida: false };
    }

    case "pagamentos_iniciados": {
      const [pg] = consultar<{ data_solicitacao: string }>(db, "SELECT data_solicitacao FROM pagamentos_iniciados WHERE id = ?", [registroId]);
      if (!pg) return { retida: false };
      if (anosDesde(pg.data_solicitacao) < RETENCAO_ANOS) {
        return { retida: true, motivo: `pagamento solicitado em ${pg.data_solicitacao}, dentro do prazo de retenção de ${RETENCAO_ANOS} anos.` };
      }
      return { retida: false };
    }

    default:
      return { retida: false };
  }
}

/** Remove/anonimiza só os campos de IDENTIDADE do registro (nome, CPF, telefone, e-mail)
 * — nunca valor/data/status, que continuam íntegros para a escrituração contábil. Só é
 * chamada depois de `avaliarRetencao` confirmar que o registro não está mais retido. */
function anonimizarRegistro(db: Database, tabela: string, registroId: number): void {
  switch (tabela) {
    case "documentos": {
      const [antes] = consultar<Record<string, unknown>>(db, "SELECT * FROM documentos WHERE id = ?", [registroId]);
      executar(db, "UPDATE documentos SET cnpj_cpf_contraparte = ?, nome_contraparte = ? WHERE id = ?", [
        CPF_ANONIMIZADO,
        NOME_ANONIMIZADO,
        registroId,
      ]);
      const [depois] = consultar<Record<string, unknown>>(db, "SELECT * FROM documentos WHERE id = ?", [registroId]);
      registrarLog(db, "documentos", registroId, "edicao", "Exclusão LGPD: identidade do titular anonimizada", antes, depois);
      return;
    }
    case "contrato_locatarios": {
      const [antes] = consultar<Record<string, unknown>>(db, "SELECT * FROM contrato_locatarios WHERE id = ?", [registroId]);
      executar(db, "UPDATE contrato_locatarios SET nome = ?, cpf = ?, telefone = NULL, email = NULL WHERE id = ?", [
        NOME_ANONIMIZADO,
        CPF_ANONIMIZADO,
        registroId,
      ]);
      const [depois] = consultar<Record<string, unknown>>(db, "SELECT * FROM contrato_locatarios WHERE id = ?", [registroId]);
      registrarLog(db, "contrato_locatarios", registroId, "edicao", "Exclusão LGPD: identidade do titular anonimizada", antes, depois);
      return;
    }
    case "prestadores": {
      const [antes] = consultar<Record<string, unknown>>(db, "SELECT * FROM prestadores WHERE id = ?", [registroId]);
      executar(db, "UPDATE prestadores SET nome = ?, cpf_cnpj = ? WHERE id = ?", [NOME_ANONIMIZADO, CPF_ANONIMIZADO, registroId]);
      const [depois] = consultar<Record<string, unknown>>(db, "SELECT * FROM prestadores WHERE id = ?", [registroId]);
      registrarLog(db, "prestadores", registroId, "edicao", "Exclusão LGPD: identidade do titular anonimizada", antes, depois);
      return;
    }
    case "regras_categorizacao_documentos": {
      // Não é lançamento contábil — a regra inteira só existe para auto-preencher a
      // próxima ocorrência do mesmo CNPJ/CPF; sem tensão de retenção, remove de fato.
      const [antes] = consultar<Record<string, unknown>>(db, "SELECT * FROM regras_categorizacao_documentos WHERE id = ?", [registroId]);
      executar(db, "DELETE FROM regras_categorizacao_documentos WHERE id = ?", [registroId]);
      registrarLog(db, "regras_categorizacao_documentos", registroId, "exclusao", "Exclusão LGPD: regra de auto-preenchimento removida", antes, null);
      return;
    }
    case "pessoas": {
      const [antes] = consultar<Record<string, unknown>>(db, "SELECT * FROM pessoas WHERE id = ?", [registroId]);
      executar(db, "UPDATE pessoas SET nome = ?, cpf = ? WHERE id = ?", [NOME_ANONIMIZADO, CPF_ANONIMIZADO, registroId]);
      const [depois] = consultar<Record<string, unknown>>(db, "SELECT * FROM pessoas WHERE id = ?", [registroId]);
      registrarLog(db, "pessoas", registroId, "edicao", "Exclusão LGPD: identidade do titular anonimizada", antes, depois);
      return;
    }
    case "partes_processo": {
      const [antes] = consultar<Record<string, unknown>>(db, "SELECT * FROM partes_processo WHERE id = ?", [registroId]);
      executar(db, "UPDATE partes_processo SET nome = ?, cpf_cnpj = ? WHERE id = ?", [NOME_ANONIMIZADO, CPF_ANONIMIZADO, registroId]);
      const [depois] = consultar<Record<string, unknown>>(db, "SELECT * FROM partes_processo WHERE id = ?", [registroId]);
      registrarLog(db, "partes_processo", registroId, "edicao", "Exclusão LGPD: identidade do titular anonimizada", antes, depois);
      return;
    }
    case "pagamentos_iniciados": {
      const [antes] = consultar<Record<string, unknown>>(db, "SELECT * FROM pagamentos_iniciados WHERE id = ?", [registroId]);
      executar(db, "UPDATE pagamentos_iniciados SET destinatario_nome = ?, destinatario_documento = ? WHERE id = ?", [
        NOME_ANONIMIZADO,
        CPF_ANONIMIZADO,
        registroId,
      ]);
      const [depois] = consultar<Record<string, unknown>>(db, "SELECT * FROM pagamentos_iniciados WHERE id = ?", [registroId]);
      registrarLog(db, "pagamentos_iniciados", registroId, "edicao", "Exclusão LGPD: identidade do titular anonimizada", antes, depois);
      return;
    }
    default:
      throw new Error(`anonimizarRegistro: tabela '${tabela}' não é uma fonte de dado pessoal conhecida.`);
  }
}

/** Direito de exclusão (art. 18, VI) — COM a tensão real documentada no topo do arquivo:
 * recusa (com motivo claro) quando qualquer registro pessoal encontrado está sob
 * retenção legal ativa; só anonimiza a identidade (nunca os valores/lançamentos) quando
 * nenhum estiver. */
export function atenderExclusao(db: Database, solicitacao_id: number, cpf: string): ResultadoExclusaoLGPD {
  const solicitacao = buscarSolicitacao(db, solicitacao_id);
  validarSolicitacaoPendente(solicitacao, "exclusao", cpf);

  const registros = buscarDadosPessoaisPorCpf(db, cpf);
  const avaliados = registros.map((r) => ({ registro: r, retencao: avaliarRetencao(db, r.tabela, r.registro_id) }));
  const retidos = avaliados.filter((a) => a.retencao.retida);

  const dataAtendimento = new Date().toISOString();

  if (retidos.length > 0) {
    const motivo =
      `Exclusão recusada: ${retidos.length} de ${registros.length} registro(s) pessoal(is) sob retenção legal ativa — ` +
      retidos.map((a) => `${a.registro.tabela}#${a.registro.registro_id} (${a.retencao.motivo})`).join("; ") +
      ".";
    executar(db, "UPDATE solicitacoes_lgpd SET status = 'recusada', data_atendimento = ?, motivo_recusa = ? WHERE id = ?", [
      dataAtendimento,
      motivo,
      solicitacao_id,
    ]);
    return { solicitacao: buscarSolicitacao(db, solicitacao_id), aceita: false, motivo_recusa: motivo };
  }

  const anonimizados: { tabela: string; registro_id: number }[] = [];
  for (const r of registros) {
    anonimizarRegistro(db, r.tabela, r.registro_id);
    anonimizados.push({ tabela: r.tabela, registro_id: r.registro_id });
  }

  const detalhes = `Exclusão atendida: ${anonimizados.length} registro(s) com identidade anonimizada/removida; valores e lançamentos contábeis preservados.`;
  executar(db, "UPDATE solicitacoes_lgpd SET status = 'atendida', data_atendimento = ?, detalhes = ? WHERE id = ?", [
    dataAtendimento,
    detalhes,
    solicitacao_id,
  ]);

  return { solicitacao: buscarSolicitacao(db, solicitacao_id), aceita: true, registros_anonimizados: anonimizados };
}

interface FonteCorrigivel {
  tabela: string;
  colunaCpf: string;
  camposPermitidos: string[];
  opcional?: boolean;
}

// Só campos de IDENTIDADE são corrigíveis por este caminho (nunca valor/data/status de
// um lançamento) — mesmo recorte de anonimizarRegistro(). 'nome' aparece em várias
// tabelas de propósito: a mesma pessoa pode estar cadastrada em mais de um papel
// (locatário E prestador, por exemplo), e uma correção de nome deve propagar para
// TODOS os lugares onde aparece, não só o primeiro encontrado.
const FONTES_CORRECAO: FonteCorrigivel[] = [
  { tabela: "entidades_legais", colunaCpf: "cpf_cnpj", camposPermitidos: ["nome", "endereco"] },
  { tabela: "documentos", colunaCpf: "cnpj_cpf_contraparte", camposPermitidos: ["nome_contraparte"] },
  { tabela: "contrato_locatarios", colunaCpf: "cpf", camposPermitidos: ["nome", "telefone", "email"] },
  { tabela: "prestadores", colunaCpf: "cpf_cnpj", camposPermitidos: ["nome"] },
  { tabela: "regras_categorizacao_documentos", colunaCpf: "cnpj_cpf", camposPermitidos: ["nome_contraparte"] },
  { tabela: "pessoas", colunaCpf: "cpf", camposPermitidos: ["nome"], opcional: true },
  { tabela: "partes_processo", colunaCpf: "cpf_cnpj", camposPermitidos: ["nome"], opcional: true },
  { tabela: "pagamentos_iniciados", colunaCpf: "destinatario_documento", camposPermitidos: ["destinatario_nome"], opcional: true },
];

/** Direito de correção (art. 18, III): corrige `campo` em TODO registro pessoal deste CPF
 * que o tenha — nunca muda dado sem deixar rastro em `log_alteracoes` (uma entrada por
 * registro corrigido). */
export function atenderCorrecao(
  db: Database,
  solicitacao_id: number,
  cpf: string,
  campo: string,
  valor_novo: string,
): { solicitacao: SolicitacaoLGPD; registros_corrigidos: { tabela: string; registro_id: number }[] } {
  const solicitacao = buscarSolicitacao(db, solicitacao_id);
  validarSolicitacaoPendente(solicitacao, "correcao", cpf);

  const corrigidos: { tabela: string; registro_id: number }[] = [];

  for (const fonte of FONTES_CORRECAO) {
    if (!fonte.camposPermitidos.includes(campo)) continue;
    if (fonte.opcional && !tabelaExiste(db, fonte.tabela)) continue;

    const linhas = consultar<Record<string, unknown>>(db, `SELECT * FROM ${fonte.tabela} WHERE ${fonte.colunaCpf} = ?`, [cpf]);
    for (const antes of linhas) {
      const registroId = antes.id as number;
      executar(db, `UPDATE ${fonte.tabela} SET ${campo} = ? WHERE id = ?`, [valor_novo, registroId]);
      const [depois] = consultar<Record<string, unknown>>(db, `SELECT * FROM ${fonte.tabela} WHERE id = ?`, [registroId]);
      registrarLog(db, fonte.tabela, registroId, "edicao", resumirDiferenca(antes, depois), antes, depois);
      corrigidos.push({ tabela: fonte.tabela, registro_id: registroId });
    }
  }

  if (corrigidos.length === 0) {
    throw new Error(`Campo '${campo}' não encontrado para o CPF informado em nenhuma tabela de dado pessoal conhecida.`);
  }

  const dataAtendimento = new Date().toISOString();
  const detalhes =
    `Correção atendida: campo '${campo}' atualizado em ${corrigidos.length} registro(s): ` +
    corrigidos.map((c) => `${c.tabela}#${c.registro_id}`).join(", ") +
    ".";
  executar(db, "UPDATE solicitacoes_lgpd SET status = 'atendida', data_atendimento = ?, detalhes = ? WHERE id = ?", [
    dataAtendimento,
    detalhes,
    solicitacao_id,
  ]);

  return { solicitacao: buscarSolicitacao(db, solicitacao_id), registros_corrigidos: corrigidos };
}
