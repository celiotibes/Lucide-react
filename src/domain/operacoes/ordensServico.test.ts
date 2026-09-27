import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import { criarEntidadeLegal } from "../erp/entidadeLegal";
import {
  criarOrdemServico,
  atribuirPrestador,
  registrarEventoOS,
  solicitarDespesaOS,
  aprovarDespesaOS,
  rejeitarDespesaOS,
  avaliarPrestador,
  listarOrdensServico,
  obterOrdemServicoComHistorico,
  LIMITE_APROVACAO_DUPLA,
} from "./ordensServico";

/** Cenário determinístico contra o schema REAL (contabilidade-reconstituicao/schema.sql),
 * via criarBancoDeTeste() — nunca contra um CREATE TABLE inventado no teste. */
describe("ordensServico", () => {
  let db: Database;
  const IMOVEL_1 = 1;
  const PRESTADOR_1 = 1;
  const PRESTADOR_2 = 2;

  beforeEach(async () => {
    db = await criarBancoDeTeste();
    const r = criarEntidadeLegal(db, { nome: "Titular de Teste", cpf_cnpj: "52998224725" });
    if (!r.sucesso) throw new Error(`Fixture não conseguiu criar a entidade: ${r.mensagem}`);

    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, endereco, financiado, uso_pessoal, valor_aquisicao)
       VALUES (?, ?, ?, ?, 0, 0, ?)`,
      [IMOVEL_1, "Apto 101", "apartamento", "Rua Principal 123, Apto 101", 300000],
    );
    executar(db, `INSERT INTO prestadores (id, nome, cpf_cnpj, servico) VALUES (?, ?, ?, ?)`, [
      PRESTADOR_1,
      "João Reparos Ltda",
      "11122233344",
      "hidráulica",
    ]);
    executar(db, `INSERT INTO prestadores (id, nome, cpf_cnpj, servico) VALUES (?, ?, ?, ?)`, [
      PRESTADOR_2,
      "Maria Elétrica ME",
      "22233344455",
      "elétrica",
    ]);
  });

  describe("ciclo de vida completo", () => {
    it("cria, atribui, inicia e conclui uma ordem de serviço", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Vazamento no banheiro" });
      expect(criada.sucesso).toBe(true);
      const osId = criada.id!;

      const ordemInicial = obterOrdemServicoComHistorico(db, osId)!;
      expect(ordemInicial.ordem.status).toBe("aberta");
      expect(ordemInicial.ordem.prestador_id).toBeNull();
      expect(ordemInicial.eventos).toHaveLength(0);

      const atribuicao = atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");
      expect(atribuicao.sucesso).toBe(true);

      const inicio = registrarEventoOS(db, osId, "iniciada", "João Reparos Ltda");
      expect(inicio.sucesso).toBe(true);

      const conclusao = registrarEventoOS(db, osId, "concluida", "João Reparos Ltda", "Vazamento consertado.");
      expect(conclusao.sucesso).toBe(true);

      const historico = obterOrdemServicoComHistorico(db, osId)!;
      expect(historico.ordem.status).toBe("concluida");
      expect(historico.ordem.prestador_id).toBe(PRESTADOR_1);
      expect(historico.ordem.encerrado_em).not.toBeNull();
      expect(historico.eventos.map((e) => e.tipo_evento)).toEqual(["atribuida", "iniciada", "concluida"]);
    });
  });

  describe("transições inválidas", () => {
    it("recusa concluir uma ordem que ainda não foi iniciada", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Pintura" });
      const osId = criada.id!;
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const resultado = registrarEventoOS(db, osId, "concluida", "João Reparos Ltda");
      expect(resultado.sucesso).toBe(false);
      expect(resultado.mensagem).toMatch(/transição inválida/i);

      // Nada foi gravado: nem status, nem evento.
      const historico = obterOrdemServicoComHistorico(db, osId)!;
      expect(historico.ordem.status).toBe("atribuida");
      expect(historico.eventos).toHaveLength(1); // só o evento de atribuição
    });

    it("recusa o evento 'atribuida' via registrarEventoOS (rota exclusiva de atribuirPrestador)", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Troca de fechadura" });
      const resultado = registrarEventoOS(db, criada.id!, "atribuida", "Síndico");
      expect(resultado.sucesso).toBe(false);
      expect(resultado.mensagem).toMatch(/atribuirPrestador/);
    });

    it("permite reabrir uma ordem impedida e depois concluí-la", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Reforma elétrica" });
      const osId = criada.id!;
      atribuirPrestador(db, osId, PRESTADOR_2, "Síndico");
      registrarEventoOS(db, osId, "iniciada", "Maria Elétrica ME");
      registrarEventoOS(db, osId, "impedida", "Maria Elétrica ME", "Falta de material.");

      expect(obterOrdemServicoComHistorico(db, osId)!.ordem.status).toBe("impedida");

      const reabertura = registrarEventoOS(db, osId, "reaberta", "Síndico", "Material chegou.");
      expect(reabertura.sucesso).toBe(true);
      expect(obterOrdemServicoComHistorico(db, osId)!.ordem.status).toBe("em_andamento");

      const conclusao = registrarEventoOS(db, osId, "concluida", "Maria Elétrica ME");
      expect(conclusao.sucesso).toBe(true);
    });
  });

  describe("avaliação de prestador", () => {
    it("bloqueia avaliação se a ordem não estiver concluída", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Jardinagem" });
      const osId = criada.id!;
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const avaliacao = avaliarPrestador(db, osId, PRESTADOR_1, 5, "Ótimo serviço");
      expect(avaliacao.sucesso).toBe(false);
      expect(avaliacao.mensagem).toMatch(/concluida/);
    });

    it("permite avaliar após conclusão e impede duplicar", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Dedetização" });
      const osId = criada.id!;
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");
      registrarEventoOS(db, osId, "iniciada", "João Reparos Ltda");
      registrarEventoOS(db, osId, "concluida", "João Reparos Ltda");

      const primeira = avaliarPrestador(db, osId, PRESTADOR_1, 4, "Bom, mas atrasou.");
      expect(primeira.sucesso).toBe(true);

      const duplicada = avaliarPrestador(db, osId, PRESTADOR_1, 5);
      expect(duplicada.sucesso).toBe(false);
      expect(duplicada.mensagem).toMatch(/já foi avaliada/i);

      const historico = obterOrdemServicoComHistorico(db, osId)!;
      expect(historico.avaliacao?.nota).toBe(4);
    });
  });

  describe("despesas da OS — aprovação por alçada", () => {
    it("aprova despesa abaixo do limite com um único aprovador e gera contas_a_pagar", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Troca de torneira" });
      const osId = criada.id!;
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const valorBaixo = LIMITE_APROVACAO_DUPLA - 100;
      const solicitacao = solicitarDespesaOS(db, osId, valorBaixo, "Síndico");
      expect(solicitacao.sucesso).toBe(true);
      const despesaId = solicitacao.id!;

      const aprovacao = aprovarDespesaOS(db, despesaId, "Síndico");
      expect(aprovacao.sucesso).toBe(true);
      expect(aprovacao.mensagem).toMatch(/conta a pagar/i);

      const [despesa] = consultar<{ status: string; contas_a_pagar_id: number | null; valor_aprovado: number }>(
        db,
        "SELECT status, contas_a_pagar_id, valor_aprovado FROM ordens_servico_despesas WHERE id = ?",
        [despesaId],
      );
      expect(despesa.status).toBe("aprovada");
      expect(despesa.contas_a_pagar_id).not.toBeNull();
      expect(despesa.valor_aprovado).toBe(valorBaixo);

      const [conta] = consultar<{ valor: number; plano_conta_codigo: string; fornecedor_nome: string; imovel_id: number }>(
        db,
        "SELECT valor, plano_conta_codigo, fornecedor_nome, imovel_id FROM contas_a_pagar WHERE id = ?",
        [despesa.contas_a_pagar_id],
      );
      expect(conta.valor).toBe(valorBaixo);
      expect(conta.plano_conta_codigo).toBe("2.1.04");
      expect(conta.fornecedor_nome).toBe("João Reparos Ltda");
      expect(conta.imovel_id).toBe(IMOVEL_1);
    });

    it("exige quórum duplo acima do limite: dois aprovadores diferentes geram contas_a_pagar", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Reforma do telhado" });
      const osId = criada.id!;
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const valorAlto = LIMITE_APROVACAO_DUPLA + 500;
      const solicitacao = solicitarDespesaOS(db, osId, valorAlto, "Síndico");
      const despesaId = solicitacao.id!;

      // Solicitante já ocupa aprovador_1 (ver decisão de design); primeira aprovação real
      // precisa vir de alguém diferente.
      const primeiraAprovacao = aprovarDespesaOS(db, despesaId, "Contador");
      expect(primeiraAprovacao.sucesso).toBe(true);

      const [aindaPendente] = consultar<{ status: string; contas_a_pagar_id: number | null }>(
        db,
        "SELECT status, contas_a_pagar_id FROM ordens_servico_despesas WHERE id = ?",
        [despesaId],
      );
      expect(aindaPendente.status).toBe("aprovada");
      expect(aindaPendente.contas_a_pagar_id).not.toBeNull();
    });

    it("recusa quórum duplo quando o segundo aprovador é o mesmo do primeiro (autoaprovação)", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Reforma da fachada" });
      const osId = criada.id!;
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const valorAlto = LIMITE_APROVACAO_DUPLA + 500;
      const solicitacao = solicitarDespesaOS(db, osId, valorAlto, "Contador");
      const despesaId = solicitacao.id!;

      // aprovador_1 já é "Contador" (do solicitante); a mesma pessoa tenta aprovar de novo.
      const tentativa = aprovarDespesaOS(db, despesaId, "Contador");
      expect(tentativa.sucesso).toBe(false);
      expect(tentativa.mensagem).toMatch(/autoaprovação/i);

      const [despesa] = consultar<{ status: string }>(db, "SELECT status FROM ordens_servico_despesas WHERE id = ?", [
        despesaId,
      ]);
      expect(despesa.status).toBe("pendente");
    });

    it("é idempotente: não duplica contas_a_pagar ao tentar aprovar uma despesa já aprovada", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Troca de bomba d'água" });
      const osId = criada.id!;
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const valorBaixo = LIMITE_APROVACAO_DUPLA - 200;
      const solicitacao = solicitarDespesaOS(db, osId, valorBaixo, "Síndico");
      const despesaId = solicitacao.id!;

      aprovarDespesaOS(db, despesaId, "Síndico");
      // Segunda chamada sobre despesa já aprovada é recusada explicitamente (não pode
      // aprovar de novo), então não há novo INSERT em contas_a_pagar de qualquer forma.
      const segunda = aprovarDespesaOS(db, despesaId, "Síndico");
      expect(segunda.sucesso).toBe(false);

      const totalContas = consultar<{ total: number }>(
        db,
        "SELECT COUNT(*) AS total FROM contas_a_pagar",
      )[0].total;
      expect(totalContas).toBe(1);
    });

    it("rejeita despesa pendente sem gerar contas_a_pagar", () => {
      const criada = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Pintura externa" });
      const osId = criada.id!;
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const solicitacao = solicitarDespesaOS(db, osId, 300, "Síndico");
      const despesaId = solicitacao.id!;

      const rejeicao = rejeitarDespesaOS(db, despesaId, "Fora do escopo do contrato.");
      expect(rejeicao.sucesso).toBe(true);

      const [despesa] = consultar<{ status: string; contas_a_pagar_id: number | null }>(
        db,
        "SELECT status, contas_a_pagar_id FROM ordens_servico_despesas WHERE id = ?",
        [despesaId],
      );
      expect(despesa.status).toBe("rejeitada");
      expect(despesa.contas_a_pagar_id).toBeNull();

      const historico = obterOrdemServicoComHistorico(db, osId)!;
      expect(historico.eventos.some((e) => e.detalhes?.includes("rejeitada"))).toBe(true);
    });
  });

  describe("listagem", () => {
    it("filtra ordens de serviço por imóvel, status e prestador", () => {
      const os1 = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "OS 1" }).id!;
      const os2 = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "OS 2" }).id!;
      atribuirPrestador(db, os2, PRESTADOR_1, "Síndico");

      const todas = listarOrdensServico(db, { imovelId: IMOVEL_1 });
      expect(todas.map((o) => o.id).sort()).toEqual([os1, os2].sort());

      const abertas = listarOrdensServico(db, { status: "aberta" });
      expect(abertas.map((o) => o.id)).toEqual([os1]);

      const doPrestador = listarOrdensServico(db, { prestadorId: PRESTADOR_1 });
      expect(doPrestador.map((o) => o.id)).toEqual([os2]);
    });
  });
});
