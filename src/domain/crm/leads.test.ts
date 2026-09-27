import { beforeEach, describe, expect, it } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../test/fixtureDb";
import { executar, consultar } from "../../db/connection";
import {
  criarLead,
  moverEtapaLead,
  criarPropostaLead,
  enviarProposta,
  decidirProposta,
  listarLeads,
  obterLeadComHistorico,
  funilResumo,
  type EtapaLead,
} from "./leads";

/** Cenário determinístico contra o schema REAL (contabilidade-reconstituicao/schema.sql),
 * via criarBancoDeTeste() — nunca contra um CREATE TABLE inventado no teste. */
describe("leads (CRM leve)", () => {
  let db: Database;
  const IMOVEL_1 = 1;
  const IMOVEL_2 = 2;

  beforeEach(async () => {
    db = await criarBancoDeTeste();
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
      [IMOVEL_2, "Kitnet 202", "kitnet", "Rua Secundária 456", 500000],
    );
  });

  describe("criarLead", () => {
    it("cria um lead sempre em etapa 'novo'", () => {
      const r = criarLead(db, { nome: "Fulano de Tal", imovelId: IMOVEL_1, contato: "11999998888", fonte: "site" });
      expect(r.sucesso).toBe(true);
      const lead = obterLeadComHistorico(db, r.id!)!;
      expect(lead.etapa).toBe("novo");
      expect(lead.eventos).toHaveLength(0);
    });

    it("recusa lead sem nome", () => {
      const r = criarLead(db, { nome: "   " });
      expect(r.sucesso).toBe(false);
    });

    it("recusa lead com imóvel inexistente", () => {
      const r = criarLead(db, { nome: "Fulano", imovelId: 999 });
      expect(r.sucesso).toBe(false);
    });

    it("aceita lead sem imóvel vinculado (interesse ainda não ligado a imóvel específico)", () => {
      const r = criarLead(db, { nome: "Fulano" });
      expect(r.sucesso).toBe(true);
    });
  });

  describe("ciclo completo do funil até convertido", () => {
    it("avança novo -> contatado -> visita_agendada -> proposta -> convertido, com proposta aceita, e NÃO cria contrato automaticamente", () => {
      const { id: leadId } = criarLead(db, { nome: "Maria Compradora", imovelId: IMOVEL_1 });

      expect(moverEtapaLead(db, leadId!, "contatado", "Operador A").sucesso).toBe(true);
      expect(moverEtapaLead(db, leadId!, "visita_agendada", "Operador A").sucesso).toBe(true);
      expect(moverEtapaLead(db, leadId!, "proposta", "Operador A").sucesso).toBe(true);

      const antesConverter = obterLeadComHistorico(db, leadId!)!;
      expect(antesConverter.etapa).toBe("proposta");
      expect(antesConverter.eventos.map((e) => e.etapa_nova)).toEqual(["contatado", "visita_agendada", "proposta"]);
      expect(antesConverter.eventos.every((e) => e.etapa_anterior && e.ator === "Operador A")).toBe(true);

      const proposta = criarPropostaLead(db, { leadId: leadId!, imovelId: IMOVEL_1, valorProposto: 280000 });
      expect(proposta.sucesso).toBe(true);

      expect(enviarProposta(db, proposta.id!).sucesso).toBe(true);

      const decisao = decidirProposta(db, proposta.id!, true, "Operador B");
      expect(decisao.sucesso).toBe(true);

      const leadFinal = obterLeadComHistorico(db, leadId!)!;
      expect(leadFinal.etapa).toBe("convertido");
      expect(leadFinal.eventos.at(-1)).toMatchObject({
        etapa_anterior: "proposta",
        etapa_nova: "convertido",
        ator: "Operador B",
      });
      expect(leadFinal.propostas[0].status).toBe("aceita");
      expect(leadFinal.propostas[0].decidido_em).not.toBeNull();

      // REGRA DE OURO: proposta aceita converte o lead, mas NUNCA cria linha em
      // contratos_locacao automaticamente — isso continua sendo ação manual do usuário.
      const contratos = consultar<{ total: number }>(db, "SELECT COUNT(*) AS total FROM contratos_locacao");
      expect(contratos[0].total).toBe(0);
    });
  });

  describe("moverEtapaLead — máquina de estados", () => {
    it("recusa pular etapa (novo direto para proposta)", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      const r = moverEtapaLead(db, leadId!, "proposta", "Operador A");
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/inválida/i);
      expect(obterLeadComHistorico(db, leadId!)!.etapa).toBe("novo");
    });

    it("permite ir para 'perdido' a partir de qualquer etapa não-terminal", () => {
      // sequência completa de passos necessários para o lead alcançar cada etapa alvo
      const passosAte: Record<"novo" | "contatado" | "visita_agendada" | "proposta", readonly EtapaLead[]> = {
        novo: [],
        contatado: ["contatado"],
        visita_agendada: ["contatado", "visita_agendada"],
        proposta: ["contatado", "visita_agendada", "proposta"],
      };

      for (const [etapaAlvo, passos] of Object.entries(passosAte) as [
        keyof typeof passosAte,
        readonly EtapaLead[],
      ][]) {
        const { id: leadId } = criarLead(db, { nome: `Lead ${etapaAlvo}` });
        for (const passo of passos) {
          moverEtapaLead(db, leadId!, passo, "Operador A");
        }
        expect(obterLeadComHistorico(db, leadId!)!.etapa).toBe(etapaAlvo);

        const r = moverEtapaLead(db, leadId!, "perdido", "Operador A");
        expect(r.sucesso).toBe(true);
        expect(obterLeadComHistorico(db, leadId!)!.etapa).toBe("perdido");
      }
    });

    it("nenhuma transição é aceita a partir de 'convertido' (estado terminal)", () => {
      const { id: leadId } = criarLead(db, { nome: "Lead Convertido" });
      moverEtapaLead(db, leadId!, "contatado", "A");
      moverEtapaLead(db, leadId!, "visita_agendada", "A");
      moverEtapaLead(db, leadId!, "proposta", "A");
      moverEtapaLead(db, leadId!, "convertido", "A");

      const r1 = moverEtapaLead(db, leadId!, "perdido", "A");
      expect(r1.sucesso).toBe(false);
      expect(r1.mensagem).toMatch(/terminal/i);

      const r2 = moverEtapaLead(db, leadId!, "contatado", "A");
      expect(r2.sucesso).toBe(false);
    });

    it("nenhuma transição é aceita a partir de 'perdido' (estado terminal)", () => {
      const { id: leadId } = criarLead(db, { nome: "Lead Perdido" });
      moverEtapaLead(db, leadId!, "perdido", "A");

      const r1 = moverEtapaLead(db, leadId!, "contatado", "A");
      expect(r1.sucesso).toBe(false);
      expect(r1.mensagem).toMatch(/terminal/i);

      const r2 = moverEtapaLead(db, leadId!, "convertido", "A");
      expect(r2.sucesso).toBe(false);
    });

    it("recusa lead inexistente", () => {
      const r = moverEtapaLead(db, 999, "contatado", "A");
      expect(r.sucesso).toBe(false);
    });

    it("exige ator não vazio", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      const r = moverEtapaLead(db, leadId!, "contatado", "  ");
      expect(r.sucesso).toBe(false);
    });
  });

  describe("propostas", () => {
    it("criarPropostaLead nasce em 'rascunho' e não muda a etapa do lead sozinho", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      const r = criarPropostaLead(db, { leadId: leadId!, imovelId: IMOVEL_1, valorProposto: 100000 });
      expect(r.sucesso).toBe(true);
      const lead = obterLeadComHistorico(db, leadId!)!;
      expect(lead.etapa).toBe("novo");
      expect(lead.propostas[0].status).toBe("rascunho");
    });

    it("recusa criar proposta para lead em etapa terminal (convertido/perdido)", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      moverEtapaLead(db, leadId!, "perdido", "A");
      const r = criarPropostaLead(db, { leadId: leadId!, imovelId: IMOVEL_1, valorProposto: 100000 });
      expect(r.sucesso).toBe(false);
      expect(r.mensagem).toMatch(/terminal/i);
    });

    it("recusa proposta com valor não positivo", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      const r = criarPropostaLead(db, { leadId: leadId!, imovelId: IMOVEL_1, valorProposto: 0 });
      expect(r.sucesso).toBe(false);
    });

    it("enviarProposta só a partir de 'rascunho'", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      const { id: propostaId } = criarPropostaLead(db, { leadId: leadId!, imovelId: IMOVEL_1, valorProposto: 100000 });
      expect(enviarProposta(db, propostaId!).sucesso).toBe(true);
      // já enviada — não pode enviar de novo
      const r = enviarProposta(db, propostaId!);
      expect(r.sucesso).toBe(false);
    });

    it("decidirProposta recusa decidir proposta ainda 'rascunho' (precisa enviar antes)", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      const { id: propostaId } = criarPropostaLead(db, { leadId: leadId!, imovelId: IMOVEL_1, valorProposto: 100000 });
      const r = decidirProposta(db, propostaId!, true, "Operador A");
      expect(r.sucesso).toBe(false);
    });

    it("decidirProposta(aceita=false) marca 'recusada' e NÃO mexe na etapa do lead", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      moverEtapaLead(db, leadId!, "contatado", "A");
      moverEtapaLead(db, leadId!, "visita_agendada", "A");
      moverEtapaLead(db, leadId!, "proposta", "A");
      const { id: propostaId } = criarPropostaLead(db, { leadId: leadId!, imovelId: IMOVEL_1, valorProposto: 100000 });
      enviarProposta(db, propostaId!);

      const r = decidirProposta(db, propostaId!, false, "Operador B");
      expect(r.sucesso).toBe(true);

      const lead = obterLeadComHistorico(db, leadId!)!;
      expect(lead.etapa).toBe("proposta");
      expect(lead.propostas[0].status).toBe("recusada");
      expect(lead.propostas[0].decidido_em).not.toBeNull();
    });

    it("decidirProposta falha se aceitar quando o lead não está em etapa 'proposta' (tudo ou nada)", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      // proposta criada cedo, lead ainda em 'novo' (permitido, ver decisão de design nº 2)
      const { id: propostaId } = criarPropostaLead(db, { leadId: leadId!, imovelId: IMOVEL_1, valorProposto: 100000 });
      enviarProposta(db, propostaId!);

      const r = decidirProposta(db, propostaId!, true, "Operador A");
      expect(r.sucesso).toBe(false);

      // nada foi gravado: proposta continua 'enviada', lead continua 'novo'
      const lead = obterLeadComHistorico(db, leadId!)!;
      expect(lead.etapa).toBe("novo");
      expect(lead.propostas[0].status).toBe("enviada");
    });

    it("proposta não pode ser decidida duas vezes", () => {
      const { id: leadId } = criarLead(db, { nome: "Fulano" });
      moverEtapaLead(db, leadId!, "contatado", "A");
      moverEtapaLead(db, leadId!, "visita_agendada", "A");
      moverEtapaLead(db, leadId!, "proposta", "A");
      const { id: propostaId } = criarPropostaLead(db, { leadId: leadId!, imovelId: IMOVEL_1, valorProposto: 100000 });
      enviarProposta(db, propostaId!);

      const primeira = decidirProposta(db, propostaId!, true, "Operador B");
      expect(primeira.sucesso).toBe(true);

      const segunda = decidirProposta(db, propostaId!, false, "Operador C");
      expect(segunda.sucesso).toBe(false);
      expect(segunda.mensagem).toMatch(/já foi decidida/i);

      // status permanece o da primeira decisão, não foi sobrescrito
      const lead = obterLeadComHistorico(db, leadId!)!;
      expect(lead.propostas[0].status).toBe("aceita");
    });
  });

  describe("listarLeads e funilResumo", () => {
    it("lista leads com filtro de etapa e de imóvel", () => {
      const a = criarLead(db, { nome: "Lead A", imovelId: IMOVEL_1 });
      const b = criarLead(db, { nome: "Lead B", imovelId: IMOVEL_2 });
      const c = criarLead(db, { nome: "Lead C", imovelId: IMOVEL_1 });
      moverEtapaLead(db, a.id!, "contatado", "X");

      expect(listarLeads(db)).toHaveLength(3);
      expect(listarLeads(db, { etapa: "contatado" }).map((l) => l.id)).toEqual([a.id]);
      expect(listarLeads(db, { etapa: "novo" }).map((l) => l.id).sort()).toEqual([b.id, c.id].sort());
      expect(listarLeads(db, { imovelId: IMOVEL_1 }).map((l) => l.id).sort()).toEqual([a.id, c.id].sort());
    });

    it("funilResumo conta leads por etapa, incluindo etapas com zero leads", () => {
      const a = criarLead(db, { nome: "Lead A" });
      criarLead(db, { nome: "Lead B" });
      moverEtapaLead(db, a.id!, "contatado", "X");

      const resumo = funilResumo(db);
      expect(resumo).toEqual({
        novo: 1,
        contatado: 1,
        visita_agendada: 0,
        proposta: 0,
        convertido: 0,
        perdido: 0,
      });
    });
  });
});
