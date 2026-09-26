import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import { consultar } from "../../db/connection";
import { CONTA_CAIXA_ERP, MAPA_APP_PARA_ERP } from "../erp/mapeamentoPlanoApp";
import { baixarContaAPagar } from "../contasAPagar/contasAPagar";
import {
  criarProcesso,
  adicionarParteProcesso,
  obterProcesso,
  listarProcessos,
  atualizarStatusProcesso,
  encerrarProcesso,
  arquivarProcesso,
  reabrirProcesso,
  registrarDespesaProcesso,
  listarDespesasProcesso,
  gerarRelatorioProcesso,
  gerarRelatorioAdvocacia,
  PLANO_CONTA_DESPESA_JURIDICA_PADRAO,
} from "./advocacia";

const CPF_TESTE = "52998224725";

let db: Database;
let entidade_id: number;

async function prepararBanco() {
  db = await criarBancoDeTeste();
  db.run(
    "INSERT INTO contas_bancarias (id, banco, agencia, numero, titular, tipo) VALUES (1, 'Banco 1', '0001', '11111', 'Titular', 'corrente')",
  );
  const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: CPF_TESTE });
  if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
  entidade_id = r.entidade_id;
}

function saldoLedgerConta(conta_id: number): { debito: number; credito: number } {
  const [r] = consultar<{ d: number | null; c: number | null }>(
    db,
    "SELECT SUM(valor_debito) AS d, SUM(valor_credito) AS c FROM ledger_entries WHERE conta_id = ?",
    [conta_id],
  );
  return { debito: r?.d ?? 0, credito: r?.c ?? 0 };
}

describe("advocacia", () => {
  beforeEach(async () => {
    await prepararBanco();
  });

  describe("criarProcesso / adicionarParteProcesso / obterProcesso", () => {
    it("cria um processo com partes e as retorna juntas", () => {
      const { id: processo_id } = criarProcesso(db, {
        entidade_id,
        numero_processo: "0001234-56.2024.8.26.0100",
        tipo: "civel",
        vara_comarca: "1ª Vara Cível de São Paulo",
        valor_causa: 50000,
        data_distribuicao: "2024-01-10",
      });
      expect(processo_id).toBeTruthy();

      const autor = adicionarParteProcesso(db, {
        processo_id: processo_id!,
        papel: "autor",
        nome: "Nosso Cliente Ltda",
        cpf_cnpj: "12345678000199",
        representado_por_nos: true,
      });
      expect(autor.sucesso).toBe(true);

      const reu = adicionarParteProcesso(db, {
        processo_id: processo_id!,
        papel: "reu",
        nome: "Parte Contrária S.A.",
        representado_por_nos: false,
      });
      expect(reu.sucesso).toBe(true);

      const processo = obterProcesso(db, processo_id!);
      expect(processo).not.toBeNull();
      expect(processo!.numero_processo).toBe("0001234-56.2024.8.26.0100");
      expect(processo!.tipo).toBe("civel");
      expect(processo!.status).toBe("ativo");
      expect(processo!.valor_causa).toBeCloseTo(50000, 2);
      expect(processo!.data_encerramento).toBeNull();
      expect(processo!.resultado).toBeNull();

      expect(processo!.partes).toHaveLength(2);
      const nosso = processo!.partes.find((p) => p.papel === "autor")!;
      expect(nosso.representado_por_nos).toBe(true);
      const contraria = processo!.partes.find((p) => p.papel === "reu")!;
      expect(contraria.representado_por_nos).toBe(false);
    });

    it("aceita processo sem número (ainda não protocolado)", () => {
      const { sucesso, id } = criarProcesso(db, { entidade_id, tipo: "outro" });
      expect(sucesso).toBe(true);
      const processo = obterProcesso(db, id!);
      expect(processo!.numero_processo).toBeNull();
    });

    it("recusa adicionar parte a processo inexistente", () => {
      const resultado = adicionarParteProcesso(db, {
        processo_id: 999999,
        papel: "autor",
        nome: "Alguém",
      });
      expect(resultado.sucesso).toBe(false);
    });

    it("retorna null para processo inexistente", () => {
      expect(obterProcesso(db, 999999)).toBeNull();
    });
  });

  describe("listarProcessos", () => {
    it("filtra por status e tipo", () => {
      const civel = criarProcesso(db, { entidade_id, tipo: "civel" }).id!;
      const trabalhista = criarProcesso(db, { entidade_id, tipo: "trabalhista" }).id!;
      encerrarProcesso(db, trabalhista, { data_encerramento: "2024-06-01", resultado: "Acordo homologado" });

      const ativos = listarProcessos(db, entidade_id, { status: "ativo" });
      expect(ativos.map((p) => p.id)).toEqual([civel]);

      const civeis = listarProcessos(db, entidade_id, { tipo: "civel" });
      expect(civeis.map((p) => p.id)).toEqual([civel]);

      const todos = listarProcessos(db, entidade_id);
      expect(todos).toHaveLength(2);
    });
  });

  describe("ciclo de status: suspender, encerrar, arquivar, reabrir", () => {
    it("encerra um processo ativo com data e resultado", () => {
      const { id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      const resultado = encerrarProcesso(db, id!, {
        data_encerramento: "2024-05-20",
        resultado: "Procedente — condenação de R$ 10.000,00",
      });
      expect(resultado.sucesso).toBe(true);

      const processo = obterProcesso(db, id!);
      expect(processo!.status).toBe("encerrado");
      expect(processo!.data_encerramento).toBe("2024-05-20");
      expect(processo!.resultado).toMatch(/Procedente/);
    });

    it("recusa encerrar processo já encerrado (idempotência protege o histórico)", () => {
      const { id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      encerrarProcesso(db, id!, { data_encerramento: "2024-05-20", resultado: "Procedente" });

      const segunda = encerrarProcesso(db, id!, { data_encerramento: "2024-06-01", resultado: "Outro resultado" });
      expect(segunda.sucesso).toBe(false);

      // Não sobrescreveu o resultado original.
      const processo = obterProcesso(db, id!);
      expect(processo!.resultado).toBe("Procedente");
    });

    it("recusa encerrar sem resultado", () => {
      const { id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      const resultado = encerrarProcesso(db, id!, { data_encerramento: "2024-05-20", resultado: "" });
      expect(resultado.sucesso).toBe(false);
    });

    it("suspende e reativa um processo (atualizarStatusProcesso)", () => {
      const { id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      expect(atualizarStatusProcesso(db, id!, "suspenso").sucesso).toBe(true);
      expect(obterProcesso(db, id!)!.status).toBe("suspenso");

      expect(atualizarStatusProcesso(db, id!, "ativo").sucesso).toBe(true);
      expect(obterProcesso(db, id!)!.status).toBe("ativo");
    });

    it("arquiva só a partir de encerrado, nunca direto de ativo", () => {
      const { id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      const direto = arquivarProcesso(db, id!);
      expect(direto.sucesso).toBe(false);

      encerrarProcesso(db, id!, { data_encerramento: "2024-05-20", resultado: "Procedente" });
      const depois = arquivarProcesso(db, id!);
      expect(depois.sucesso).toBe(true);
      expect(obterProcesso(db, id!)!.status).toBe("arquivado");
    });

    it("reabre um processo encerrado, limpando data/resultado", () => {
      const { id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      encerrarProcesso(db, id!, { data_encerramento: "2024-05-20", resultado: "Procedente" });

      const reaberto = reabrirProcesso(db, id!);
      expect(reaberto.sucesso).toBe(true);

      const processo = obterProcesso(db, id!);
      expect(processo!.status).toBe("ativo");
      expect(processo!.data_encerramento).toBeNull();
      expect(processo!.resultado).toBeNull();
    });
  });

  describe("registrarDespesaProcesso", () => {
    it("registra despesa vinculada ao processo, refletida em contas_a_pagar com o plano de contas padrão", () => {
      const { id: processo_id } = criarProcesso(db, { entidade_id, tipo: "civel" });

      const resultado = registrarDespesaProcesso(db, {
        processo_id: processo_id!,
        entidade_id,
        fornecedor_nome: "Escritório Advocacia & Associados",
        valor: 1500,
        data_vencimento: "2024-04-10",
      });
      expect(resultado.sucesso).toBe(true);
      expect(resultado.id).toBeTruthy();

      const [linha] = consultar<{ processo_id: number; plano_conta_codigo: string; valor: number }>(
        db,
        "SELECT processo_id, plano_conta_codigo, valor FROM contas_a_pagar WHERE id = ?",
        [resultado.id!],
      );
      expect(linha.processo_id).toBe(processo_id);
      expect(linha.plano_conta_codigo).toBe(PLANO_CONTA_DESPESA_JURIDICA_PADRAO);
      expect(linha.valor).toBeCloseTo(1500, 2);

      const despesas = listarDespesasProcesso(db, processo_id!, "2024-04-01");
      expect(despesas).toHaveLength(1);
      expect(despesas[0].status_calculado).toBe("pendente");
    });

    it("aceita plano_conta_codigo customizado quando informado", () => {
      const { id: processo_id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      const resultado = registrarDespesaProcesso(db, {
        processo_id: processo_id!,
        entidade_id,
        fornecedor_nome: "Cartório Central",
        valor: 300,
        data_vencimento: "2024-04-10",
        plano_conta_codigo: "2.1.10",
      });
      const [linha] = consultar<{ plano_conta_codigo: string }>(
        db,
        "SELECT plano_conta_codigo FROM contas_a_pagar WHERE id = ?",
        [resultado.id!],
      );
      expect(linha.plano_conta_codigo).toBe("2.1.10");
    });

    it("recusa nova despesa em processo encerrado", () => {
      const { id: processo_id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      encerrarProcesso(db, processo_id!, { data_encerramento: "2024-05-01", resultado: "Procedente" });

      const resultado = registrarDespesaProcesso(db, {
        processo_id: processo_id!,
        entidade_id,
        fornecedor_nome: "Escritório X",
        valor: 100,
        data_vencimento: "2024-05-10",
      });
      expect(resultado.sucesso).toBe(false);
      expect(resultado.mensagem).toMatch(/encerrado/i);
    });

    it("recusa nova despesa em processo arquivado", () => {
      const { id: processo_id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      encerrarProcesso(db, processo_id!, { data_encerramento: "2024-05-01", resultado: "Procedente" });
      arquivarProcesso(db, processo_id!);

      const resultado = registrarDespesaProcesso(db, {
        processo_id: processo_id!,
        entidade_id,
        fornecedor_nome: "Escritório X",
        valor: 100,
        data_vencimento: "2024-05-10",
      });
      expect(resultado.sucesso).toBe(false);
    });

    it("aceita nova despesa depois de reabrir o processo", () => {
      const { id: processo_id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      encerrarProcesso(db, processo_id!, { data_encerramento: "2024-05-01", resultado: "Procedente" });
      reabrirProcesso(db, processo_id!);

      const resultado = registrarDespesaProcesso(db, {
        processo_id: processo_id!,
        entidade_id,
        fornecedor_nome: "Escritório X",
        valor: 100,
        data_vencimento: "2024-05-10",
      });
      expect(resultado.sucesso).toBe(true);
    });

    it("recusa despesa para processo inexistente", () => {
      const resultado = registrarDespesaProcesso(db, {
        processo_id: 999999,
        entidade_id,
        fornecedor_nome: "Escritório X",
        valor: 100,
        data_vencimento: "2024-05-10",
      });
      expect(resultado.sucesso).toBe(false);
    });

    it("a baixa da despesa gera lançamento real no razão (débito honorários / crédito caixa)", () => {
      const { id: processo_id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      const { id: conta_a_pagar_id } = registrarDespesaProcesso(db, {
        processo_id: processo_id!,
        entidade_id,
        fornecedor_nome: "Escritório Advocacia & Associados",
        valor: 800,
        data_vencimento: "2024-04-10",
      });

      const baixa = baixarContaAPagar(db, conta_a_pagar_id!, 1, "2024-04-10");
      expect(baixa.sucesso).toBe(true);

      const contaDespesa = MAPA_APP_PARA_ERP[PLANO_CONTA_DESPESA_JURIDICA_PADRAO];
      expect(saldoLedgerConta(contaDespesa).debito).toBeCloseTo(800, 2);
      expect(saldoLedgerConta(CONTA_CAIXA_ERP).credito).toBeCloseTo(800, 2);

      const relatorio = gerarRelatorioProcesso(db, processo_id!, "2024-04-10")!;
      expect(relatorio.total_pago).toBeCloseTo(800, 2);
      expect(relatorio.total_pendente).toBeCloseTo(0, 2);
    });
  });

  describe("gerarRelatorioProcesso", () => {
    it("soma corretamente vários lançamentos (pagos e pendentes)", () => {
      const { id: processo_id } = criarProcesso(db, { entidade_id, tipo: "civel" });

      const d1 = registrarDespesaProcesso(db, {
        processo_id: processo_id!,
        entidade_id,
        fornecedor_nome: "Honorários iniciais",
        valor: 1000,
        data_vencimento: "2024-01-10",
      }).id!;
      registrarDespesaProcesso(db, {
        processo_id: processo_id!,
        entidade_id,
        fornecedor_nome: "Custas judiciais",
        valor: 250,
        data_vencimento: "2024-02-10",
      });
      registrarDespesaProcesso(db, {
        processo_id: processo_id!,
        entidade_id,
        fornecedor_nome: "Perícia técnica",
        valor: 500,
        data_vencimento: "2024-03-10",
      });

      baixarContaAPagar(db, d1, 1, "2024-01-10");

      const relatorio = gerarRelatorioProcesso(db, processo_id!, "2024-03-15")!;
      expect(relatorio.total_despesas).toBeCloseTo(1000 + 250 + 500, 2);
      expect(relatorio.total_pago).toBeCloseTo(1000, 2);
      expect(relatorio.total_pendente).toBeCloseTo(250 + 500, 2);
      expect(relatorio.despesas).toHaveLength(3);
    });

    it("processo sem despesa nenhuma aparece com total zero, nunca erro", () => {
      const { id: processo_id } = criarProcesso(db, { entidade_id, tipo: "civel" });
      const relatorio = gerarRelatorioProcesso(db, processo_id!)!;
      expect(relatorio).not.toBeNull();
      expect(relatorio.total_despesas).toBe(0);
      expect(relatorio.total_pago).toBe(0);
      expect(relatorio.total_pendente).toBe(0);
      expect(relatorio.despesas).toEqual([]);
    });

    it("retorna null para processo inexistente (nunca lança)", () => {
      expect(gerarRelatorioProcesso(db, 999999)).toBeNull();
    });
  });

  describe("gerarRelatorioAdvocacia", () => {
    it("conta processos ativos vs. encerrados e agrega despesas pendentes por processo", () => {
      const ativo1 = criarProcesso(db, { entidade_id, tipo: "civel" }).id!;
      const ativo2 = criarProcesso(db, { entidade_id, tipo: "trabalhista" }).id!;
      const encerrado = criarProcesso(db, { entidade_id, tipo: "tributario" }).id!;
      encerrarProcesso(db, encerrado, { data_encerramento: "2024-01-01", resultado: "Improcedente" });

      registrarDespesaProcesso(db, {
        processo_id: ativo1,
        entidade_id,
        fornecedor_nome: "Escritório A",
        valor: 400,
        data_vencimento: "2024-02-10",
      });
      registrarDespesaProcesso(db, {
        processo_id: ativo2,
        entidade_id,
        fornecedor_nome: "Escritório B",
        valor: 600,
        data_vencimento: "2024-02-15",
      });
      // Processo encerrado tem despesa histórica (registrada antes de encerrar).

      const relatorio = gerarRelatorioAdvocacia(db, entidade_id, "2024-03-01");
      expect(relatorio.processos_ativos).toBe(2);
      expect(relatorio.processos_encerrados).toBe(1);
      expect(relatorio.total_geral_pendente).toBeCloseTo(1000, 2);

      const resumoAtivo1 = relatorio.por_processo.find((p) => p.processo_id === ativo1)!;
      expect(resumoAtivo1.total_pendente).toBeCloseTo(400, 2);

      const resumoEncerrado = relatorio.por_processo.find((p) => p.processo_id === encerrado)!;
      expect(resumoEncerrado.total_despesas).toBe(0);
      expect(resumoEncerrado.status).toBe("encerrado");
    });
  });
});
