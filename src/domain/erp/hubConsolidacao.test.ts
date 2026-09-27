/**
 * hubConsolidacao.ts contra o schema real (criarBancoDeTeste()) — hub de consolidação
 * financeira: camada de evidência acima do razão (`ledger_entries`), nunca um substituto
 * dele. Ver o comentário do topo de hubConsolidacao.ts e do bloco "HUB DE CONSOLIDAÇÃO
 * FINANCEIRA" em schema.sql.
 */
import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import { criarEntidadeLegal } from "./entidadeLegal";
import {
  registrarFatoDoBanco,
  registrarFatoDeCompetencia,
  registrarFatoDeContaAPagar,
  registrarFatoDeOrdemServico,
  ligarFatos,
  confirmarLigacao,
  rejeitarLigacao,
  sugerirLigacoesCompetenciaRecebimento,
  relatorioCoberturaFatos,
} from "./hubConsolidacao";

const CPF_TESTE = "52998224725";

let db: Database;
let entidade_id: number;
let imovel_id: number;
let conta_bancaria_id: number;
let contrato_id: number;

function ultimoId(): number {
  return consultar<{ id: number }>(db, "SELECT last_insert_rowid() AS id")[0].id;
}

function criarTransacao(valor: number, data: string): number {
  executar(
    db,
    `INSERT INTO transacoes (conta_id, data, valor, descricao_original)
     VALUES (?, ?, ?, 'PIX recebido')`,
    [conta_bancaria_id, data, valor],
  );
  return ultimoId();
}

function criarCompetencia(valor_devido: number, data_vencimento: string, mes = 6): number {
  executar(
    db,
    `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, criado_em)
     VALUES (?, ?, 2025, ?, ?, ?, '2025-06-01')`,
    [contrato_id, imovel_id, mes, data_vencimento, valor_devido],
  );
  return ultimoId();
}

function criarContaAPagar(valor: number, data_vencimento: string): number {
  executar(
    db,
    `INSERT INTO contas_a_pagar (entidade_id, fornecedor_nome, valor, data_vencimento, criado_em)
     VALUES (?, 'Fornecedor Teste', ?, ?, '2025-06-01')`,
    [entidade_id, valor, data_vencimento],
  );
  return ultimoId();
}

function criarOrdemServicoDespesa(valor_solicitado: number, valor_aprovado: number | null = null): number {
  executar(db, `INSERT INTO ordens_servico (imovel_id, titulo) VALUES (?, 'Reparo teste')`, [imovel_id]);
  const ordem_servico_id = ultimoId();
  executar(
    db,
    `INSERT INTO ordens_servico_despesas (ordem_servico_id, valor_solicitado, valor_aprovado, criado_em)
     VALUES (?, ?, ?, '2025-06-05T10:00:00Z')`,
    [ordem_servico_id, valor_solicitado, valor_aprovado],
  );
  return ultimoId();
}

beforeEach(async () => {
  db = await criarBancoDeTeste();
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;

  executar(db, "INSERT INTO imoveis (apelido, tipo) VALUES ('Kitnet Teste', 'kitnet')");
  imovel_id = ultimoId();

  executar(
    db,
    "INSERT INTO contas_bancarias (banco, agencia, numero, titular, tipo) VALUES ('Banco Teste', '0001', '11111', 'Titular', 'corrente')",
  );
  conta_bancaria_id = ultimoId();

  executar(
    db,
    `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', 1000, 10, '2025-01-01')`,
    [imovel_id],
  );
  contrato_id = ultimoId();
});

describe("hubConsolidacao: registro idempotente de fatos", () => {
  it("registrarFatoDoBanco chamado duas vezes para a mesma transação não duplica", () => {
    const transacaoId = criarTransacao(1000, "2025-06-10");

    const fato1 = registrarFatoDoBanco(db, entidade_id, transacaoId);
    const fato2 = registrarFatoDoBanco(db, entidade_id, transacaoId);

    expect(fato1.id).toBe(fato2.id);
    expect(fato1.chave_idempotencia).toBe(`banco:${transacaoId}`);
    expect(fato1.tipo_origem).toBe("banco");
    expect(fato1.valor).toBe(1000);
    expect(fato1.data_fato).toBe("2025-06-10");
    expect(fato1.estado_revisao).toBe("pendente");

    const total = consultar<{ total: number }>(
      db,
      "SELECT COUNT(*) AS total FROM fatos_financeiros WHERE chave_idempotencia = ?",
      [`banco:${transacaoId}`],
    )[0].total;
    expect(total).toBe(1);
  });

  it("registrarFatoDeCompetencia é idempotente e usa vencimento/valor devido reais", () => {
    const competenciaId = criarCompetencia(1000, "2025-06-10");

    const fato1 = registrarFatoDeCompetencia(db, entidade_id, competenciaId);
    const fato2 = registrarFatoDeCompetencia(db, entidade_id, competenciaId);

    expect(fato1.id).toBe(fato2.id);
    expect(fato1.tipo_origem).toBe("competencia");
    expect(fato1.data_fato).toBe("2025-06-10");
    expect(fato1.valor).toBe(1000);
  });

  it("registrarFatoDeContaAPagar é idempotente", () => {
    const contaAPagarId = criarContaAPagar(500, "2025-06-15");

    const fato1 = registrarFatoDeContaAPagar(db, entidade_id, contaAPagarId);
    const fato2 = registrarFatoDeContaAPagar(db, entidade_id, contaAPagarId);

    expect(fato1.id).toBe(fato2.id);
    expect(fato1.tipo_origem).toBe("contas_a_pagar");
    expect(fato1.valor).toBe(500);
  });

  it("registrarFatoDeOrdemServico é idempotente e usa valor_aprovado quando presente", () => {
    const despesaId = criarOrdemServicoDespesa(800, 750);

    const fato1 = registrarFatoDeOrdemServico(db, entidade_id, despesaId);
    const fato2 = registrarFatoDeOrdemServico(db, entidade_id, despesaId);

    expect(fato1.id).toBe(fato2.id);
    expect(fato1.tipo_origem).toBe("ordem_servico");
    expect(fato1.valor).toBe(750); // valor_aprovado, não o solicitado
  });

  it("registrarFatoDeOrdemServico usa valor_solicitado quando ainda não há aprovação", () => {
    const despesaId = criarOrdemServicoDespesa(800, null);
    const fato = registrarFatoDeOrdemServico(db, entidade_id, despesaId);
    expect(fato.valor).toBe(800);
  });

  it("origem inexistente lança erro legível em vez de gravar fato inválido", () => {
    expect(() => registrarFatoDoBanco(db, entidade_id, 99999)).toThrow(/não encontrada/i);
    expect(consultar(db, "SELECT id FROM fatos_financeiros")).toHaveLength(0);
  });
});

describe("hubConsolidacao: ligarFatos", () => {
  it("rejeita ligar um fato a si mesmo com mensagem clara", () => {
    const transacaoId = criarTransacao(1000, "2025-06-10");
    const fato = registrarFatoDoBanco(db, entidade_id, transacaoId);

    expect(() => ligarFatos(db, fato.id, fato.id, "competencia_recebimento")).toThrow(/si mesmo/i);
    expect(consultar(db, "SELECT id FROM fatos_financeiros_links")).toHaveLength(0);
  });

  it("é idempotente: religar o mesmo par (nas duas ordens) com o mesmo tipo de relação não duplica", () => {
    const competenciaId = criarCompetencia(1000, "2025-06-10");
    const transacaoId = criarTransacao(1000, "2025-06-10");
    const fatoCompetencia = registrarFatoDeCompetencia(db, entidade_id, competenciaId);
    const fatoBanco = registrarFatoDoBanco(db, entidade_id, transacaoId);

    const link1 = ligarFatos(db, fatoCompetencia.id, fatoBanco.id, "competencia_recebimento");
    const link2 = ligarFatos(db, fatoCompetencia.id, fatoBanco.id, "competencia_recebimento");
    // mesma ligação, ordem invertida dos ids
    const link3 = ligarFatos(db, fatoBanco.id, fatoCompetencia.id, "competencia_recebimento");

    expect(link1.id).toBe(link2.id);
    expect(link1.id).toBe(link3.id);
    expect(link1.status).toBe("pendente");

    const total = consultar<{ total: number }>(db, "SELECT COUNT(*) AS total FROM fatos_financeiros_links")[0].total;
    expect(total).toBe(1);
  });

  it("confirmarLigacao e rejeitarLigacao mudam o status", () => {
    const competenciaId = criarCompetencia(1000, "2025-06-10");
    const transacaoId = criarTransacao(1000, "2025-06-10");
    const fatoCompetencia = registrarFatoDeCompetencia(db, entidade_id, competenciaId);
    const fatoBanco = registrarFatoDoBanco(db, entidade_id, transacaoId);
    const link = ligarFatos(db, fatoCompetencia.id, fatoBanco.id, "competencia_recebimento");

    const confirmado = confirmarLigacao(db, link.id);
    expect(confirmado.status).toBe("confirmado");

    const rejeitado = rejeitarLigacao(db, link.id);
    expect(rejeitado.status).toBe("rejeitado");
  });

  it("confirmarLigacao de um id inexistente lança erro legível", () => {
    expect(() => confirmarLigacao(db, 99999)).toThrow(/não encontrada/i);
  });
});

describe("hubConsolidacao: sugerirLigacoesCompetenciaRecebimento", () => {
  it("encontra o par competência/recebimento dentro da tolerância de valor e data", () => {
    const competenciaId = criarCompetencia(1000, "2025-06-10");
    const transacaoId = criarTransacao(1000, "2025-06-12"); // 2 dias após o vencimento
    registrarFatoDeCompetencia(db, entidade_id, competenciaId);
    registrarFatoDoBanco(db, entidade_id, transacaoId);

    const sugestoes = sugerirLigacoesCompetenciaRecebimento(db, entidade_id);

    expect(sugestoes).toHaveLength(1);
    expect(sugestoes[0].tipo_relacao).toBe("competencia_recebimento");
    expect(sugestoes[0].status).toBe("pendente"); // nunca confirma sozinha
  });

  it("ignora par fora da tolerância padrão de dias (10)", () => {
    const competenciaId = criarCompetencia(1000, "2025-06-10");
    const transacaoId = criarTransacao(1000, "2025-06-25"); // 15 dias após o vencimento
    registrarFatoDeCompetencia(db, entidade_id, competenciaId);
    registrarFatoDoBanco(db, entidade_id, transacaoId);

    const sugestoes = sugerirLigacoesCompetenciaRecebimento(db, entidade_id);
    expect(sugestoes).toHaveLength(0);
  });

  it("ignora par fora da tolerância de valor quando informada", () => {
    const competenciaId = criarCompetencia(1000, "2025-06-10");
    const transacaoId = criarTransacao(950, "2025-06-10"); // 50 a menos
    registrarFatoDeCompetencia(db, entidade_id, competenciaId);
    registrarFatoDoBanco(db, entidade_id, transacaoId);

    const semTolerancia = sugerirLigacoesCompetenciaRecebimento(db, entidade_id);
    expect(semTolerancia).toHaveLength(0);

    const comTolerancia = sugerirLigacoesCompetenciaRecebimento(db, entidade_id, { toleranciaValor: 60 });
    expect(comTolerancia).toHaveLength(1);
  });

  it("nunca confirma sozinha e não sugere de novo depois que a competência já tem link confirmado", () => {
    const competenciaId = criarCompetencia(1000, "2025-06-10");
    const transacaoId = criarTransacao(1000, "2025-06-10");
    registrarFatoDeCompetencia(db, entidade_id, competenciaId);
    registrarFatoDoBanco(db, entidade_id, transacaoId);

    const primeira = sugerirLigacoesCompetenciaRecebimento(db, entidade_id);
    expect(primeira).toHaveLength(1);
    confirmarLigacao(db, primeira[0].id);

    // Uma segunda transação bancária "parecida" aparece depois — a competência já está coberta
    // por um link confirmado, então não deve gerar nova sugestão.
    const outraTransacaoId = criarTransacao(1000, "2025-06-11");
    registrarFatoDoBanco(db, entidade_id, outraTransacaoId);

    const segunda = sugerirLigacoesCompetenciaRecebimento(db, entidade_id);
    expect(segunda).toHaveLength(0);
  });

  it("não duplica sugestão já existente ao rodar a heurística duas vezes", () => {
    const competenciaId = criarCompetencia(1000, "2025-06-10");
    const transacaoId = criarTransacao(1000, "2025-06-10");
    registrarFatoDeCompetencia(db, entidade_id, competenciaId);
    registrarFatoDoBanco(db, entidade_id, transacaoId);

    const primeira = sugerirLigacoesCompetenciaRecebimento(db, entidade_id);
    expect(primeira).toHaveLength(1);

    // A competência continua 'pendente' (não confirmada) — mas o par já foi sugerido.
    const segunda = sugerirLigacoesCompetenciaRecebimento(db, entidade_id);
    expect(segunda).toHaveLength(0);

    const total = consultar<{ total: number }>(db, "SELECT COUNT(*) AS total FROM fatos_financeiros_links")[0].total;
    expect(total).toBe(1);
  });
});

describe("hubConsolidacao: relatorioCoberturaFatos", () => {
  it("conta fatos por tipo_origem, por estado_revisao e cobertura confirmada", () => {
    const competenciaId1 = criarCompetencia(1000, "2025-06-10", 6);
    const competenciaId2 = criarCompetencia(1000, "2025-07-10", 7);
    const transacaoId = criarTransacao(1000, "2025-06-10");
    const contaAPagarId = criarContaAPagar(500, "2025-06-15");

    const fatoCompetencia1 = registrarFatoDeCompetencia(db, entidade_id, competenciaId1);
    registrarFatoDeCompetencia(db, entidade_id, competenciaId2);
    const fatoBanco = registrarFatoDoBanco(db, entidade_id, transacaoId);
    registrarFatoDeContaAPagar(db, entidade_id, contaAPagarId);

    // Só a primeira competência ganha um link CONFIRMADO — a segunda e a conta a pagar ficam
    // sem cobertura confirmada.
    const link = ligarFatos(db, fatoCompetencia1.id, fatoBanco.id, "competencia_recebimento");
    confirmarLigacao(db, link.id);

    const relatorio = relatorioCoberturaFatos(db, entidade_id);

    expect(relatorio.total_fatos).toBe(4);
    expect(relatorio.por_tipo_origem.competencia).toBe(2);
    expect(relatorio.por_tipo_origem.banco).toBe(1);
    expect(relatorio.por_tipo_origem.contas_a_pagar).toBe(1);
    expect(relatorio.por_estado_revisao.pendente).toBe(4);
    expect(relatorio.sem_cobertura_confirmada.competencia).toBe(1); // só a 2ª competência
    expect(relatorio.sem_cobertura_confirmada.contas_a_pagar).toBe(1);
  });

  it("banco vazio para a entidade retorna contagens zeradas", () => {
    const relatorio = relatorioCoberturaFatos(db, entidade_id);
    expect(relatorio.total_fatos).toBe(0);
    expect(relatorio.sem_cobertura_confirmada.competencia).toBe(0);
    expect(relatorio.sem_cobertura_confirmada.contas_a_pagar).toBe(0);
  });
});
