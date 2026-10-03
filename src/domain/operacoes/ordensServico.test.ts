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
  dispararNotificacaoPrestadorOS,
  montarMensagemNotificacaoOS,
  LIMITE_APROVACAO_DUPLA,
} from "./ordensServico";
import type { NotificacoesApiClient, ResultadoDisparo } from "../notificacoes/despachoCliente";

/** Fake do apiClient de notificações — nunca toca rede; mesmo espírito do fake usado em
 * `../notificacoes/__tests__/despachoCliente.test.ts`, duplicado aqui por conveniência de
 * teste (não exportado de lá). */
function criarApiClienteNotificacaoFake(
  gerarResultado: (canal: "email" | "whatsapp" | "telegram", destinatario: string) => ResultadoDisparo = (canal, destinatario) => ({
    canal,
    destinatario,
    status: "enviado",
  }),
): NotificacoesApiClient & { chamadas: unknown[] } {
  const chamadas: unknown[] = [];
  return {
    chamadas,
    async disparar(dados) {
      chamadas.push(dados);
      const resultados: ResultadoDisparo[] = [];
      if (dados.destinatarios.email) resultados.push(gerarResultado("email", dados.destinatarios.email));
      if (dados.destinatarios.whatsappE164) resultados.push(gerarResultado("whatsapp", dados.destinatarios.whatsappE164));
      if (dados.destinatarios.telegramChatId) resultados.push(gerarResultado("telegram", dados.destinatarios.telegramChatId));
      return { resultados };
    },
  };
}

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
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Vazamento no banheiro" });
      expect(osId).toBeGreaterThan(0);

      const ordemInicial = obterOrdemServicoComHistorico(db, osId)!;
      expect(ordemInicial.ordem.status).toBe("aberta");
      expect(ordemInicial.ordem.prestador_id).toBeNull();
      expect(ordemInicial.eventos).toHaveLength(0);

      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const statusAposIniciar = registrarEventoOS(db, osId, "iniciada", "João Reparos Ltda");
      expect(statusAposIniciar).toBe("em_andamento");

      const statusAposConcluir = registrarEventoOS(db, osId, "concluida", "João Reparos Ltda", "Vazamento consertado.");
      expect(statusAposConcluir).toBe("concluida");

      const historico = obterOrdemServicoComHistorico(db, osId)!;
      expect(historico.ordem.status).toBe("concluida");
      expect(historico.ordem.prestador_id).toBe(PRESTADOR_1);
      expect(historico.ordem.encerrado_em).not.toBeNull();
      expect(historico.eventos.map((e) => e.tipo_evento)).toEqual(["atribuida", "iniciada", "concluida"]);
    });
  });

  describe("transições inválidas", () => {
    it("recusa concluir uma ordem que ainda não foi iniciada", () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Pintura" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      expect(() => registrarEventoOS(db, osId, "concluida", "João Reparos Ltda")).toThrow(/transição inválida/i);

      // Nada foi gravado: nem status, nem evento.
      const historico = obterOrdemServicoComHistorico(db, osId)!;
      expect(historico.ordem.status).toBe("atribuida");
      expect(historico.eventos).toHaveLength(1); // só o evento de atribuição
    });

    it("recusa o evento 'atribuida' via registrarEventoOS (rota exclusiva de atribuirPrestador)", () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Troca de fechadura" });
      expect(() => registrarEventoOS(db, osId, "atribuida", "Síndico")).toThrow(/atribuirPrestador/);
    });

    it("permite reabrir uma ordem impedida e depois concluí-la", () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Reforma elétrica" });
      atribuirPrestador(db, osId, PRESTADOR_2, "Síndico");
      registrarEventoOS(db, osId, "iniciada", "Maria Elétrica ME");
      registrarEventoOS(db, osId, "impedida", "Maria Elétrica ME", "Falta de material.");

      expect(obterOrdemServicoComHistorico(db, osId)!.ordem.status).toBe("impedida");

      const statusAposReabrir = registrarEventoOS(db, osId, "reaberta", "Síndico", "Material chegou.");
      expect(statusAposReabrir).toBe("em_andamento");
      expect(obterOrdemServicoComHistorico(db, osId)!.ordem.status).toBe("em_andamento");

      expect(() => registrarEventoOS(db, osId, "concluida", "Maria Elétrica ME")).not.toThrow();
    });
  });

  describe("avaliação de prestador", () => {
    it("bloqueia avaliação se a ordem não estiver concluída", () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Jardinagem" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      expect(() => avaliarPrestador(db, osId, PRESTADOR_1, 5, "Ótimo serviço")).toThrow(/concluida/);
    });

    it("permite avaliar após conclusão e impede duplicar", () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Dedetização" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");
      registrarEventoOS(db, osId, "iniciada", "João Reparos Ltda");
      registrarEventoOS(db, osId, "concluida", "João Reparos Ltda");

      const avaliacaoId = avaliarPrestador(db, osId, PRESTADOR_1, 4, "Bom, mas atrasou.");
      expect(avaliacaoId).toBeGreaterThan(0);

      expect(() => avaliarPrestador(db, osId, PRESTADOR_1, 5)).toThrow(/já foi avaliada/i);

      const historico = obterOrdemServicoComHistorico(db, osId)!;
      expect(historico.avaliacao?.nota).toBe(4);
    });
  });

  describe("despesas da OS — aprovação por alçada", () => {
    it("aprova despesa abaixo do limite com um único aprovador e gera contas_a_pagar", () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Troca de torneira" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const valorBaixo = LIMITE_APROVACAO_DUPLA - 100;
      const despesaId = solicitarDespesaOS(db, osId, valorBaixo, "Síndico");

      const aprovacao = aprovarDespesaOS(db, despesaId, "Síndico");
      expect(aprovacao.status).toBe("aprovada");
      expect(aprovacao.contasAPagarId).not.toBeNull();

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
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Reforma do telhado" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const valorAlto = LIMITE_APROVACAO_DUPLA + 500;
      const despesaId = solicitarDespesaOS(db, osId, valorAlto, "Síndico");

      // Solicitante já ocupa aprovador_1 (ver decisão de design); primeira aprovação real
      // precisa vir de alguém diferente.
      const primeiraAprovacao = aprovarDespesaOS(db, despesaId, "Contador");
      expect(primeiraAprovacao.status).toBe("aprovada");
      expect(primeiraAprovacao.contasAPagarId).not.toBeNull();

      const [aindaPendente] = consultar<{ status: string; contas_a_pagar_id: number | null }>(
        db,
        "SELECT status, contas_a_pagar_id FROM ordens_servico_despesas WHERE id = ?",
        [despesaId],
      );
      expect(aindaPendente.status).toBe("aprovada");
      expect(aindaPendente.contas_a_pagar_id).not.toBeNull();
    });

    it("recusa quórum duplo quando o segundo aprovador é o mesmo do primeiro (autoaprovação)", () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Reforma da fachada" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const valorAlto = LIMITE_APROVACAO_DUPLA + 500;
      const despesaId = solicitarDespesaOS(db, osId, valorAlto, "Contador");

      // aprovador_1 já é "Contador" (do solicitante); a mesma pessoa tenta aprovar de novo.
      expect(() => aprovarDespesaOS(db, despesaId, "Contador")).toThrow(/autoaprovação/i);

      const [despesa] = consultar<{ status: string }>(db, "SELECT status FROM ordens_servico_despesas WHERE id = ?", [
        despesaId,
      ]);
      expect(despesa.status).toBe("pendente");
    });

    it("é idempotente: não duplica contas_a_pagar ao tentar aprovar uma despesa já aprovada", () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Troca de bomba d'água" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const valorBaixo = LIMITE_APROVACAO_DUPLA - 200;
      const despesaId = solicitarDespesaOS(db, osId, valorBaixo, "Síndico");

      aprovarDespesaOS(db, despesaId, "Síndico");
      // Segunda chamada sobre despesa já aprovada é recusada explicitamente (não pode
      // aprovar de novo), então não há novo INSERT em contas_a_pagar de qualquer forma.
      expect(() => aprovarDespesaOS(db, despesaId, "Síndico")).toThrow(/já está 'aprovada'/i);

      const totalContas = consultar<{ total: number }>(
        db,
        "SELECT COUNT(*) AS total FROM contas_a_pagar",
      )[0].total;
      expect(totalContas).toBe(1);
    });

    it("rejeita despesa pendente sem gerar contas_a_pagar", () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Pintura externa" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const despesaId = solicitarDespesaOS(db, osId, 300, "Síndico");

      expect(() => rejeitarDespesaOS(db, despesaId, "Fora do escopo do contrato.")).not.toThrow();

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
      const os1 = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "OS 1" });
      const os2 = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "OS 2" });
      atribuirPrestador(db, os2, PRESTADOR_1, "Síndico");

      const todas = listarOrdensServico(db, { imovelId: IMOVEL_1 });
      expect(todas.map((o) => o.id).sort()).toEqual([os1, os2].sort());

      const abertas = listarOrdensServico(db, { status: "aberta" });
      expect(abertas.map((o) => o.id)).toEqual([os1]);

      const doPrestador = listarOrdensServico(db, { prestadorId: PRESTADOR_1 });
      expect(doPrestador.map((o) => o.id)).toEqual([os2]);
    });
  });

  describe("notificação ao prestador", () => {
    it("monta a mensagem com imóvel, serviço, descrição, prioridade e SLA", () => {
      const { assunto, mensagem } = montarMensagemNotificacaoOS({
        titulo: "Vazamento no banheiro",
        descricao: "Vazando embaixo da pia",
        prioridade: "urgente",
        slaDataLimite: "2026-11-05",
        apelidoImovel: "Apto 101",
      });
      expect(assunto).toContain("Vazamento no banheiro");
      expect(mensagem).toContain("Apto 101");
      expect(mensagem).toContain("Vazando embaixo da pia");
      expect(mensagem).toContain("Urgente");
      expect(mensagem).toContain("05/11/2026");
    });

    it("omite descrição/SLA da mensagem quando a ordem não os tem", () => {
      const { mensagem } = montarMensagemNotificacaoOS({
        titulo: "Jardinagem",
        descricao: null,
        prioridade: "normal",
        slaDataLimite: null,
        apelidoImovel: "Apto 101",
      });
      expect(mensagem).not.toContain("Descrição");
      expect(mensagem).not.toContain("SLA");
    });

    it("dispara e-mail/WhatsApp para o prestador atribuído quando ele tem contato cadastrado", async () => {
      executar(db, "UPDATE prestadores SET email = ?, telefone = ? WHERE id = ?", [
        "joao@reparos.example.com",
        "11988887777",
        PRESTADOR_1,
      ]);
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Vazamento no banheiro", prioridade: "alta" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico");

      const apiClient = criarApiClienteNotificacaoFake();
      const resultados = await dispararNotificacaoPrestadorOS(db, apiClient, osId);

      expect(resultados.find((r) => r.canal === "email")).toMatchObject({ status: "enviado", destinatario: "joao@reparos.example.com" });
      expect(resultados.find((r) => r.canal === "whatsapp")).toMatchObject({ status: "enviado", destinatario: "+5511988887777" });
      // Prestador não tem vínculo de Telegram confirmado -> canal pulado, não erro.
      expect(resultados.find((r) => r.canal === "telegram")).toMatchObject({ status: "pulado" });
      expect(apiClient.chamadas).toHaveLength(1);
    });

    it("prestador sem e-mail/telefone cadastrado: os 3 canais vêm 'pulado', sem chamar o apiClient", async () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "Jardinagem" });
      atribuirPrestador(db, osId, PRESTADOR_1, "Síndico"); // PRESTADOR_1 criado sem email/telefone na fixture

      const apiClient = criarApiClienteNotificacaoFake();
      const resultados = await dispararNotificacaoPrestadorOS(db, apiClient, osId);

      expect(resultados).toHaveLength(3);
      expect(resultados.every((r) => r.status === "pulado")).toBe(true);
      expect(apiClient.chamadas).toHaveLength(0);
    });

    it("recusa notificar uma ordem sem prestador atribuído", async () => {
      const osId = criarOrdemServico(db, { imovelId: IMOVEL_1, titulo: "OS sem prestador" });
      const apiClient = criarApiClienteNotificacaoFake();
      await expect(dispararNotificacaoPrestadorOS(db, apiClient, osId)).rejects.toThrow(/não tem prestador atribuído/i);
      expect(apiClient.chamadas).toHaveLength(0);
    });
  });
});
