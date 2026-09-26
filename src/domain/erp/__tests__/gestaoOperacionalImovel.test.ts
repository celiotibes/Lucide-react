import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { registrarContaAPagar, cancelarContaAPagar } from "../../contasAPagar/contasAPagar";
import {
  cadastrarInquilino,
  listarInquilinosPorImovel,
  editarInquilino,
  removerInquilino,
  agendarManutencao,
  listarManutencoesPorImovel,
  iniciarManutencao,
  concluirManutencao,
  cancelarManutencao,
  obterResumoDespesasAgendadasImovel,
} from "../gestaoOperacionalImovel";

/** Cenário determinístico contra o schema REAL (contabilidade-reconstituicao/schema.sql),
 * via criarBancoDeTeste() — nunca contra uma cópia fictícia. */
describe("gestaoOperacionalImovel", () => {
  let db: Database;
  let entidade_id: number;
  const IMOVEL_1 = 1;
  const IMOVEL_SEM_CONTRATO = 2;

  beforeEach(async () => {
    db = await criarBancoDeTeste();
    const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
    if (!r.entidade_id) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);
    entidade_id = r.entidade_id;

    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, endereco, financiado, uso_pessoal, valor_aquisicao)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
      [IMOVEL_1, "Apto 101", "apartamento", "Rua Principal 123, Apto 101", 300000],
    );
    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, endereco, financiado, uso_pessoal, valor_aquisicao)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
      [IMOVEL_SEM_CONTRATO, "Sala vazia", "sala_comercial", "Rua Nova 1", 100000],
    );
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
       VALUES (1, ?, 'João da Silva', 'residencial_fixo', 2000, '2025-01-01', '2026-12-31')`,
      [IMOVEL_1],
    );
    // Contrato de outro imóvel — usado para provar que um inquilino não pode ser ligado a
    // um contrato de imóvel diferente do seu.
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio, data_fim)
       VALUES (2, ?, 'Maria Souza', 'residencial_fixo', 900, '2025-01-01', NULL)`,
      [IMOVEL_SEM_CONTRATO],
    );
  });

  describe("inquilinos", () => {
    it("recusa cadastro em imóvel inexistente", () => {
      const r = cadastrarInquilino(db, { imovel_id: 9999, nome: "Fulano" });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/não encontrado/);
    });

    it("recusa nome vazio", () => {
      const r = cadastrarInquilino(db, { imovel_id: IMOVEL_1, nome: "   " });
      expect(r.sucesso).toBe(false);
    });

    it("recusa contrato de outro imóvel", () => {
      const r = cadastrarInquilino(db, { imovel_id: IMOVEL_1, nome: "João da Silva", contrato_id: 2 });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/outro imóvel/);
    });

    it("cadastra, lista (mais recente primeiro), edita e remove um inquilino", () => {
      const r1 = cadastrarInquilino(db, {
        imovel_id: IMOVEL_1,
        nome: "João da Silva",
        cpf_cnpj: "123.456.789-00",
        telefone: "48999990000",
        contrato_id: 1,
      });
      expect(r1.sucesso).toBe(true);
      const inquilinoId = r1.id!;

      const r2 = cadastrarInquilino(db, { imovel_id: IMOVEL_1, nome: "Pré-cadastro sem contrato" });
      expect(r2.sucesso).toBe(true);

      const lista = listarInquilinosPorImovel(db, IMOVEL_1);
      expect(lista).toHaveLength(2);
      expect(lista[0].id).toBe(r2.id); // mais recente primeiro
      expect(lista.find((i) => i.id === inquilinoId)?.contrato_id).toBe(1);

      const edicao = editarInquilino(db, inquilinoId, { telefone: "48988887777", observacoes: "Chaves com o zelador" });
      expect(edicao.sucesso).toBe(true);
      const [atualizado] = listarInquilinosPorImovel(db, IMOVEL_1).filter((i) => i.id === inquilinoId);
      expect(atualizado.telefone).toBe("48988887777");
      expect(atualizado.nome).toBe("João da Silva"); // preservado, não sobrescrito por undefined
      expect(atualizado.contrato_id).toBe(1); // preservado

      const desvinculo = editarInquilino(db, inquilinoId, { contrato_id: null });
      expect(desvinculo.sucesso).toBe(true);
      const [semContrato] = listarInquilinosPorImovel(db, IMOVEL_1).filter((i) => i.id === inquilinoId);
      expect(semContrato.contrato_id ?? null).toBeNull();

      const remocao = removerInquilino(db, r2.id!);
      expect(remocao.sucesso).toBe(true);
      expect(listarInquilinosPorImovel(db, IMOVEL_1)).toHaveLength(1);
    });

    it("editarInquilino recusa inquilino inexistente", () => {
      const r = editarInquilino(db, 9999, { telefone: "123" });
      expect(r.sucesso).toBe(false);
    });
  });

  describe("manutenções", () => {
    it("recusa agendamento em imóvel inexistente e com custo negativo", () => {
      expect(
        agendarManutencao(db, { imovel_id: 9999, tipo: "elétrica", descricao: "Troca de fiação", data_agendada: "2026-03-01" }).sucesso,
      ).toBe(false);
      expect(
        agendarManutencao(db, {
          imovel_id: IMOVEL_1,
          tipo: "elétrica",
          descricao: "Troca de fiação",
          data_agendada: "2026-03-01",
          custo: -10,
        }).sucesso,
      ).toBe(false);
    });

    it("agenda, lista, inicia, conclui e filtra por status", () => {
      const r = agendarManutencao(db, {
        imovel_id: IMOVEL_1,
        tipo: "hidráulica",
        descricao: "Vazamento no banheiro",
        data_agendada: "2026-03-10",
        custo: 300,
      });
      expect(r.sucesso).toBe(true);
      const id = r.id!;

      expect(listarManutencoesPorImovel(db, IMOVEL_1)).toHaveLength(1);
      expect(listarManutencoesPorImovel(db, IMOVEL_1, { status: "agendada" })).toHaveLength(1);
      expect(listarManutencoesPorImovel(db, IMOVEL_1, { status: "concluida" })).toHaveLength(0);

      const inicio = iniciarManutencao(db, id);
      expect(inicio.sucesso).toBe(true);
      expect(listarManutencoesPorImovel(db, IMOVEL_1, { status: "em_andamento" })).toHaveLength(1);

      // Não pode iniciar de novo (já não está mais 'agendada').
      expect(iniciarManutencao(db, id).sucesso).toBe(false);

      const conclusao = concluirManutencao(db, id, "2026-03-12", 350);
      expect(conclusao.sucesso).toBe(true);
      const [concluida] = listarManutencoesPorImovel(db, IMOVEL_1, { status: "concluida" });
      expect(concluida.data_conclusao).toBe("2026-03-12");
      expect(concluida.custo).toBe(350);

      // Conclusão duplicada é recusada — não sobrescreve em silêncio.
      expect(concluirManutencao(db, id, "2026-03-20").sucesso).toBe(false);
    });

    it("conclui mantendo o custo estimado quando nenhum custo final é informado", () => {
      const r = agendarManutencao(db, {
        imovel_id: IMOVEL_1,
        tipo: "pintura",
        descricao: "Pintura da sala",
        data_agendada: "2026-04-01",
        custo: 800,
      });
      concluirManutencao(db, r.id!, "2026-04-05");
      const [concluida] = listarManutencoesPorImovel(db, IMOVEL_1, { status: "concluida" });
      expect(concluida.custo).toBe(800);
    });

    it("cancela manutenção não concluída, é idempotente ao cancelar de novo, e recusa cancelar uma já concluída", () => {
      const r = agendarManutencao(db, {
        imovel_id: IMOVEL_1,
        tipo: "jardinagem",
        descricao: "Poda de árvore",
        data_agendada: "2026-05-01",
      });
      const cancelamento = cancelarManutencao(db, r.id!, "Inquilino resolveu por conta própria");
      expect(cancelamento.sucesso).toBe(true);
      const [cancelada] = listarManutencoesPorImovel(db, IMOVEL_1, { status: "cancelada" });
      expect(cancelada.observacoes).toMatch(/CANCELADA: Inquilino resolveu por conta própria/);

      // Idempotente.
      expect(cancelarManutencao(db, r.id!, "motivo qualquer").sucesso).toBe(true);

      const r2 = agendarManutencao(db, {
        imovel_id: IMOVEL_1,
        tipo: "elétrica",
        descricao: "Revisão do quadro",
        data_agendada: "2026-05-02",
      });
      concluirManutencao(db, r2.id!, "2026-05-03");
      expect(cancelarManutencao(db, r2.id!, "motivo qualquer").sucesso).toBe(false);
    });
  });

  describe("obterResumoDespesasAgendadasImovel", () => {
    it("soma pendentes e atrasadas de contas_a_pagar do imóvel, ignorando pagas/canceladas e outros imóveis", () => {
      const dataRef = "2026-02-01";

      // Atrasada (vencida antes da data de referência).
      registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Condomínio Edifício Aurora",
        valor: 1500,
        data_vencimento: "2026-01-10",
        imovel_id: IMOVEL_1,
      });
      // Pendente (a vencer).
      registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "CEMIG",
        valor: 200,
        data_vencimento: "2026-02-20",
        imovel_id: IMOVEL_1,
      });
      // Cancelada — não deve entrar na soma.
      const cancelada = registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Fornecedor Duplicado",
        valor: 999,
        data_vencimento: "2026-02-15",
        imovel_id: IMOVEL_1,
      });
      cancelarContaAPagar(db, cancelada.id!, "duplicidade");
      // De outro imóvel — não deve entrar.
      registrarContaAPagar(db, {
        entidade_id,
        fornecedor_nome: "Outro imóvel",
        valor: 5000,
        data_vencimento: "2026-02-05",
        imovel_id: IMOVEL_SEM_CONTRATO,
      });

      const resumo = obterResumoDespesasAgendadasImovel(db, entidade_id, IMOVEL_1, dataRef);
      expect(resumo.total_atrasado).toBe(1500);
      expect(resumo.total_pendente).toBe(200);
      expect(resumo.quantidade_atrasada).toBe(1);
      expect(resumo.quantidade_pendente).toBe(1);
      expect(resumo.itens.map((i) => i.fornecedor_nome).sort()).toEqual(["CEMIG", "Condomínio Edifício Aurora"]);
    });

    it("devolve zerado quando o imóvel não tem nenhuma despesa agendada", () => {
      const resumo = obterResumoDespesasAgendadasImovel(db, entidade_id, IMOVEL_SEM_CONTRATO, "2026-02-01");
      expect(resumo.total_pendente).toBe(0);
      expect(resumo.total_atrasado).toBe(0);
      expect(resumo.itens).toHaveLength(0);
    });
  });
});
