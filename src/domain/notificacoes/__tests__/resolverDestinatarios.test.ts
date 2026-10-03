import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import { resolverDestinatariosCobranca, resolverDestinatariosPorCobrancaId } from "../resolverDestinatarios";

let db: Database;

beforeEach(async () => {
  db = await criarBancoDeTeste();
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

function criarImovel(apelido = "Kitnet 1"): number {
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado) VALUES (?, 'kitnet', 1)", [apelido]);
  return ultimoId("imoveis");
}

function criarContrato(): number {
  const imovelId = criarImovel();
  executar(
    db,
    `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', 1200, 10, '2026-01-01')`,
    [imovelId],
  );
  return ultimoId("contratos_locacao");
}

function criarContratoLocatario(contratoId: number, overrides: Partial<{ email: string | null; telefone: string | null }> = {}): void {
  const p = { email: "locatario@example.com" as string | null, telefone: "11999990000" as string | null, ...overrides };
  executar(
    db,
    `INSERT INTO contrato_locatarios (contrato_id, nome, cpf, papel, telefone, email)
     VALUES (?, 'Locatário Teste', '52998224725', 'locatario', ?, ?)`,
    [contratoId, p.telefone, p.email],
  );
}

function criarCompetencia(contratoId: number): number {
  const imovel = consultar<{ imovel_id: number }>(db, "SELECT imovel_id FROM contratos_locacao WHERE id = ?", [contratoId])[0];
  executar(
    db,
    `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, status, criado_em)
     VALUES (?, ?, 2026, 11, '2026-11-10', 1200, 'pendente', '2026-10-01')`,
    [contratoId, imovel.imovel_id],
  );
  return ultimoId("aluguel_competencias");
}

function criarEntidadeLegal(overrides: Partial<{ email: string | null; telefone: string | null }> = {}): number {
  const p = { email: "cliente@example.com" as string | null, telefone: "+5511988887777" as string | null, ...overrides };
  executar(
    db,
    `INSERT INTO entidades_legais (tipo, cpf_cnpj, nome, telefone, email) VALUES ('pessoa_juridica', '11444777000161', 'Cliente LTDA', ?, ?)`,
    [p.telefone, p.email],
  );
  return ultimoId("entidades_legais");
}

function criarProcesso(entidadeId: number): number {
  executar(db, `INSERT INTO processos_legais (entidade_id, tipo, status, criado_em) VALUES (?, 'civel', 'ativo', '2026-10-01')`, [entidadeId]);
  return ultimoId("processos_legais");
}

function criarHonorario(processoId: number): number {
  executar(
    db,
    `INSERT INTO honorarios_advocaticios (processo_id, parcela_numero, valor_devido, data_vencimento, status, criado_em)
     VALUES (?, 1, 2500, '2026-11-15', 'pendente', '2026-10-01')`,
    [processoId],
  );
  return ultimoId("honorarios_advocaticios");
}

function criarCobrancaAsaas(origemTipo: "aluguel_competencia" | "honorario_advocaticio", origemId: number): number {
  executar(
    db,
    `INSERT INTO cobrancas_asaas (origem_tipo, origem_id, asaas_customer_id, tipo_cobranca, valor, data_vencimento, status)
     VALUES (?, ?, 'cus_fake_1', 'boleto', 1200, '2026-11-10', 'pendente')`,
    [origemTipo, origemId],
  );
  return ultimoId("cobrancas_asaas");
}

describe("resolverDestinatarios", () => {
  describe("resolverDestinatariosCobranca — aluguel_competencia", () => {
    it("resolve e-mail e WhatsApp (E.164) do locatário com papel='locatario'", () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId, { email: "locatario@example.com", telefone: "11999990000" });
      const competenciaId = criarCompetencia(contratoId);

      const destinatarios = resolverDestinatariosCobranca(db, "aluguel_competencia", competenciaId);

      expect(destinatarios.email).toBe("locatario@example.com");
      expect(destinatarios.whatsappE164).toBe("+5511999990000");
      // Limitação de produto documentada: locatário não tem como vincular um chat_id próprio.
      expect(destinatarios.telegramChatId).toBeUndefined();
    });

    it("telefone já em E.164 (com '+') não é duplicado com +55 na frente", () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId, { telefone: "+351912345678" }); // número não-BR, de propósito
      const competenciaId = criarCompetencia(contratoId);

      const destinatarios = resolverDestinatariosCobranca(db, "aluguel_competencia", competenciaId);
      expect(destinatarios.whatsappE164).toBe("+351912345678");
    });

    it("locatário sem e-mail/telefone cadastrado: campos vêm undefined, sem lançar erro", () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId, { email: null, telefone: null });
      const competenciaId = criarCompetencia(contratoId);

      const destinatarios = resolverDestinatariosCobranca(db, "aluguel_competencia", competenciaId);
      expect(destinatarios.email).toBeUndefined();
      expect(destinatarios.whatsappE164).toBeUndefined();
    });

    it("competência inexistente: devolve tudo undefined, não lança", () => {
      const destinatarios = resolverDestinatariosCobranca(db, "aluguel_competencia", 99999);
      expect(destinatarios).toEqual({});
    });
  });

  describe("resolverDestinatariosCobranca — honorario_advocaticio", () => {
    it("resolve e-mail e telefone a partir de processos_legais -> entidades_legais", () => {
      const entidadeId = criarEntidadeLegal({ email: "cliente@example.com", telefone: "+5511988887777" });
      const processoId = criarProcesso(entidadeId);
      const honorarioId = criarHonorario(processoId);

      const destinatarios = resolverDestinatariosCobranca(db, "honorario_advocaticio", honorarioId);
      expect(destinatarios.email).toBe("cliente@example.com");
      expect(destinatarios.whatsappE164).toBe("+5511988887777");
      expect(destinatarios.telegramChatId).toBeUndefined();
    });

    it("entidade legal sem contato cadastrado: campos undefined, sem lançar erro", () => {
      const entidadeId = criarEntidadeLegal({ email: null, telefone: null });
      const processoId = criarProcesso(entidadeId);
      const honorarioId = criarHonorario(processoId);

      const destinatarios = resolverDestinatariosCobranca(db, "honorario_advocaticio", honorarioId);
      expect(destinatarios.email).toBeUndefined();
      expect(destinatarios.whatsappE164).toBeUndefined();
    });
  });

  describe("resolverDestinatariosPorCobrancaId", () => {
    it("resolve a partir do id local de cobrancas_asaas, delegando pelo origem_tipo/origem_id", () => {
      const contratoId = criarContrato();
      criarContratoLocatario(contratoId, { email: "locatario2@example.com", telefone: "11988887777" });
      const competenciaId = criarCompetencia(contratoId);
      const cobrancaId = criarCobrancaAsaas("aluguel_competencia", competenciaId);

      const destinatarios = resolverDestinatariosPorCobrancaId(db, cobrancaId);
      expect(destinatarios.email).toBe("locatario2@example.com");
      expect(destinatarios.whatsappE164).toBe("+5511988887777");
    });

    it("cobrança local inexistente: devolve tudo undefined, não lança", () => {
      expect(resolverDestinatariosPorCobrancaId(db, 99999)).toEqual({});
    });
  });
});
