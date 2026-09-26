import { describe, expect, it } from "vitest";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { listarHistoricoDoRegistro } from "../auditoria/logAlteracoes";
import {
  registrarSolicitacao,
  buscarDadosPessoaisPorCpf,
  atenderAcesso,
  atenderPortabilidade,
  atenderExclusao,
  atenderCorrecao,
} from "./direitosTitular";

const CPF_TITULAR = "111.111.111-11";

/** Semeia um imóvel + contrato de locação + contrato_locatarios com o CPF dado — a fonte
 * mais comum de dado pessoal espalhado no schema real. `dataFimContrato` controla a
 * tensão de retenção: null = contrato ainda vigente (sempre retido); uma data = contrato
 * encerrado naquela data. */
function seedContratoComLocatario(dataFimContrato: string | null = null) {
  return (db: Awaited<ReturnType<typeof criarBancoDeTeste>>) => {
    executar(db, "INSERT INTO imoveis (id, apelido, tipo) VALUES (1, 'Kitnet 1', 'kitnet')");
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
       VALUES (1, 1, 'Fulano de Tal', 'residencial_fixo', 1000, '2020-01-01', ?)`,
      [dataFimContrato],
    );
    executar(
      db,
      `INSERT INTO contrato_locatarios (id, contrato_id, nome, cpf, papel, telefone, email)
       VALUES (1, 1, 'Fulano de Tal', ?, 'locatario', '48999990000', 'fulano@example.com')`,
      [CPF_TITULAR],
    );
  };
}

/** Semeia um documento (recibo/nota) referenciando o CPF via `cnpj_cpf_contraparte`.
 * `dataDocumento` controla a tensão de retenção do mesmo jeito que o contrato acima. */
function seedDocumento(dataDocumento: string) {
  return (db: Awaited<ReturnType<typeof criarBancoDeTeste>>) => {
    executar(
      db,
      `INSERT INTO documentos (id, tipo, arquivo_nome, valor, data_documento, cnpj_cpf_contraparte, nome_contraparte, criado_em)
       VALUES (1, 'recibo', 'recibo.pdf', 500, ?, ?, 'Fulano de Tal', '2020-01-01')`,
      [dataDocumento, CPF_TITULAR],
    );
  };
}

describe("direitosTitular: registrarSolicitacao", () => {
  it("cria a solicitação sempre como 'pendente', sem data_atendimento", async () => {
    const db = await criarBancoDeTeste();
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano de Tal", titular_cpf: CPF_TITULAR, tipo: "acesso" });

    expect(solicitacao.id).toBeDefined();
    expect(solicitacao.status).toBe("pendente");
    expect(solicitacao.data_atendimento).toBeNull();
    expect(solicitacao.data_solicitacao).toBeTruthy();
  });
});

describe("direitosTitular: buscarDadosPessoaisPorCpf — dado REAL espalhado pelo sistema", () => {
  it("encontra o mesmo CPF em contrato_locatarios E documentos ao mesmo tempo", async () => {
    const db = await criarBancoDeTeste();
    seedContratoComLocatario()(db);
    seedDocumento("2024-01-01")(db);

    const registros = buscarDadosPessoaisPorCpf(db, CPF_TITULAR);
    const tabelas = registros.map((r) => r.tabela).sort();
    expect(tabelas).toEqual(["contrato_locatarios", "documentos"]);
  });

  it("CPF desconhecido do sistema não encontra nada (não fabrica registro)", async () => {
    const db = await criarBancoDeTeste();
    seedContratoComLocatario()(db);
    expect(buscarDadosPessoaisPorCpf(db, "999.999.999-99")).toHaveLength(0);
  });

  it("encontra dado pessoal nos domínios reconstruídos em paralelo (Contas Pessoais: pessoas; Advocacia: partes_processo), quando essas tabelas existem no schema", async () => {
    const db = await criarBancoDeTeste();
    expect(consultar(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'pessoas'").length).toBeGreaterThan(0);
    expect(consultar(db, "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'partes_processo'").length).toBeGreaterThan(0);

    executar(db, "INSERT INTO pessoas (id, nome, cpf, tipo_relacao) VALUES (1, 'Fulano de Tal', ?, 'socio')", [CPF_TITULAR]);

    executar(db, "INSERT INTO entidades_legais (id, tipo, cpf_cnpj, nome) VALUES (1, 'pessoa_fisica', '222.222.222-22', 'Titular do Sistema')");
    executar(db, "INSERT INTO processos_legais (id, entidade_id, tipo, status) VALUES (1, 1, 'civel', 'encerrado')");
    executar(
      db,
      "INSERT INTO partes_processo (id, processo_id, papel, nome, cpf_cnpj) VALUES (1, 1, 'reu', 'Fulano de Tal', ?)",
      [CPF_TITULAR],
    );

    const registros = buscarDadosPessoaisPorCpf(db, CPF_TITULAR);
    const tabelas = registros.map((r) => r.tabela).sort();
    expect(tabelas).toEqual(["partes_processo", "pessoas"]);
  });
});

describe("direitosTitular: atenderAcesso / atenderPortabilidade", () => {
  it("atenderAcesso retorna os dados reais encontrados e marca a solicitação como atendida", async () => {
    const db = await criarBancoDeTeste();
    seedContratoComLocatario()(db);
    seedDocumento("2024-01-01")(db);
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano de Tal", titular_cpf: CPF_TITULAR, tipo: "acesso" });

    const resultado = atenderAcesso(db, solicitacao.id, CPF_TITULAR);

    expect(resultado.registros).toHaveLength(2);
    expect(resultado.solicitacao.status).toBe("atendida");
    expect(resultado.solicitacao.data_atendimento).toBeTruthy();
    expect(resultado.solicitacao.detalhes).toContain("2 registro(s)");
  });

  it("atenderAcesso recusa atender uma solicitação que não é do tipo 'acesso'", async () => {
    const db = await criarBancoDeTeste();
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano", titular_cpf: CPF_TITULAR, tipo: "correcao" });
    expect(() => atenderAcesso(db, solicitacao.id, CPF_TITULAR)).toThrow(/não é|tipo/i);
  });

  it("atenderAcesso recusa CPF que não bate com o titular da solicitação", async () => {
    const db = await criarBancoDeTeste();
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano", titular_cpf: CPF_TITULAR, tipo: "acesso" });
    expect(() => atenderAcesso(db, solicitacao.id, "outro-cpf")).toThrow(/CPF/i);
  });

  it("uma solicitação já atendida não pode ser atendida de novo", async () => {
    const db = await criarBancoDeTeste();
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano", titular_cpf: CPF_TITULAR, tipo: "acesso" });
    atenderAcesso(db, solicitacao.id, CPF_TITULAR);
    expect(() => atenderAcesso(db, solicitacao.id, CPF_TITULAR)).toThrow(/já foi/i);
  });

  it("atenderPortabilidade produz um export JSON parseável com os mesmos registros do acesso", async () => {
    const db = await criarBancoDeTeste();
    seedContratoComLocatario()(db);
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano de Tal", titular_cpf: CPF_TITULAR, tipo: "portabilidade" });

    const resultado = atenderPortabilidade(db, solicitacao.id, CPF_TITULAR);
    const exportado = JSON.parse(resultado.exportacaoJson);

    expect(exportado.titular_cpf).toBe(CPF_TITULAR);
    expect(exportado.registros).toHaveLength(1);
    expect(exportado.registros[0].tabela).toBe("contrato_locatarios");
    expect(resultado.solicitacao.status).toBe("atendida");
  });
});

describe("direitosTitular: atenderExclusao — a tensão retenção legal x exclusão", () => {
  it("RECUSA a exclusão quando há um documento contábil dentro do prazo de retenção de 7 anos", async () => {
    const db = await criarBancoDeTeste();
    seedDocumento("2024-01-01")(db); // ~2 anos atrás, bem dentro dos 7
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano de Tal", titular_cpf: CPF_TITULAR, tipo: "exclusao" });

    const resultado = atenderExclusao(db, solicitacao.id, CPF_TITULAR);

    expect(resultado.aceita).toBe(false);
    expect(resultado.motivo_recusa).toMatch(/retenção/i);
    expect(resultado.motivo_recusa).toMatch(/documentos#1/);
    expect(resultado.solicitacao.status).toBe("recusada");
    expect(resultado.solicitacao.motivo_recusa).toBe(resultado.motivo_recusa);

    // O dado NÃO foi tocado — recusa de verdade, não uma exclusão disfarçada.
    const [documento] = consultar<{ nome_contraparte: string }>(db, "SELECT nome_contraparte FROM documentos WHERE id = 1");
    expect(documento.nome_contraparte).toBe("Fulano de Tal");
  });

  it("RECUSA quando o contrato de locação ainda está vigente (sem data_fim), mesmo sem nenhum documento", async () => {
    const db = await criarBancoDeTeste();
    seedContratoComLocatario(null)(db); // vigente
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano de Tal", titular_cpf: CPF_TITULAR, tipo: "exclusao" });

    const resultado = atenderExclusao(db, solicitacao.id, CPF_TITULAR);
    expect(resultado.aceita).toBe(false);
    expect(resultado.motivo_recusa).toMatch(/vigente/i);
  });

  it("ACEITA e ANONIMIZA quando nenhum registro pessoal está sob retenção (documento e contrato antigos)", async () => {
    const db = await criarBancoDeTeste();
    seedContratoComLocatario("2015-01-01")(db); // encerrado há mais de 7 anos
    seedDocumento("2010-01-01")(db); // mais de 7 anos atrás
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano de Tal", titular_cpf: CPF_TITULAR, tipo: "exclusao" });

    const resultado = atenderExclusao(db, solicitacao.id, CPF_TITULAR);

    expect(resultado.aceita).toBe(true);
    expect(resultado.registros_anonimizados).toHaveLength(2);
    expect(resultado.solicitacao.status).toBe("atendida");

    // Identidade anonimizada...
    const [documento] = consultar<{ nome_contraparte: string; cnpj_cpf_contraparte: string }>(
      db,
      "SELECT nome_contraparte, cnpj_cpf_contraparte FROM documentos WHERE id = 1",
    );
    expect(documento.nome_contraparte).not.toBe("Fulano de Tal");
    expect(documento.cnpj_cpf_contraparte).not.toBe(CPF_TITULAR);

    // ...mas o VALOR do documento (dado contábil) continua intacto.
    const [documentoValor] = consultar<{ valor: number }>(db, "SELECT valor FROM documentos WHERE id = 1");
    expect(documentoValor.valor).toBe(500);

    const [locatario] = consultar<{ nome: string; cpf: string }>(db, "SELECT nome, cpf FROM contrato_locatarios WHERE id = 1");
    expect(locatario.nome).not.toBe("Fulano de Tal");
    expect(locatario.cpf).not.toBe(CPF_TITULAR);

    // O contrato em si (valor_referencia, datas) permanece intacto — só a identidade do
    // locatário some, não o lançamento contábil ligado ao contrato.
    const [contrato] = consultar<{ valor_referencia: number }>(db, "SELECT valor_referencia FROM contratos_locacao WHERE id = 1");
    expect(contrato.valor_referencia).toBe(1000);
  });

  it("entidades_legais NUNCA é anonimizada — é a âncora contábil do sistema, sempre recusa", async () => {
    const db = await criarBancoDeTeste();
    executar(
      db,
      "INSERT INTO entidades_legais (id, tipo, cpf_cnpj, nome) VALUES (1, 'pessoa_fisica', ?, 'Titular do Sistema')",
      [CPF_TITULAR],
    );
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Titular do Sistema", titular_cpf: CPF_TITULAR, tipo: "exclusao" });

    const resultado = atenderExclusao(db, solicitacao.id, CPF_TITULAR);
    expect(resultado.aceita).toBe(false);
    expect(resultado.motivo_recusa).toMatch(/entidade contábil fundamental/i);
  });

  it("nenhum dado pessoal encontrado: exclusão aceita trivialmente (nada para reter ou anonimizar)", async () => {
    const db = await criarBancoDeTeste();
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Ninguém", titular_cpf: "000.000.000-00", tipo: "exclusao" });
    const resultado = atenderExclusao(db, solicitacao.id, "000.000.000-00");
    expect(resultado.aceita).toBe(true);
    expect(resultado.registros_anonimizados).toEqual([]);
  });
});

describe("direitosTitular: atenderCorrecao — nunca muda dado sem deixar rastro em log_alteracoes", () => {
  it("corrige 'nome' propagando para TODAS as tabelas onde o CPF aparece, e registra em log_alteracoes", async () => {
    const db = await criarBancoDeTeste();
    seedContratoComLocatario()(db);
    executar(db, "INSERT INTO prestadores (id, nome, cpf_cnpj, servico) VALUES (1, 'Fulano de Tal', ?, 'faxina')", [CPF_TITULAR]);

    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano de Tal", titular_cpf: CPF_TITULAR, tipo: "correcao" });
    const resultado = atenderCorrecao(db, solicitacao.id, CPF_TITULAR, "nome", "Fulano da Silva");

    expect(resultado.registros_corrigidos).toHaveLength(2); // contrato_locatarios + prestadores
    expect(resultado.solicitacao.status).toBe("atendida");

    const [locatario] = consultar<{ nome: string }>(db, "SELECT nome FROM contrato_locatarios WHERE id = 1");
    expect(locatario.nome).toBe("Fulano da Silva");
    const [prestador] = consultar<{ nome: string }>(db, "SELECT nome FROM prestadores WHERE id = 1");
    expect(prestador.nome).toBe("Fulano da Silva");

    // Rastro de auditoria: uma entrada por tabela corrigida.
    const historicoContrato = listarHistoricoDoRegistro(db, "contrato_locatarios", 1);
    expect(historicoContrato).toHaveLength(1);
    expect(historicoContrato[0].operacao).toBe("edicao");
    expect(JSON.parse(historicoContrato[0].dados_novos!).nome).toBe("Fulano da Silva");

    const historicoPrestador = listarHistoricoDoRegistro(db, "prestadores", 1);
    expect(historicoPrestador).toHaveLength(1);
  });

  it("corrige um campo específico de uma única tabela (telefone só existe em contrato_locatarios)", async () => {
    const db = await criarBancoDeTeste();
    seedContratoComLocatario()(db);
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano de Tal", titular_cpf: CPF_TITULAR, tipo: "correcao" });

    const resultado = atenderCorrecao(db, solicitacao.id, CPF_TITULAR, "telefone", "48988887777");
    expect(resultado.registros_corrigidos).toEqual([{ tabela: "contrato_locatarios", registro_id: 1 }]);

    const [locatario] = consultar<{ telefone: string }>(db, "SELECT telefone FROM contrato_locatarios WHERE id = 1");
    expect(locatario.telefone).toBe("48988887777");
  });

  it("campo válido no sistema, mas sem nenhum registro deste CPF que o tenha, lança erro claro (nunca um no-op silencioso)", async () => {
    const db = await criarBancoDeTeste();
    // Este CPF só existe em `prestadores` — 'telefone' é um campo corrigível de verdade
    // (em contrato_locatarios), só não para ESTE titular.
    executar(db, "INSERT INTO prestadores (id, nome, cpf_cnpj, servico) VALUES (1, 'Fulano de Tal', ?, 'faxina')", [CPF_TITULAR]);
    const solicitacao = registrarSolicitacao(db, { titular_nome: "Fulano de Tal", titular_cpf: CPF_TITULAR, tipo: "correcao" });

    expect(() => atenderCorrecao(db, solicitacao.id, CPF_TITULAR, "telefone", "48988887777")).toThrow(/não encontrado/i);
  });
});
