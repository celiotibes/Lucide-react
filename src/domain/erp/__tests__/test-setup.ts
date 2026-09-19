import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import initSqlJs from "sql.js";
import { garantirPlanoDeContasErp } from "../planoDeContasErp";
import type { Database } from "sql.js";

const DIR_MIGRATIONS = join(dirname(fileURLToPath(import.meta.url)), "..", "__migrations__");

/** Aplica os .sql de __migrations__ no banco de teste.
 *
 * As tabelas desses módulos NÃO são recriadas à mão no bloco de schema acima, de
 * propósito: quando existiam as duas versões, a cópia do teste derivou da migration
 * (ganhou ledger_entry_id, perdeu movimento_pessoal_id/tipo_sincronizacao) e passou a
 * divergir do que o código de produção grava. Lendo o arquivo real, o teste passa a
 * falhar quando o schema muda de verdade, que é o ponto. */
function aplicarMigrations(db: Database): void {
  const arquivos = readdirSync(DIR_MIGRATIONS)
    .filter((n) => n.endsWith(".sql"))
    .sort(); // prefixo de data no nome define a ordem
  for (const arquivo of arquivos) {
    const sql = readFileSync(join(DIR_MIGRATIONS, arquivo), "utf8");
    // PRAGMA é configuração de conexão, não de migration de módulo: em produção quem
    // liga foreign_keys é o schema.sql. Deixar o PRAGMA daqui valer ligaria a
    // integridade referencial no meio do fixture, e os dados de seed atuais não a
    // satisfazem — são 22 testes que passariam a falhar por dados, não por schema.
    // FIXME: semear os dados que faltam e passar a rodar com foreign_keys = ON, que é
    // o que a produção faz; hoje o fixture é mais permissivo que o app real.
    db.run(sql.replace(/^\s*PRAGMA[^;]*;/gim, ""));
  }
}

export async function prepararBancoTeste() {
  const SQL = await initSqlJs();
  const db = new SQL.Database();

  // Criar esquema básico
  db.run(`
    CREATE TABLE IF NOT EXISTS entidades (
      id INTEGER PRIMARY KEY,
      nome TEXT NOT NULL,
      tipo TEXT,
      cnpj TEXT
    );

    CREATE TABLE IF NOT EXISTS periodos_contabeis (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      ano INTEGER NOT NULL,
      mes INTEGER NOT NULL,
      status TEXT DEFAULT 'aberto',
      data_fechamento TEXT,
      encerrado_por INTEGER,
      FOREIGN KEY (entidade_id) REFERENCES entidades(id)
    );

    CREATE TABLE IF NOT EXISTS contas_plano_contas (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      codigo TEXT NOT NULL,
      descricao TEXT NOT NULL,
      grupo TEXT NOT NULL,
      natureza TEXT NOT NULL,
      analisavel INTEGER DEFAULT 1,
      ativo INTEGER DEFAULT 1,
      -- Produção (contabilidade-reconstituicao/schema.sql) é UNIQUE (entidade_id,
      -- codigo): o mesmo código de conta existe em entidades diferentes. O fixture
      -- restringia só por codigo, o que é mais apertado que o app real e fazia
      -- qualquer teste com duas entidades esbarrar em UNIQUE constraint.
      UNIQUE(entidade_id, codigo)
    );

    CREATE TABLE IF NOT EXISTS ledger_entries (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      periodo_id INTEGER NOT NULL,
      centro_custo_id INTEGER,
      conta_id INTEGER NOT NULL,
      data_lancamento TEXT,
      valor_debito REAL,
      valor_credito REAL,
      descricao TEXT,
      origem_modulo TEXT,
      origem_id INTEGER,
      referencia_documento TEXT,
      criado_por INTEGER,
      criado_em TEXT,
      estornado_por_id INTEGER,
      motivo_estorno TEXT,
      auditada INTEGER DEFAULT 0,
      auditado_em TEXT,
      auditado_por INTEGER,
      FOREIGN KEY (entidade_id) REFERENCES entidades(id),
      FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id),
      FOREIGN KEY (conta_id) REFERENCES contas_plano_contas(id)
    );

    CREATE TABLE IF NOT EXISTS ledger_encerramentos (
      id INTEGER PRIMARY KEY,
      periodo_id INTEGER NOT NULL,
      encerrado_por INTEGER,
      balancete_OK INTEGER,
      total_debito REAL,
      total_credito REAL,
      hash_snapshot TEXT,
      observacoes TEXT,
      data_encerramento TEXT,
      FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id)
    );

    CREATE TABLE IF NOT EXISTS ledger_saldos_periodo (
      id INTEGER PRIMARY KEY,
      periodo_id INTEGER NOT NULL,
      conta_id INTEGER NOT NULL,
      saldo_anterior REAL DEFAULT 0,
      total_debito REAL DEFAULT 0,
      total_credito REAL DEFAULT 0,
      saldo_final REAL DEFAULT 0,
      FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id),
      FOREIGN KEY (conta_id) REFERENCES contas_plano_contas(id)
    );

    CREATE TABLE IF NOT EXISTS imoveis (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      endereco TEXT NOT NULL,
      tipo_imovel TEXT,
      uso_pessoal INTEGER DEFAULT 0,
      financiado INTEGER DEFAULT 0,
      valor_aquisicao REAL DEFAULT 0,
      criado_em TEXT,
      FOREIGN KEY (entidade_id) REFERENCES entidades(id)
    );

    CREATE TABLE IF NOT EXISTS contratos_locacao (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      imovel_id INTEGER NOT NULL,
      valor_aluguel REAL,
      valor_referencia REAL,
      data_inicio TEXT,
      data_fim TEXT,
      status TEXT DEFAULT 'ativo',
      FOREIGN KEY (entidade_id) REFERENCES entidades(id),
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id)
    );

    CREATE TABLE IF NOT EXISTS transacoes_auditoria (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      periodo_id INTEGER NOT NULL,
      tipo TEXT,
      descricao TEXT,
      status TEXT DEFAULT 'pendente',
      FOREIGN KEY (entidade_id) REFERENCES entidades(id),
      FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id)
    );

    -- MÓDULO ADVOCACIA
    CREATE TABLE IF NOT EXISTS processos_legais (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      numero_processo TEXT UNIQUE NOT NULL,
      tipo TEXT NOT NULL,
      descricao TEXT,
      data_ajuizamento TEXT,
      data_conclusao TEXT,
      status TEXT DEFAULT 'ativo',
      foro TEXT,
      juiz TEXT,
      nivel_hierarquia INTEGER DEFAULT 1,
      valor_causa REAL,
      estimativa_despesa REAL,
      risco_potencial TEXT,
      criado_em TEXT,
      atualizado_em TEXT,
      FOREIGN KEY (entidade_id) REFERENCES entidades(id)
    );

    CREATE TABLE IF NOT EXISTS partes_processo (
      id INTEGER PRIMARY KEY,
      processo_id INTEGER NOT NULL,
      tipo_parte TEXT,
      nome_parte TEXT NOT NULL,
      contato TEXT,
      dados_bancarios TEXT,
      FOREIGN KEY (processo_id) REFERENCES processos_legais(id)
    );

    CREATE TABLE IF NOT EXISTS despesas_legais (
      id INTEGER PRIMARY KEY,
      processo_id INTEGER NOT NULL,
      entidade_id INTEGER NOT NULL,
      periodo_id INTEGER NOT NULL,
      data_lancamento TEXT,
      tipo_despesa TEXT,
      descricao TEXT,
      valor_despesa REAL NOT NULL,
      beneficiario TEXT,
      referencia_documento TEXT,
      origem_modulo TEXT DEFAULT 'advocacia',
      tentativas INTEGER DEFAULT 0,
      -- Guarda de idempotência, como em pagamentos: marca a despesa já lançada no
      -- ledger para a sincronização não lançá-la de novo.
      ledger_entry_id INTEGER,
      criado_em TEXT,
      FOREIGN KEY (processo_id) REFERENCES processos_legais(id),
      FOREIGN KEY (entidade_id) REFERENCES entidades(id),
      FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id)
    );

    -- MÓDULO CONTAS PESSOAIS
    CREATE TABLE IF NOT EXISTS contas_pessoais (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      tipo_conta TEXT,
      descricao TEXT NOT NULL,
      saldo_inicial REAL DEFAULT 0,
      data_abertura TEXT,
      status TEXT DEFAULT 'ativa',
      observacoes TEXT,
      criado_em TEXT,
      FOREIGN KEY (entidade_id) REFERENCES entidades(id)
    );

    CREATE TABLE IF NOT EXISTS movimentos_pessoais (
      id INTEGER PRIMARY KEY,
      conta_pessoal_id INTEGER NOT NULL,
      entidade_id INTEGER NOT NULL,
      periodo_id INTEGER NOT NULL,
      data_movimento TEXT,
      descricao TEXT,
      tipo_movimento TEXT,
      valor REAL NOT NULL,
      categoria TEXT,
      referencia_documento TEXT,
      observacoes TEXT,
      criado_em TEXT,
      FOREIGN KEY (conta_pessoal_id) REFERENCES contas_pessoais(id),
      FOREIGN KEY (entidade_id) REFERENCES entidades(id),
      FOREIGN KEY (periodo_id) REFERENCES periodos_contabeis(id)
    );

    -- MÓDULO GESTÃO DE IMÓVEIS EXPANDIDO
    CREATE TABLE IF NOT EXISTS imovel_documentos (
      id INTEGER PRIMARY KEY,
      imovel_id INTEGER NOT NULL,
      tipo_documento TEXT,
      numero_documento TEXT,
      data_documento TEXT,
      data_vencimento TEXT,
      arquivo_url TEXT,
      status TEXT DEFAULT 'vigente',
      observacoes TEXT,
      criado_em TEXT,
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id)
    );

    CREATE TABLE IF NOT EXISTS vistorias (
      id INTEGER PRIMARY KEY,
      imovel_id INTEGER NOT NULL,
      data_vistoria TEXT NOT NULL,
      tipo_vistoria TEXT,
      responsavel TEXT,
      descricao TEXT,
      status_imovel TEXT,
      observacoes TEXT,
      criado_em TEXT,
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id)
    );

    CREATE TABLE IF NOT EXISTS itens_vistoria (
      id INTEGER PRIMARY KEY,
      vistoria_id INTEGER NOT NULL,
      descricao_item TEXT,
      condicao TEXT,
      necessidade_reparo INTEGER DEFAULT 0,
      custo_estimado REAL DEFAULT 0,
      prioridade TEXT,
      FOREIGN KEY (vistoria_id) REFERENCES vistorias(id)
    );

    CREATE TABLE IF NOT EXISTS manutencoes (
      id INTEGER PRIMARY KEY,
      imovel_id INTEGER NOT NULL,
      data_manutencao TEXT,
      tipo_manutencao TEXT,
      descricao TEXT,
      prestador_servico TEXT,
      valor_manutencao REAL NOT NULL,
      status TEXT DEFAULT 'pendente',
      data_conclusao TEXT,
      observacoes TEXT,
      criado_em TEXT,
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id)
    );

    CREATE TABLE IF NOT EXISTS despesas_operacionais_agendadas (
      id INTEGER PRIMARY KEY,
      imovel_id INTEGER NOT NULL,
      entidade_id INTEGER NOT NULL,
      tipo_despesa TEXT,
      descricao TEXT,
      valor_mensal REAL,
      dia_vencimento INTEGER,
      data_inicio TEXT,
      data_fim TEXT,
      status TEXT DEFAULT 'ativa',
      observacoes TEXT,
      criado_em TEXT,
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id),
      FOREIGN KEY (entidade_id) REFERENCES entidades(id)
    );

    CREATE TABLE IF NOT EXISTS inquilinos (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      imovel_id INTEGER NOT NULL,
      contrato_id INTEGER,
      nome_completo TEXT NOT NULL,
      cpf TEXT,
      email TEXT,
      telefone TEXT,
      data_admissao TEXT,
      data_saida TEXT,
      status TEXT DEFAULT 'ativo',
      observacoes TEXT,
      criado_em TEXT,
      FOREIGN KEY (entidade_id) REFERENCES entidades(id),
      FOREIGN KEY (imovel_id) REFERENCES imoveis(id),
      FOREIGN KEY (contrato_id) REFERENCES contratos_locacao(id)
    );

    -- MÓDULO INTEGRAÇÃO SKILLOS
    CREATE TABLE IF NOT EXISTS skillos_log (
      id INTEGER PRIMARY KEY,
      skillos_ref_id TEXT UNIQUE NOT NULL,
      lucide_tabela TEXT NOT NULL,
      lucide_id INTEGER,
      tipo_evento TEXT NOT NULL,
      dados_json TEXT,
      status TEXT DEFAULT 'pendente',
      tentativas INTEGER DEFAULT 0,
      criado_em TEXT NOT NULL,
      sincronizado_em TEXT
    );

    -- MÓDULO APROVAÇÃO DE DOCUMENTOS
    CREATE TABLE IF NOT EXISTS approval_requests (
      id TEXT PRIMARY KEY,
      documento_id INTEGER NOT NULL,
      tipo_documento TEXT NOT NULL,
      entidade_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      descricao TEXT NOT NULL,
      solicitante_id INTEGER NOT NULL,
      data_criacao TEXT NOT NULL,
      status TEXT DEFAULT 'draft'
    );

    CREATE TABLE IF NOT EXISTS approval_steps (
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
    );

    CREATE TABLE IF NOT EXISTS approval_notifications (
      id TEXT PRIMARY KEY,
      request_id TEXT NOT NULL,
      responsavel_id INTEGER,
      tipo TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      data_envio TEXT NOT NULL,
      lido INTEGER DEFAULT 0,
      FOREIGN KEY (request_id) REFERENCES approval_requests(id)
    );

    -- MÓDULO PAGAMENTOS
    CREATE TABLE IF NOT EXISTS pagamentos (
      id TEXT PRIMARY KEY,
      entidade_id INTEGER NOT NULL,
      valor REAL NOT NULL,
      descricao TEXT NOT NULL,
      tipo_pagamento TEXT NOT NULL,
      metodo_pagamento TEXT NOT NULL,
      status TEXT DEFAULT 'pendente',
      beneficiario TEXT NOT NULL,
      referencia TEXT NOT NULL,
      data_criacao TEXT NOT NULL,
      data_agendado TEXT,
      data_processamento TEXT,
      data_conclusao TEXT,
      tentativas INTEGER DEFAULT 0,
      ultimo_erro TEXT,
      -- Guarda de idempotência: preenchido quando o pagamento já virou lançamento
      -- contábil, e conferido antes de lançar de novo (pagamentos-ledger-integration.ts
      -- linhas 270 e 418). Sem a coluna o guard nem chegava a ser avaliado.
      ledger_entry_id INTEGER,
      reconciliacao_status TEXT DEFAULT 'nao_reconciliado',
      reconciliado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS pagamento_tentativas (
      id TEXT PRIMARY KEY,
      payment_id TEXT NOT NULL,
      data_tentativa TEXT NOT NULL,
      resultado TEXT NOT NULL,
      mensagem TEXT NOT NULL,
      codigo_retorno TEXT,
      FOREIGN KEY (payment_id) REFERENCES pagamentos(id)
    );

    -- MÓDULO INTEGRAÇÃO ADVOCACIA-LEDGER (PHASE 4-7)
    CREATE TABLE IF NOT EXISTS sincronizacoes_advocacia_ledger (
      id INTEGER PRIMARY KEY,
      despesa_legal_id INTEGER,
      processo_id INTEGER,
      ledger_entry_id INTEGER,
      tipo_registro TEXT NOT NULL,
      tipo_despesa TEXT,
      origem_modulo TEXT DEFAULT 'advocacia',
      status TEXT DEFAULT 'sucesso',
      hash_provenance TEXT,
      mensagem_erro TEXT,
      criado_em TEXT,
      tentativas INTEGER DEFAULT 1
    );

    -- MÓDULO CONTAS PESSOAIS-LEDGER: as tabelas vêm de __migrations__, carregadas
    -- ao final desta função. Não recrie aqui — foi exatamente essa cópia paralela
    -- que derivou da migration e quebrou a suíte.

    -- Log de auditoria de compliance (compliance-audit-log.ts). Faltava no fixture,
    -- de modo que registrarChamadaAPI gravava no vazio e o relatório saía sempre zerado.
    CREATE TABLE IF NOT EXISTS auditoria_log (
      id INTEGER PRIMARY KEY,
      timestamp TEXT,
      usuario_id INTEGER,
      usuario_nome TEXT,
      ip_origem TEXT,
      modulo_chamador TEXT,
      tipo_operacao TEXT,
      entidade_afetada TEXT,
      id_entidade INTEGER,
      descricao_alteracao TEXT,
      valor_anterior TEXT,
      valor_novo TEXT,
      hash_sha256 TEXT,
      hash_anterior TEXT,
      status TEXT,
      mensagem_erro TEXT,
      tempo_processamento_ms INTEGER,
      retencao_ate TEXT,
      assinado INTEGER DEFAULT 0,
      assinatura_digital TEXT,
      criado_em TEXT
    );

    -- Pagamentos PIX (open banking). Faltava no fixture, e como
    -- initiarPagamentoPIX engole o erro do INSERT num catch, a falha passava calada:
    -- a função devolvia o pagamento como iniciado sem ter gravado nada.
    -- FIXME: esse catch silencioso merece revisão — iniciar pagamento e não registrar
    -- não deveria ser indistinguível de sucesso.
    CREATE TABLE IF NOT EXISTS pagamentos_pix (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      periodo_id INTEGER,
      txid TEXT UNIQUE,
      chave_pix TEXT,
      valor REAL,
      beneficiario TEXT,
      descricao TEXT,
      data_solicitacao TEXT,
      data_confirmacao TEXT,
      status TEXT DEFAULT 'solicitado',
      criado_em TEXT
    );

    -- MÓDULO PAGAMENTOS-LEDGER (PHASE 4-7)
    -- payment_id em inglês, e não pagamento_id, porque é assim que
    -- pagamentos-ledger-integration.ts grava e lê (4 ocorrências, nenhuma em
    -- português). Sem schema de produção para esta tabela, o código é o contrato.
    CREATE TABLE IF NOT EXISTS sincronizacoes_pagamentos_ledger (
      id INTEGER PRIMARY KEY,
      payment_id TEXT,
      ledger_entry_id INTEGER,
      tipo_pagamento TEXT,
      valor REAL,
      status TEXT DEFAULT 'sucesso',
      hash_provenance TEXT,
      mensagem_erro TEXT,
      tentativas INTEGER DEFAULT 1,
      criado_em TEXT
    );

    -- MÓDULO TRANSAÇÕES INTEGRADAS (PHASE 4-7)
    -- Colunas conforme o INSERT de core.ts (entidade, período, centro de custo, conta,
    -- data, descrição, valor, tipo, origem, referência, auditada, criação).
    CREATE TABLE IF NOT EXISTS transacoes_integradas (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      periodo_id INTEGER,
      centro_custo_id INTEGER,
      conta_id INTEGER,
      data TEXT,
      descricao TEXT,
      tipo TEXT,
      valor REAL,
      origem_modulo TEXT,
      origem_id INTEGER,
      referencia_documento TEXT,
      auditada INTEGER DEFAULT 0,
      hash_provenance TEXT,
      criado_em TEXT
    );

    -- MÓDULO RETIFICAÇÃO (PHASE 4-7)
    -- Espelha server/migrations/002_retificacao_ledger_mapping.sql, que é o schema que
    -- ledger.ts grava (retificacao_id, ledger_entry_reverso_id, ledger_entry_novo_id).
    -- O fixture tinha inventado ledger_entry_original_id/_retificacao_id, e o INSERT do
    -- código falhava — a retificação era abortada e o teste via só a mensagem de erro.
    CREATE TABLE IF NOT EXISTS retificacao_ledger_mapping (
      id INTEGER PRIMARY KEY,
      retificacao_id INTEGER NOT NULL,
      ledger_entry_reverso_id INTEGER NOT NULL,
      ledger_entry_novo_id INTEGER NOT NULL,
      criado_em TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE (retificacao_id, ledger_entry_reverso_id, ledger_entry_novo_id)
    );

    -- MÓDULO APONTAMENTOS (PHASE 4-7)
    -- Apontamentos do prestador, por tipo de serviço. Estas cinco tabelas e
    -- memorias_reajuste/emprestimos_parcelas abaixo são consultadas por
    -- relatorios-apontamento.ts e não existem em schema.sql nem em migration nenhuma:
    -- o módulo nunca teve onde rodar. As colunas aqui são o contrato que as próprias
    -- consultas daquele arquivo exigem.
    -- FIXME: promover a uma migration de verdade — enquanto o schema só existir no
    -- fixture, o módulo continua sem poder rodar fora do teste.
    CREATE TABLE IF NOT EXISTS apontamentos_urgencia (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      periodo_id INTEGER,
      prestador_id INTEGER,
      data TEXT,
      valor_total REAL,
      minutos_trabalhados INTEGER,
      eh_domingo INTEGER DEFAULT 0,
      descricao TEXT,
      status TEXT DEFAULT 'aberto',
      prioridade TEXT,
      criado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS apontamentos_airbnb (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      periodo_id INTEGER,
      prestador_id INTEGER,
      data TEXT,
      tipo_servico TEXT,
      numero_quartos INTEGER,
      valor_total REAL,
      criado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS apontamentos_combustivel (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      periodo_id INTEGER,
      prestador_id INTEGER,
      data TEXT,
      km_percorrido REAL,
      valor_litro REAL,
      valor_total REAL,
      criado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS apontamentos_horas (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      periodo_id INTEGER,
      prestador_id INTEGER,
      data TEXT,
      horas_efetivas REAL,
      valor_hora REAL,
      valor_total REAL,
      criado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS emprestimos_parcelas (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      periodo_id INTEGER,
      emprestimo_id INTEGER,
      numero INTEGER,
      data_vencimento TEXT,
      principal REAL,
      juros REAL,
      valor_parcela REAL,
      status TEXT DEFAULT 'aberta',
      criado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS memorias_reajuste (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      periodo_id INTEGER,
      prestador_id INTEGER,
      tipo_item TEXT,
      valor_anterior REAL,
      indice_ipca REAL,
      valor_novo REAL,
      data_reajuste TEXT,
      criado_em TEXT
    );

    -- MÓDULO PESSOAS E PRESTADORES (PHASE 4-7)
    CREATE TABLE IF NOT EXISTS pessoas (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      nome TEXT,
      tipo_pessoa TEXT,
      documento TEXT,
      criado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS prestadores (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      nome TEXT,
      tipo_servico TEXT,
      documento TEXT,
      criado_em TEXT
    );

    -- ATENÇÃO: "reembolsos" hoje carrega dois conceitos diferentes com o mesmo nome.
    --   1) reembolso de despesa do prestador — lido por relatorios-apontamento.ts
    --      (valor_solicitado/valor_aprovado, tipo_despesa, prestador_id);
    --   2) estorno de um pagamento — gravado por pagamentos-*.ts
    --      (pagamento_original_id, valor_reembolso, motivo).
    -- As colunas abaixo são a união das duas, para os dois módulos rodarem. A separação
    -- em duas tabelas é mudança de modelagem de produção, fora do alcance de corrigir
    -- a suíte; enquanto não acontecer, uma linha só faz sentido para um dos usos.
    CREATE TABLE IF NOT EXISTS reembolsos (
      id INTEGER PRIMARY KEY,
      entidade_id INTEGER,
      periodo_id INTEGER,
      prestador_id INTEGER,
      data_solicitacao TEXT,
      tipo_despesa TEXT,
      valor_solicitado REAL,
      valor_aprovado REAL,
      justificativa TEXT,
      observacoes TEXT,
      pagamento_original_id INTEGER,
      valor_reembolso REAL,
      motivo TEXT,
      data_processamento TEXT,
      valor REAL,
      descricao TEXT,
      status TEXT DEFAULT 'pendente',
      criado_em TEXT
    );
  `);

  aplicarMigrations(db);

  // Inserir dados de teste
  const entidade_id = 1;
  const periodo_id = 1;

  db.run(
    `INSERT INTO entidades (id, nome, tipo) VALUES (?, ?, ?)`,
    [entidade_id, "Teste Entity", "PJ"]
  );

  db.run(
    `INSERT INTO periodos_contabeis (id, entidade_id, ano, mes, status) VALUES (?, ?, ?, ?, ?)`,
    [periodo_id, entidade_id, 2026, 1, "aberto"]
  );

  // Criar plano de contas básico
  // Plano autoritativo do ERP (planoDeContasErp.ts) primeiro: é a fonte única, e é
  // contra ele que os módulos referenciam conta por número. O bloco abaixo só acrescenta
  // contas extras de teste, e NÃO pode redefinir nenhum código dele — foi assim que
  // surgiram as duas colisões (faixa 5 como receita, 4.1.01 como Capital Social).
  garantirPlanoDeContasErp(db, entidade_id);

  const contasPadrao = [
    // Ativo
    ["1.1.01", "Caixa", "ativo", "debito"],
    ["1.1.02", "Conta Bancária", "ativo", "debito"],
    ["1.1.03", "Aplicações Financeiras", "ativo", "debito"],

    // Passivo
    ["3.1.01", "Fornecedores", "passivo", "credito"],
    ["3.1.02", "Salários a Pagar", "passivo", "credito"],
    ["3.2.01", "Empréstimos de Longo Prazo", "passivo", "credito"],

    // Patrimônio Líquido

    // Receitas

    // Despesas
    ["6.1.01", "Condomínio", "despesa", "debito"],
    ["6.1.02", "Água e Esgoto", "despesa", "debito"],
    ["6.1.03", "Eletricidade", "despesa", "debito"],
    ["6.1.04", "Internet", "despesa", "debito"],
    ["6.1.05", "Manutenção", "despesa", "debito"],
    ["6.1.06", "Limpeza", "despesa", "debito"],
    ["6.1.07", "Seguros", "despesa", "debito"],
    ["6.2.01", "Depreciação", "despesa", "debito"],
    ["6.3.01", "Despesa com Honorários Advocatícios", "despesa", "debito"],
    ["6.3.02", "Despesa com Custas Judiciais", "despesa", "debito"],
    ["6.3.03", "Despesa com Perícia", "despesa", "debito"],
    ["6.3.04", "Outras Despesas com Processos Legais", "despesa", "debito"],
    ["6.4.01", "Provisão para Processos Legais", "despesa", "debito"],

    // Contas que os módulos do ERP referenciam por id fixo (MAPEAMENTO_*_LEDGER,
    // CONTA_CAIXA e afins) e que faltavam no plano. Sem elas, o lançamento ia para uma
    // conta inexistente e obterSaldoConta caía no default "debito" — passivo baixado
    // aparecia com o sinal trocado, sem nada acusar o erro.
    // ATENÇÃO: os módulos usam 5.2.xx como DESPESA, enquanto este plano usa a faixa 5
    // como RECEITA (5.1.01 Aluguel). A colisão é do código de produção; aqui as contas
    // entram com a natureza que o uso exige, senão os saldos saem invertidos.
    ["1.1.05", "Contas Correntes Pessoais", "ativo", "debito"],
    ["1.2.05", "Imóveis (Ativo Imobilizado)", "ativo", "debito"],
    ["3.1.05", "Remuneração a Pagar", "passivo", "credito"],
    ["5.1.05", "Aluguel (despesa alocada)", "despesa", "debito"],
    ["5.2.05", "Despesa com Manutenção", "despesa", "debito"],
    ["5.2.06", "Despesa com Energia", "despesa", "debito"],
    ["5.2.07", "Despesa com Água", "despesa", "debito"],
    ["5.2.10", "Despesa com Condomínio", "despesa", "debito"],
    ["5.2.12", "Despesa com Internet/Telecomunicações", "despesa", "debito"],
    ["5.2.13", "Despesa com Seguros", "despesa", "debito"],
    ["5.2.14", "Outras Despesas com Imóveis", "despesa", "debito"],
    ["6.2.02", "Despesas com Utilidades", "despesa", "debito"],
  ];

  // Mapeamento de códigos para IDs esperados pela lógica de negócios
  const codigoParaId: Record<string, number> = {
    "1.1.01": 1101, "1.1.02": 1102, "1.1.03": 1103,
    "3.1.01": 3101, "3.1.02": 3102, "3.2.01": 3201,
    "6.1.01": 6101, "6.1.02": 6102, "6.1.03": 6103, "6.1.04": 6104, "6.1.05": 6105, "6.1.06": 6106, "6.1.07": 6107,
    "6.2.01": 6201,
    "6.3.01": 6301, "6.3.02": 6302, "6.3.03": 6303, "6.3.04": 6304,
    "6.4.01": 6401,
    "1.1.05": 1105,
    "1.2.05": 1205,
    "3.1.05": 3105,
    "5.1.05": 5105,
    "5.2.05": 5205,
    "5.2.06": 5206,
    "5.2.07": 5207,
    "5.2.10": 5210,
    "5.2.12": 5212,
    "5.2.13": 5213,
    "5.2.14": 5214,
    "6.2.02": 6202,
  };

  for (const [codigo, desc, grupo, natureza] of contasPadrao) {
    // Id fixo e derivado do código: os testes referenciam contas por esse número
    // (obterSaldoConta(db, periodo, 3102)). O fallback anterior era Math.random()*10000,
    // que produzia id float e diferente a cada execução — uma conta nova esquecida no
    // mapa viraria falha intermitente em vez de erro claro.
    const id = codigoParaId[codigo];
    if (id === undefined) throw new Error(`Conta ${codigo} não tem id fixo em codigoParaId — acrescente antes de semeá-la`);
    // INSERT OR IGNORE: o plano autoritativo do ERP já foi semeado acima e é quem manda.
    // Este bloco só acrescenta contas extras de teste; se um código já existe lá, a
    // definição de lá prevalece, em vez de o fixture redefini-la com outro significado.
    db.run(
      `INSERT OR IGNORE INTO contas_plano_contas (id, entidade_id, codigo, descricao, grupo, natureza) VALUES (?, ?, ?, ?, ?, ?)`,
      [id, entidade_id, codigo, desc, grupo, natureza]
    );
  }

  // Inserir dados de teste (ledger_entries)
  // Receita de aluguel
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_credito, data_lancamento, origem_modulo, origem_id, referencia_documento)
     SELECT ?, ?, id, 'Aluguel - janeiro', 15000, '2026-01-01', 'manual', 1, 'TEST001'
     FROM contas_plano_contas WHERE codigo = '4.1.01'`,
    [entidade_id, periodo_id]
  );

  // Receita de rateios
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_credito, data_lancamento, origem_modulo, origem_id, referencia_documento)
     SELECT ?, ?, id, 'Rateios - janeiro', 3000, '2026-01-05', 'manual', 2, 'TEST002'
     FROM contas_plano_contas WHERE codigo = '4.1.02'`,
    [entidade_id, periodo_id]
  );

  // Despesa de condomínio
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_debito, data_lancamento, origem_modulo, origem_id, referencia_documento)
     SELECT ?, ?, id, 'Condomínio - janeiro', 2000, '2026-01-10', 'manual', 3, 'TEST003'
     FROM contas_plano_contas WHERE codigo = '5.2.10'`,
    [entidade_id, periodo_id]
  );

  // Despesa de manutenção
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_debito, data_lancamento, origem_modulo, origem_id, referencia_documento)
     SELECT ?, ?, id, 'Manutenção - janeiro', 800, '2026-01-15', 'manual', 4, 'TEST004'
     FROM contas_plano_contas WHERE codigo = '5.2.05'`,
    [entidade_id, periodo_id]
  );

  // Caixa inicial
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_debito, data_lancamento, origem_modulo, origem_id, referencia_documento)
     SELECT ?, ?, id, 'Saldo inicial - caixa', 10000, '2026-01-01', 'manual', 5, 'TEST005'
     FROM contas_plano_contas WHERE codigo = '1.1.01'`,
    [entidade_id, periodo_id]
  );

  // Contrapartidas. Os lançamentos acima eram de perna única: receita creditada sem
  // débito, despesa debitada sem crédito, caixa aberto sem origem. O período ficava
  // 5.200 fora de balanço e, como encerrarPeriodo recusa período desbalanceado (e faz
  // bem), nenhum teste de fechamento conseguia chegar ao que queria verificar.
  const contrapartidas: [string, string, string, number, string][] = [
    // [código, descrição, coluna, valor, referência]
    ["1.1.01", "Recebimento aluguel - janeiro", "valor_debito", 15000, "TEST001C"],
    ["1.1.01", "Recebimento rateios - janeiro", "valor_debito", 3000, "TEST002C"],
    ["1.1.01", "Pagamento condomínio - janeiro", "valor_credito", 2000, "TEST003C"],
    ["1.1.01", "Pagamento manutenção - janeiro", "valor_credito", 800, "TEST004C"],
    ["4.1.01", "Integralização - caixa inicial", "valor_credito", 10000, "TEST005C"],
  ];
  contrapartidas.forEach(([codigo, descricao, coluna, valor, referencia], i) => {
    db.run(
      `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, ${coluna}, data_lancamento, origem_modulo, origem_id, referencia_documento)
       SELECT ?, ?, id, ?, ?, '2026-01-15', 'manual', ?, ?
       FROM contas_plano_contas WHERE codigo = ?`,
      [entidade_id, periodo_id, descricao, valor, 100 + i, referencia, codigo]
    );
  });

  // Ativo imóvel
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_debito, data_lancamento, origem_modulo, origem_id, referencia_documento)
     SELECT ?, ?, id, 'Aquisição imóvel', 500000, '2025-12-15', 'manual', 6, 'TEST006'
     FROM contas_plano_contas WHERE codigo = '2.1.01'`,
    [entidade_id, periodo_id]
  );

  // Capital social
  db.run(
    `INSERT INTO ledger_entries (entidade_id, periodo_id, conta_id, descricao, valor_credito, data_lancamento, origem_modulo, origem_id, referencia_documento)
     SELECT ?, ?, id, 'Capital - integralização', 500000, '2025-12-01', 'manual', 7, 'TEST007'
     FROM contas_plano_contas WHERE codigo = '4.1.01'`,
    [entidade_id, periodo_id]
  );

  // Inserir dados de imoveis
  db.run(
    `INSERT INTO imoveis (id, entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [1, entidade_id, "Rua Principal 123, Apto 101", "apartamento", 0, 0, 300000]
  );

  db.run(
    `INSERT INTO imoveis (id, entidade_id, endereco, tipo_imovel, uso_pessoal, financiado, valor_aquisicao) VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [2, entidade_id, "Rua Principal 123, Apto 102", "apartamento", 0, 0, 350000]
  );

  // Inserir dados de contratos_locacao
  db.run(
    `INSERT INTO contratos_locacao (id, entidade_id, imovel_id, valor_aluguel, valor_referencia, data_inicio, data_fim, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, entidade_id, 1, 2000, 2000, "2025-01-01", "2026-12-31", "ativo"]
  );

  db.run(
    `INSERT INTO contratos_locacao (id, entidade_id, imovel_id, valor_aluguel, valor_referencia, data_inicio, data_fim, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [2, entidade_id, 2, 2500, 2500, "2025-06-01", "2026-12-31", "ativo"]
  );

  // Inserir dados de transacoes_auditoria
  db.run(
    `INSERT INTO transacoes_auditoria (id, entidade_id, periodo_id, tipo, descricao, status)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [1, entidade_id, periodo_id, "lancamento", "Auditoria de lançamentos", "pendente"]
  );

  // ===== DADOS DE TESTE: MÓDULO ADVOCACIA =====
  // Inserir processo legal
  db.run(
    `INSERT INTO processos_legais (id, entidade_id, numero_processo, tipo, descricao, data_ajuizamento, status, foro, nivel_hierarquia, valor_causa, risco_potencial, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, entidade_id, "0001234-89.2024.8.26.0100", "cobrança", "Ação de cobrança contra inquilino", "2024-06-15", "ativo", "São Paulo", 1, 15000, "médio", "2026-01-01"]
  );

  // Inserir partes do processo
  db.run(
    `INSERT INTO partes_processo (id, processo_id, tipo_parte, nome_parte, contato)
     VALUES (?, ?, ?, ?, ?)`,
    [1, 1, "autor", "Proprietário PJ", "proprietario@email.com"]
  );

  db.run(
    `INSERT INTO partes_processo (id, processo_id, tipo_parte, nome_parte)
     VALUES (?, ?, ?, ?)`,
    [2, 1, "réu", "João da Silva"]
  );

  // Inserir despesas legais
  db.run(
    `INSERT INTO despesas_legais (id, processo_id, entidade_id, periodo_id, data_lancamento, tipo_despesa, descricao, valor_despesa, beneficiario, referencia_documento, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, 1, entidade_id, periodo_id, "2026-01-10", "honorarios_advocaticios", "Honorários causa cobrança", 2500, "Dr. Advogado Silva", "NOTA001", "2026-01-10"]
  );

  db.run(
    `INSERT INTO despesas_legais (id, processo_id, entidade_id, periodo_id, data_lancamento, tipo_despesa, descricao, valor_despesa, beneficiario, referencia_documento, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [2, 1, entidade_id, periodo_id, "2026-01-11", "custas_judiciais", "Custas processuais", 1500, "Tribunal", "CUSTAS_001", "2026-01-11"]
  );

  db.run(
    `INSERT INTO despesas_legais (id, processo_id, entidade_id, periodo_id, data_lancamento, tipo_despesa, descricao, valor_despesa, beneficiario, referencia_documento, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [3, 1, entidade_id, periodo_id, "2026-01-12", "pericia", "Perícia técnica", 3000, "Perito João", "PERICIA_001", "2026-01-12"]
  );

  // ===== DADOS DE TESTE: MÓDULO CONTAS PESSOAIS =====
  // Inserir conta pessoal
  db.run(
    `INSERT INTO contas_pessoais (id, entidade_id, tipo_conta, descricao, saldo_inicial, data_abertura, status)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [1, entidade_id, "conta_corrente_pessoal", "Conta pessoal Banco X", 500, "2020-01-01", "ativa"]
  );

  // ===== DADOS DE TESTE: MÓDULO GESTÃO DE IMÓVEIS =====
  // Inserir documento de imóvel (Escritura)
  db.run(
    `INSERT INTO imovel_documentos (id, imovel_id, tipo_documento, numero_documento, data_documento, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [1, 1, "escritura", "123456-789", "2020-05-10", "vigente", "2026-01-01"]
  );

  // Inserir documento de imóvel (IPTU)
  db.run(
    `INSERT INTO imovel_documentos (id, imovel_id, tipo_documento, numero_documento, data_vencimento, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [2, 1, "iptu", "12345-67890-12", "2026-12-31", "vigente", "2026-01-01"]
  );

  // Inserir vistoria
  db.run(
    `INSERT INTO vistorias (id, imovel_id, data_vistoria, tipo_vistoria, responsavel, descricao, status_imovel, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, 1, "2026-01-15", "de_entrada", "Gerente Imóvel", "Vistoria de entrada - sem danos aparentes", "bom", "2026-01-15"]
  );

  // Inserir itens da vistoria
  db.run(
    `INSERT INTO itens_vistoria (id, vistoria_id, descricao_item, condicao, necessidade_reparo)
     VALUES (?, ?, ?, ?, ?)`,
    [1, 1, "Pintura", "boa", 0]
  );

  db.run(
    `INSERT INTO itens_vistoria (id, vistoria_id, descricao_item, condicao, necessidade_reparo, custo_estimado, prioridade)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [2, 1, "Tomada danificada", "ruim", 1, 150, "média"]
  );

  // Inserir manutenção
  db.run(
    `INSERT INTO manutencoes (id, imovel_id, data_manutencao, tipo_manutencao, descricao, prestador_servico, valor_manutencao, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, 1, "2026-01-20", "eletrica", "Reparo tomada danificada", "Eletricista João", 150, "concluida", "2026-01-20"]
  );

  // Inserir despesa operacional agendada
  db.run(
    `INSERT INTO despesas_operacionais_agendadas (id, imovel_id, entidade_id, tipo_despesa, descricao, valor_mensal, dia_vencimento, data_inicio, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, 1, entidade_id, "condominio", "Condomínio - Apto 101", 1500, 10, "2025-01-01", "ativa", "2025-01-01"]
  );

  db.run(
    `INSERT INTO despesas_operacionais_agendadas (id, imovel_id, entidade_id, tipo_despesa, descricao, valor_mensal, dia_vencimento, data_inicio, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [2, 1, entidade_id, "agua", "Água e esgoto", 150, 20, "2025-01-01", "ativa", "2025-01-01"]
  );

  // Inserir inquilino
  db.run(
    `INSERT INTO inquilinos (id, entidade_id, imovel_id, contrato_id, nome_completo, cpf, email, data_admissao, status, criado_em)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [1, entidade_id, 1, 1, "João da Silva", "123.456.789-00", "joao@email.com", "2025-01-01", "ativo", "2025-01-01"]
  );

  return { db, entidade_id, periodo_id };
}
