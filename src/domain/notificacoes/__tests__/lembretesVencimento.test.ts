import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { consultar, executar } from "../../../db/connection";
import {
  identificarLembretesPendentes,
  dispararLembretesPendentes,
  identificarLembretesFuturos,
  sincronizarLembretesFuturos,
  type LembreteFuturo,
  type LembretesAgendadosApiClient,
} from "../lembretesVencimento";
import { listarPorOrigem } from "../notificacoes-db";
import type { NotificacoesApiClient, ResultadoDisparo } from "../despachoCliente";

// Data de referência FIXA para toda a suíte — nunca o relógio real (`new Date()`), pelo
// mesmo motivo que motivou a correção de `relatorioInadimplenciaDetalhado`
// (`src/domain/erp/integracao-inadimplencia.ts`) nesta mesma sessão: um teste que lê "hoje"
// do sistema operacional passa ou falha dependendo do dia em que roda — flakiness mecânica,
// não um defeito do código. "Hoje" (`HOJE`) é 2026-11-01; "2 dias depois" é 2026-11-03.
const HOJE = "2026-11-01";
const EM_2_DIAS = "2026-11-03";

let db: Database;
let contadorDocumento = 0;

beforeEach(async () => {
  db = await criarBancoDeTeste();
  contadorDocumento = 0;
});

function ultimoId(tabela: string): number {
  return consultar<{ id: number }>(db, `SELECT id FROM ${tabela} ORDER BY id DESC LIMIT 1`)[0].id;
}

/** Documento único por chamada — `entidades_legais.cpf_cnpj` é `UNIQUE`, mas o schema não
 * valida formato de CPF/CNPJ nessa coluna (validação de dígito verificador é regra de
 * `entidadeLegal.ts`, não uma CHECK constraint do banco), então uma string incremental
 * simples já basta para não colidir entre fixtures do mesmo teste. */
function proximoDocumento(): string {
  contadorDocumento += 1;
  return `doc-teste-${contadorDocumento}`;
}

function criarCompetenciaAluguel(
  overrides: Partial<{
    valorDevido: number;
    dataVencimento: string;
    status: "pendente" | "recebido" | "cancelado";
    email: string | null;
    telefone: string | null;
  }> = {},
): number {
  const p = {
    valorDevido: 1200,
    dataVencimento: HOJE,
    status: "pendente" as const,
    email: "locatario@example.com" as string | null,
    telefone: "11999990000" as string | null,
    ...overrides,
  };
  executar(db, "INSERT INTO imoveis (apelido, tipo, financiado) VALUES ('Kitnet Teste', 'kitnet', 1)");
  const imovelId = ultimoId("imoveis");
  executar(
    db,
    `INSERT INTO contratos_locacao (imovel_id, locatario, tipo, valor_referencia, dia_vencimento, data_inicio)
     VALUES (?, 'Locatário Teste', 'residencial_fixo', ?, 10, '2024-01-01')`,
    [imovelId, p.valorDevido],
  );
  const contratoId = ultimoId("contratos_locacao");
  executar(
    db,
    `INSERT INTO contrato_locatarios (contrato_id, nome, cpf, papel, telefone, email) VALUES (?, 'Locatário Teste', ?, 'locatario', ?, ?)`,
    [contratoId, proximoDocumento(), p.telefone, p.email],
  );
  executar(
    db,
    `INSERT INTO aluguel_competencias (contrato_id, imovel_id, ano, mes, data_vencimento, valor_devido, status, criado_em)
     VALUES (?, ?, 2026, 11, ?, ?, ?, '2026-10-01')`,
    [contratoId, imovelId, p.dataVencimento, p.valorDevido, p.status],
  );
  return ultimoId("aluguel_competencias");
}

function criarHonorario(
  overrides: Partial<{
    valorDevido: number;
    dataVencimento: string;
    status: "pendente" | "recebido" | "cancelado";
    email: string | null;
    telefone: string | null;
  }> = {},
): number {
  const p = {
    valorDevido: 3000,
    dataVencimento: HOJE,
    status: "pendente" as const,
    email: "cliente@example.com" as string | null,
    telefone: "11988880000" as string | null,
    ...overrides,
  };
  executar(
    db,
    `INSERT INTO entidades_legais (tipo, cpf_cnpj, nome, telefone, email) VALUES ('pessoa_fisica', ?, 'Cliente Teste', ?, ?)`,
    [proximoDocumento(), p.telefone, p.email],
  );
  const entidadeId = ultimoId("entidades_legais");
  executar(db, `INSERT INTO processos_legais (entidade_id, tipo, status) VALUES (?, 'civel', 'ativo')`, [entidadeId]);
  const processoId = ultimoId("processos_legais");
  executar(
    db,
    `INSERT INTO honorarios_advocaticios (processo_id, parcela_numero, descricao, valor_devido, data_vencimento, status, criado_em)
     VALUES (?, 1, 'Honorário de êxito', ?, ?, ?, '2026-10-01')`,
    [processoId, p.valorDevido, p.dataVencimento, p.status],
  );
  return ultimoId("honorarios_advocaticios");
}

/** Insere diretamente uma linha em `notificacoes_enviadas`, simulando um lembrete já
 * disparado numa data específica — usado para testar o dedup sem precisar passar pelo
 * fluxo completo de `dispararLembretesPendentes`. */
function registrarLembreteJaEnviado(
  origemTipo: "lembrete_aluguel" | "lembrete_honorario",
  origemId: number,
  criadoEm: string,
): void {
  executar(
    db,
    `INSERT INTO notificacoes_enviadas (origem_tipo, origem_id, canal, destinatario, mensagem, status, criado_em)
     VALUES (?, ?, 'email', 'alguem@example.com', 'lembrete já enviado (fixture)', 'enviado', ?)`,
    [origemTipo, origemId, criadoEm],
  );
}

function criarApiClientFake(
  gerarResultado: (canal: "email" | "whatsapp" | "telegram", destinatario: string) => ResultadoDisparo = (canal, destinatario) => ({
    canal,
    destinatario,
    status: "enviado",
  }),
): NotificacoesApiClient & { chamadas: Record<string, unknown>[] } {
  const chamadas: Record<string, unknown>[] = [];
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

describe("lembretesVencimento", () => {
  describe("identificarLembretesPendentes — aluguel", () => {
    it("identifica competência vencendo em exatamente 2 dias como '2_dias_antes'", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: EM_2_DIAS, valorDevido: 1500 });

      const pendentes = identificarLembretesPendentes(db, HOJE);
      expect(pendentes).toHaveLength(1);
      expect(pendentes[0]).toMatchObject({
        origemTipo: "lembrete_aluguel",
        origemId: id,
        tipoLembrete: "2_dias_antes",
        diasParaVencimento: 2,
        valorDevido: 1500,
        dataVencimento: EM_2_DIAS,
      });
    });

    it("identifica competência vencendo hoje como 'no_dia'", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: HOJE });

      const pendentes = identificarLembretesPendentes(db, HOJE);
      expect(pendentes).toHaveLength(1);
      expect(pendentes[0]).toMatchObject({ origemId: id, tipoLembrete: "no_dia", diasParaVencimento: 0 });
    });

    it.each([1, 3, 5])("NÃO identifica competência vencendo em %d dia(s)", (dias) => {
      const data = new Date(`${HOJE}T00:00:00`);
      data.setDate(data.getDate() + dias);
      criarCompetenciaAluguel({ dataVencimento: data.toISOString().slice(0, 10) });

      expect(identificarLembretesPendentes(db, HOJE)).toHaveLength(0);
    });

    it("NÃO identifica competência já 'recebido', mesmo vencendo hoje ou em 2 dias", () => {
      criarCompetenciaAluguel({ dataVencimento: HOJE, status: "recebido" });
      criarCompetenciaAluguel({ dataVencimento: EM_2_DIAS, status: "recebido" });

      expect(identificarLembretesPendentes(db, HOJE)).toHaveLength(0);
    });

    it("NÃO identifica competência já 'cancelado', mesmo vencendo hoje ou em 2 dias", () => {
      criarCompetenciaAluguel({ dataVencimento: HOJE, status: "cancelado" });
      criarCompetenciaAluguel({ dataVencimento: EM_2_DIAS, status: "cancelado" });

      expect(identificarLembretesPendentes(db, HOJE)).toHaveLength(0);
    });

    it("dedup: NÃO dispara de novo se já houve lembrete registrado HOJE para esta competência", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: HOJE });
      registrarLembreteJaEnviado("lembrete_aluguel", id, `${HOJE} 09:00:00`);

      expect(identificarLembretesPendentes(db, HOJE)).toHaveLength(0);
    });

    it("dedup: dispara de novo HOJE se o último lembrete registrado foi ONTEM", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: HOJE });
      registrarLembreteJaEnviado("lembrete_aluguel", id, "2026-10-31 09:00:00");

      const pendentes = identificarLembretesPendentes(db, HOJE);
      expect(pendentes).toHaveLength(1);
      expect(pendentes[0].origemId).toBe(id);
    });

    it("dedup: competência vencendo em 2 dias também dispara de novo se o lembrete anterior foi ONTEM", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: EM_2_DIAS });
      registrarLembreteJaEnviado("lembrete_aluguel", id, "2026-10-31 09:00:00");

      const pendentes = identificarLembretesPendentes(db, HOJE);
      expect(pendentes).toHaveLength(1);
      expect(pendentes[0]).toMatchObject({ origemId: id, tipoLembrete: "2_dias_antes" });
    });

    it("descricaoContexto traz o locatário e o número do contrato", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: HOJE });
      const [{ contrato_id }] = consultar<{ contrato_id: number }>(db, "SELECT contrato_id FROM aluguel_competencias WHERE id = ?", [id]);

      const [pendente] = identificarLembretesPendentes(db, HOJE);
      expect(pendente.descricaoContexto).toContain("Locatário Teste");
      expect(pendente.descricaoContexto).toContain(`#${contrato_id}`);
    });
  });

  describe("identificarLembretesPendentes — honorário", () => {
    it("identifica honorário vencendo em exatamente 2 dias como '2_dias_antes'", () => {
      const id = criarHonorario({ dataVencimento: EM_2_DIAS, valorDevido: 2000 });

      const pendentes = identificarLembretesPendentes(db, HOJE);
      expect(pendentes).toHaveLength(1);
      expect(pendentes[0]).toMatchObject({
        origemTipo: "lembrete_honorario",
        origemId: id,
        tipoLembrete: "2_dias_antes",
        diasParaVencimento: 2,
        valorDevido: 2000,
      });
    });

    it("identifica honorário vencendo hoje como 'no_dia'", () => {
      const id = criarHonorario({ dataVencimento: HOJE });

      const pendentes = identificarLembretesPendentes(db, HOJE);
      expect(pendentes).toHaveLength(1);
      expect(pendentes[0]).toMatchObject({ origemId: id, tipoLembrete: "no_dia", diasParaVencimento: 0 });
    });

    it.each([1, 3, 5])("NÃO identifica honorário vencendo em %d dia(s)", (dias) => {
      const data = new Date(`${HOJE}T00:00:00`);
      data.setDate(data.getDate() + dias);
      criarHonorario({ dataVencimento: data.toISOString().slice(0, 10) });

      expect(identificarLembretesPendentes(db, HOJE)).toHaveLength(0);
    });

    it("NÃO identifica honorário já 'recebido' ou 'cancelado'", () => {
      criarHonorario({ dataVencimento: HOJE, status: "recebido" });
      criarHonorario({ dataVencimento: EM_2_DIAS, status: "cancelado" });

      expect(identificarLembretesPendentes(db, HOJE)).toHaveLength(0);
    });

    it("dedup: NÃO dispara de novo se já houve lembrete HOJE; dispara se foi ONTEM", () => {
      const idHoje = criarHonorario({ dataVencimento: HOJE });
      registrarLembreteJaEnviado("lembrete_honorario", idHoje, `${HOJE} 08:00:00`);
      expect(identificarLembretesPendentes(db, HOJE)).toHaveLength(0);

      const idOntem = criarHonorario({ dataVencimento: HOJE });
      registrarLembreteJaEnviado("lembrete_honorario", idOntem, "2026-10-31 08:00:00");
      const pendentes = identificarLembretesPendentes(db, HOJE);
      expect(pendentes).toHaveLength(1);
      expect(pendentes[0].origemId).toBe(idOntem);
    });
  });

  describe("identificarLembretesPendentes — aluguel e honorário misturados", () => {
    it("retorna os dois tipos juntos quando ambos estão na janela", () => {
      const idAluguel = criarCompetenciaAluguel({ dataVencimento: HOJE });
      const idHonorario = criarHonorario({ dataVencimento: EM_2_DIAS });

      const pendentes = identificarLembretesPendentes(db, HOJE);
      expect(pendentes).toHaveLength(2);
      expect(pendentes.find((p) => p.origemTipo === "lembrete_aluguel")?.origemId).toBe(idAluguel);
      expect(pendentes.find((p) => p.origemTipo === "lembrete_honorario")?.origemId).toBe(idHonorario);
    });

    it("sem dataReferencia, usa o relógio real (não quebra, só não é usado nos outros testes)", () => {
      // Não cria nenhum vencimento para hoje/2 dias reais — só garante que a função não
      // lança quando dataReferencia é omitida (default = hoje real).
      expect(() => identificarLembretesPendentes(db)).not.toThrow();
    });
  });

  describe("dispararLembretesPendentes", () => {
    it("monta mensagem 'vence em 2 dias' e dispara para o destinatário resolvido (aluguel)", async () => {
      const id = criarCompetenciaAluguel({ dataVencimento: EM_2_DIAS, valorDevido: 1200, email: "inquilino@example.com", telefone: null });
      const apiClient = criarApiClientFake();

      const resultados = await dispararLembretesPendentes(db, apiClient, HOJE);
      expect(resultados).toHaveLength(1);
      expect(resultados[0].lembrete.origemId).toBe(id);
      expect(apiClient.chamadas).toHaveLength(1);
      expect(apiClient.chamadas[0].origemTipo).toBe("lembrete_aluguel");
      expect(apiClient.chamadas[0].origemId).toBe(id);
      expect(apiClient.chamadas[0].mensagem).toMatch(/vence em 2 dias/i);
      expect((apiClient.chamadas[0] as any).destinatarios.email).toBe("inquilino@example.com");

      const emailResultado = resultados[0].resultadosDisparo.find((r) => r.canal === "email");
      expect(emailResultado).toMatchObject({ status: "enviado", destinatario: "inquilino@example.com" });

      // registrado em notificacoes_enviadas sob origem_tipo='lembrete_aluguel'
      const historico = listarPorOrigem(db, "lembrete_aluguel", id);
      expect(historico.length).toBeGreaterThan(0);
    });

    it("monta mensagem 'vence HOJE' quando o tipo é 'no_dia' (honorário)", async () => {
      const id = criarHonorario({ dataVencimento: HOJE, valorDevido: 3300, email: "cliente@example.com", telefone: null });
      const apiClient = criarApiClientFake();

      const resultados = await dispararLembretesPendentes(db, apiClient, HOJE);
      expect(resultados).toHaveLength(1);
      expect(apiClient.chamadas[0].origemTipo).toBe("lembrete_honorario");
      expect(apiClient.chamadas[0].origemId).toBe(id);
      expect(apiClient.chamadas[0].mensagem).toMatch(/vence HOJE/);
    });

    it("sem nenhum lembrete pendente, não chama o apiClient e devolve lista vazia", async () => {
      const apiClient = criarApiClientFake();
      const resultados = await dispararLembretesPendentes(db, apiClient, HOJE);
      expect(resultados).toHaveLength(0);
      expect(apiClient.chamadas).toHaveLength(0);
    });

    it("depois de disparar, uma segunda chamada no mesmo dia não dispara de novo (dedup efetivo fim a fim)", async () => {
      // Este teste não pode usar a `HOJE` fixa da suíte: `notificacoes_enviadas.criado_em`
      // é `DEFAULT CURRENT_TIMESTAMP` do próprio SQLite (coluna de `notificacoes-db.ts`,
      // fora do escopo desta tarefa — não aceita um valor simulado via parâmetro), então o
      // dedup fim a fim só bate se a competência vencer no dia REAL em que o teste roda e
      // `dispararLembretesPendentes` for chamado SEM `dataReferencia` (default = hoje real)
      // nas duas chamadas. Isso não reintroduz a flakiness que motivou corrigir
      // `integracao-inadimplencia.ts`: as duas chamadas acontecem em sequência, no mesmo
      // dia civil — o resultado nunca depende de QUAL dia é, só de que o dia não muda
      // entre as duas chamadas (sempre verdade num teste síncrono de milissegundos).
      const hojeReal = new Date().toISOString().slice(0, 10);
      criarCompetenciaAluguel({ dataVencimento: hojeReal });
      const apiClient = criarApiClientFake();

      const primeira = await dispararLembretesPendentes(db, apiClient);
      expect(primeira).toHaveLength(1);

      const segunda = await dispararLembretesPendentes(db, apiClient);
      expect(segunda).toHaveLength(0);
      expect(apiClient.chamadas).toHaveLength(1); // só a primeira chamada chegou a chamar o apiClient
    });

    it("sem e-mail/telefone cadastrado, o canal correspondente aparece como 'pulado' (nunca falha silenciosa)", async () => {
      const id = criarCompetenciaAluguel({ dataVencimento: HOJE, email: null, telefone: null });
      const apiClient = criarApiClientFake();

      const resultados = await dispararLembretesPendentes(db, apiClient, HOJE);
      expect(resultados).toHaveLength(1);
      expect(resultados[0].lembrete.origemId).toBe(id);
      expect(resultados[0].resultadosDisparo.every((r) => r.status === "pulado")).toBe(true);
      // Nenhum canal com destinatário -> dispararNotificacao nem chega a chamar o apiClient.
      expect(apiClient.chamadas).toHaveLength(0);
    });
  });

  describe("identificarLembretesFuturos", () => {
    it("competência vencendo em 10 dias gera os 2 gatilhos corretos (datas e canal)", () => {
      const EM_10_DIAS = "2026-11-11";
      const id = criarCompetenciaAluguel({
        dataVencimento: EM_10_DIAS,
        valorDevido: 1500,
        email: "inquilino@example.com",
        telefone: null,
      });

      const itens = identificarLembretesFuturos(db, { diasHorizonte: 45, dataReferencia: HOJE });
      const desteContrato = itens.filter((i) => i.origemId === id);
      expect(desteContrato).toHaveLength(2); // só e-mail cadastrado -> 1 canal x 2 tipos

      const noDia = desteContrato.find((i) => i.tipoLembrete === "no_dia");
      expect(noDia).toMatchObject({
        origemTipo: "lembrete_aluguel",
        origemId: id,
        canal: "email",
        destinatario: "inquilino@example.com",
        dataDisparoPrevista: EM_10_DIAS,
      });
      expect(noDia?.mensagem).toMatch(/vence HOJE/);

      const doisDiasAntes = desteContrato.find((i) => i.tipoLembrete === "2_dias_antes");
      expect(doisDiasAntes).toMatchObject({
        origemId: id,
        canal: "email",
        dataDisparoPrevista: "2026-11-09", // EM_10_DIAS - 2
      });
      expect(doisDiasAntes?.mensagem).toMatch(/vence em 2 dias/i);
    });

    it("gera uma linha por canal com destinatário — e-mail e WhatsApp juntos vira 2 linhas por tipo de lembrete", () => {
      const id = criarCompetenciaAluguel({
        dataVencimento: "2026-11-05",
        email: "inquilino@example.com",
        telefone: "11999990000",
      });

      const itens = identificarLembretesFuturos(db, { diasHorizonte: 45, dataReferencia: HOJE }).filter((i) => i.origemId === id);
      expect(itens).toHaveLength(4); // 2 canais x 2 tipos de lembrete
      expect(itens.filter((i) => i.canal === "email")).toHaveLength(2);
      expect(itens.filter((i) => i.canal === "whatsapp")).toHaveLength(2);
      expect(itens.every((i) => i.canal !== "telegram")).toBe(true); // sem vínculo telegram cadastrado
    });

    it("competência FORA do horizonte não aparece", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: "2026-12-20" }); // > HOJE + 45 dias

      const itens = identificarLembretesFuturos(db, { diasHorizonte: 45, dataReferencia: HOJE });
      expect(itens.some((i) => i.origemId === id)).toBe(false);
    });

    it("competência já paga ('recebido') não aparece, mesmo dentro do horizonte", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: "2026-11-05", status: "recebido" });

      const itens = identificarLembretesFuturos(db, { diasHorizonte: 45, dataReferencia: HOJE });
      expect(itens.some((i) => i.origemId === id)).toBe(false);
    });

    it("competência 'cancelada' não aparece", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: "2026-11-05", status: "cancelado" });

      const itens = identificarLembretesFuturos(db, { diasHorizonte: 45, dataReferencia: HOJE });
      expect(itens.some((i) => i.origemId === id)).toBe(false);
    });

    it("competência SEM nenhum contato cadastrado não gera nenhuma linha (nunca uma linha 'morta' sem destinatário)", () => {
      const id = criarCompetenciaAluguel({ dataVencimento: "2026-11-05", email: null, telefone: null });

      const itens = identificarLembretesFuturos(db, { diasHorizonte: 45, dataReferencia: HOJE });
      expect(itens.some((i) => i.origemId === id)).toBe(false);
    });

    it("honorário dentro do horizonte também é identificado, junto com competências de aluguel", () => {
      const idAluguel = criarCompetenciaAluguel({ dataVencimento: "2026-11-05" });
      const idHonorario = criarHonorario({ dataVencimento: "2026-11-15", email: "cliente@example.com", telefone: null });

      const itens = identificarLembretesFuturos(db, { diasHorizonte: 45, dataReferencia: HOJE });
      expect(itens.some((i) => i.origemTipo === "lembrete_aluguel" && i.origemId === idAluguel)).toBe(true);
      expect(itens.some((i) => i.origemTipo === "lembrete_honorario" && i.origemId === idHonorario)).toBe(true);
    });

    it("competência vencendo exatamente no último dia do horizonte ainda é incluída", () => {
      const ULTIMO_DIA = "2026-12-16"; // HOJE (2026-11-01) + 45 dias
      const id = criarCompetenciaAluguel({ dataVencimento: ULTIMO_DIA, telefone: null });

      const itens = identificarLembretesFuturos(db, { diasHorizonte: 45, dataReferencia: HOJE }).filter((i) => i.origemId === id);
      expect(itens).toHaveLength(2);
      expect(itens.find((i) => i.tipoLembrete === "no_dia")?.dataDisparoPrevista).toBe(ULTIMO_DIA);
    });
  });

  describe("sincronizarLembretesFuturos", () => {
    function criarLembretesAgendadosApiClientFake(): LembretesAgendadosApiClient & { chamadas: Array<{ origemTipo: string; lembretes: LembreteFuturo[] }> } {
      const chamadas: Array<{ origemTipo: string; lembretes: LembreteFuturo[] }> = [];
      return {
        chamadas,
        async sincronizar(dados) {
          chamadas.push(dados);
        },
      };
    }

    it("sincroniza aluguel e honorário em chamadas separadas, cada uma com só o seu tipo", async () => {
      criarCompetenciaAluguel({ dataVencimento: "2026-11-05", email: "a@b.com", telefone: null });
      criarHonorario({ dataVencimento: "2026-11-10", email: "c@d.com", telefone: null });
      const apiClient = criarLembretesAgendadosApiClientFake();

      const resultado = await sincronizarLembretesFuturos(db, apiClient, { diasHorizonte: 45, dataReferencia: HOJE });

      expect(resultado).toEqual({ aluguel: 2, honorario: 2 }); // 2 tipos de lembrete x 1 canal, cada origem
      expect(apiClient.chamadas).toHaveLength(2);

      const chamadaAluguel = apiClient.chamadas.find((c) => c.origemTipo === "lembrete_aluguel")!;
      expect(chamadaAluguel.lembretes).toHaveLength(2);
      expect(chamadaAluguel.lembretes.every((l) => l.origemTipo === "lembrete_aluguel")).toBe(true);

      const chamadaHonorario = apiClient.chamadas.find((c) => c.origemTipo === "lembrete_honorario")!;
      expect(chamadaHonorario.lembretes).toHaveLength(2);
      expect(chamadaHonorario.lembretes.every((l) => l.origemTipo === "lembrete_honorario")).toBe(true);
    });

    it("sem nada pendente no horizonte, ainda chama o apiClient com arrays vazios (foto completa, mesmo vazia)", async () => {
      const apiClient = criarLembretesAgendadosApiClientFake();

      const resultado = await sincronizarLembretesFuturos(db, apiClient, { diasHorizonte: 45, dataReferencia: HOJE });

      expect(resultado).toEqual({ aluguel: 0, honorario: 0 });
      expect(apiClient.chamadas).toHaveLength(2);
      expect(apiClient.chamadas.every((c) => c.lembretes.length === 0)).toBe(true);
    });
  });
});
