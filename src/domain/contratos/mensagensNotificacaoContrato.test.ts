import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { consultar, executar } from "../../db/connection";
import {
  obterLocatarioPrincipalId,
  montarMensagemInadimplencia,
  montarMensagemRad,
  montarMensagemReajuste,
  montarMensagemRescisao,
  resumirResultadosDisparo,
} from "./mensagensNotificacaoContrato";
import type { ResultadoDisparo } from "../notificacoes/despachoCliente";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

function criarImovel(apelido = "Kitnet 1"): number {
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado) VALUES (?, 'kitnet', 0)", [apelido]);
  return ultimoId("imoveis");
}

function criarContrato(): number {
  const imovelId = criarImovel();
  executar(
    db,
    `INSERT INTO contratos_locacao
      (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
     VALUES (?, 'Maria Locatária', 'residencial_fixo', 1000, 10, '2024-01-01')`,
    [imovelId],
  );
  return ultimoId("contratos_locacao");
}

describe("mensagensNotificacaoContrato", () => {
  describe("obterLocatarioPrincipalId", () => {
    it("devolve o id do locatário principal (papel='locatario', o mais antigo) do contrato", () => {
      const contratoId = criarContrato();
      executar(db, "INSERT INTO contrato_locatarios (contrato_id, nome, papel) VALUES (?, 'Responsável Solidário', 'responsavel_solidario')", [contratoId]);
      executar(db, "INSERT INTO contrato_locatarios (contrato_id, nome, papel) VALUES (?, 'Maria Locatária', 'locatario')", [contratoId]);
      executar(db, "INSERT INTO contrato_locatarios (contrato_id, nome, papel) VALUES (?, 'João Co-locatário', 'locatario')", [contratoId]);

      const id = obterLocatarioPrincipalId(db, contratoId);
      const esperado = consultar<{ id: number }>(db, "SELECT id FROM contrato_locatarios WHERE nome = 'Maria Locatária'")[0].id;
      expect(id).toBe(esperado);
    });

    it("devolve null quando o contrato não tem nenhum locatário cadastrado", () => {
      const contratoId = criarContrato();
      expect(obterLocatarioPrincipalId(db, contratoId)).toBeNull();
    });
  });

  describe("montarMensagemInadimplencia", () => {
    it("inclui multa e juros quando maiores que zero", () => {
      const { assunto, mensagem } = montarMensagemInadimplencia({
        locatario: "Maria Locatária",
        imovelApelido: "Kitnet 1",
        diasAtraso: 45,
        valorAluguelVencido: 1000,
        multaValor: 20,
        jurosValor: 5.5,
        valorTotalDevido: 1025.5,
      });
      expect(assunto).toContain("Kitnet 1");
      expect(mensagem).toContain("Maria Locatária");
      expect(mensagem).toContain("45 dia(s)");
      expect(mensagem).toContain("multa de mora");
      expect(mensagem).toContain("juros de mora");
      expect(mensagem).toContain("R$");
    });

    it("omite as frases de multa/juros quando os valores são zero", () => {
      const { mensagem } = montarMensagemInadimplencia({
        locatario: "Maria Locatária",
        imovelApelido: "Kitnet 1",
        diasAtraso: 10,
        valorAluguelVencido: 1000,
        multaValor: 0,
        jurosValor: 0,
        valorTotalDevido: 1000,
      });
      expect(mensagem).not.toContain("multa de mora");
      expect(mensagem).not.toContain("juros de mora");
    });
  });

  describe("montarMensagemRad", () => {
    it("lista só os itens aceitos e mostra o valor total de dedução", () => {
      const { assunto, mensagem } = montarMensagemRad({
        locatario: "Maria Locatária",
        imovelApelido: "Kitnet 1",
        versao: 2,
        status: "emitido",
        valorTotalDeducao: 350,
        itens: [
          { descricao: "Pintura danificada", valorDepreciado: 250, aceito: true },
          { descricao: "Item rejeitado", valorDepreciado: 100, aceito: false },
          { descricao: "Vidro quebrado", valorDepreciado: 100, aceito: true },
        ],
      });
      expect(assunto).toContain("v2");
      expect(mensagem).toContain("Pintura danificada");
      expect(mensagem).toContain("Vidro quebrado");
      expect(mensagem).not.toContain("Item rejeitado");
      expect(mensagem).toContain("350,00");
    });

    it("avisa que ainda está em apuração quando valorTotalDeducao é null", () => {
      const { mensagem } = montarMensagemRad({
        locatario: "Maria Locatária",
        imovelApelido: "Kitnet 1",
        versao: 1,
        status: "rascunho",
        valorTotalDeducao: null,
        itens: [],
      });
      expect(mensagem).toContain("ainda em apuração");
      expect(mensagem).toContain("nenhum item de dedução apurado");
    });
  });

  describe("montarMensagemReajuste", () => {
    it("monta assunto e mensagem com valores e critério", () => {
      const { assunto, mensagem } = montarMensagemReajuste({
        locatario: "Maria Locatária",
        imovelApelido: "Kitnet 1",
        valorAtual: 1000,
        valorSugerido: 1080,
        percentual: 8,
        criterio: "igpm",
        dataVigencia: "2026-01-01",
      });
      expect(assunto).toContain("Reajuste");
      expect(mensagem).toContain("2026-01-01");
      expect(mensagem).toContain("igpm");
      expect(mensagem).toContain("8.00%");
    });
  });

  describe("montarMensagemRescisao", () => {
    it("monta assunto e mensagem com a multa proporcional apurada", () => {
      const { assunto, mensagem } = montarMensagemRescisao({
        locatario: "Maria Locatária",
        imovelApelido: "Kitnet 1",
        dataRescisao: "2026-03-01",
        mesesRestantes: 4,
        multaProporcional: 2000,
      });
      expect(assunto).toContain("Rescisão");
      expect(mensagem).toContain("4 mês(es)");
      expect(mensagem).toContain("2.000,00");
    });
  });

  describe("resumirResultadosDisparo", () => {
    it("resume canais enviados, falhos e pulados numa única frase", () => {
      const resultados: ResultadoDisparo[] = [
        { canal: "email", destinatario: "a@b.com", status: "enviado" },
        { canal: "whatsapp", destinatario: "+5511999999999", status: "falha", motivo: "timeout" },
        { canal: "telegram", destinatario: "(nenhum)", status: "pulado", motivo: "sem vínculo" },
      ];
      const resumo = resumirResultadosDisparo(resultados);
      expect(resumo).toContain("enviado por e-mail");
      expect(resumo).toContain("falhou em WhatsApp (timeout)");
      expect(resumo).toContain("sem destinatário em Telegram");
    });

    it("devolve mensagem genérica quando a lista está vazia", () => {
      expect(resumirResultadosDisparo([])).toBe("nenhum canal disponível para este destinatário");
    });
  });
});
