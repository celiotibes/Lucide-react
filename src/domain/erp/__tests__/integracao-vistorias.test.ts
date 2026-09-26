import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
import { obterSaldoConta } from "../ledger";
import {
  calcularValorDanosVistoria,
  provisarDanosVistoria,
  finalizarVistoriaContabil,
  relatorioVistoriasComProvisionamento,
} from "../integracao-vistorias";
import {
  sincronizarVistoriaConcluidaParaProvisionamento,
  revertorProvisionamentoDanosVistoria,
  processarVistoriasPendentes,
  validarConsistenciaVistoriaProvisionamento,
  obterStatusProvisionamento,
  gerarRelatorioProvisionoesPendentes,
  StatusProvisionamento,
} from "../integracao-vistorias-provisionamento";

/**
 * Testes de src/domain/erp/integracao-vistorias.ts e
 * integracao-vistorias-provisionamento.ts — módulos órfãos (nenhuma tela os chama) que
 * usam o razão (ledger.ts) e as tabelas reais `caucoes`/`vistoria_item`/`vistorias`/
 * `ledger_entries` de schema.sql, mas nunca tiveram teste nenhum.
 *
 * Usa criarBancoDeTeste() (schema real de contabilidade-reconstituicao/schema.sql, com
 * PRAGMA foreign_keys = ON), não test-setup.ts — que é um fixture paralelo, com sua
 * própria cópia do schema, deliberadamente fora do escopo desta tarefa.
 *
 * ACHADOS (gravidade CRÍTICA) corrigidos nesta tarefa:
 *
 * 1. `conta_id: 27` ("Provisão para Devedora") e `conta_id: 4` ("Caução a Devolver") em
 *    provisarDanosVistoria/revertorProvisionamentoDanosVistoria nunca correspondiam a
 *    conta nenhuma: o plano autoritativo (PLANO_DE_CONTAS_ERP, planoDeContasErp.ts) só
 *    semeia os ids que ele lista (1101, 3301, 5502…) — nunca 4 nem 27. Como schema.sql
 *    liga `PRAGMA foreign_keys = ON` e `ledger_entries.conta_id REFERENCES
 *    contas_plano_contas(id)`, TODA vistoria com dano real estourava violação de chave
 *    estrangeira ao tentar provisionar. Em integracao-vistorias.ts o erro subia cru
 *    (nenhum try/catch); em integracao-vistorias-provisionamento.ts ele era capturado e
 *    relatado como "erro ao provisionar", indistinguível de uma falha de negócio real.
 *    Corrigido para as contas que já existem e que mapeamentoPlanoApp.ts usa para o
 *    mesmo significado: 5502 "Inadimplência e perdas com locatário" (a provisão do
 *    dano) e 3301 "Depósitos caução recebidos" (o desconto na caução).
 *
 * 2. `processarVistoriasPendentes` e `gerarRelatorioProvisionoesPendentes` liam
 *    `v.data_vistoria`, coluna que não existe em `vistorias` (schema.sql só tem
 *    `data_agendada`/`data_realizada`) — "no such column" a cada chamada. Corrigido para
 *    `v.data_realizada` (quando a vistoria de fato aconteceu, o dado que "há quantos
 *    dias" precisa).
 *
 * 3. `sincronizarVistoriaConcluidaParaProvisionamento`/`revertorProvisionamentoDanosVistoria`
 *    gravam em `provisionamento_vistoria_log` (tabela nova, adicionada nesta tarefa a
 *    schema.sql/schema.postgres.sql) e atualizam `vistorias.status_provisionamento` /
 *    `data_provisionamento` (colunas novas, mesmo motivo) — sem elas, o UPDATE também
 *    estourava "no such column", mascarado pelo mesmo try/catch do achado 1.
 *
 * Como reproduzir antes da correção: reverter os três achados acima e rodar
 * `npx vitest run src/domain/erp/__tests__/integracao-vistorias.test.ts`.
 */
describe("integracao-vistorias + integracao-vistorias-provisionamento", () => {
  let db: Database;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    db = await criarBancoDeTeste();

    const onboarding = criarEntidadeLegal(db, {
      nome: "Titular de Teste — Vistorias",
      cpf_cnpj: "529.982.247-25",
    });
    if (!onboarding.sucesso || !onboarding.entidade_id) {
      throw new Error(`Fixture não conseguiu criar a entidade: ${onboarding.mensagem}`);
    }
    entidade_id = onboarding.entidade_id;

    executar(
      db,
      "INSERT INTO periodos_contabeis (entidade_id, ano, mes, status) VALUES (?, 2025, 6, 'aberto')",
      [entidade_id],
    );
    periodo_id = consultar<{ id: number }>(
      db,
      "SELECT id FROM periodos_contabeis WHERE entidade_id = ? AND ano = 2025 AND mes = 6",
      [entidade_id],
    )[0].id;

    executar(
      db,
      `INSERT INTO imoveis (id, apelido, tipo, financiado, uso_pessoal) VALUES (1, 'Kitnet Teste', 'kitnet', 0, 0)`,
    );
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio)
       VALUES (1, 1, 'Inquilino de Teste', 'residencial_fixo', 1500, '2025-01-01')`,
    );
  });

  describe("provisarDanosVistoria (integracao-vistorias.ts)", () => {
    it("vistoria com dano provisiona corretamente contra o razão", () => {
      executar(
        db,
        `INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao)
         VALUES (1, 1, 1500, '2025-01-01', 'nenhum')`,
      );
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada)
         VALUES (1, 1, 1, 'concluida', '2025-06-10')`,
      );
      executar(
        db,
        `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, severidade, valor_estimado)
         VALUES (1, 'dano', 'Piso danificado', 'media', 800)`,
      );

      expect(calcularValorDanosVistoria(db, 1)).toBe(800);

      const provisionou = provisarDanosVistoria(db, 1, entidade_id, periodo_id);
      expect(provisionou).toBe(true);

      // Débito de R$ 800 em "Inadimplência e perdas com locatário" (5502)
      const [debito] = consultar<{ valor_debito: number }>(
        db,
        "SELECT valor_debito FROM ledger_entries WHERE conta_id = 5502 AND origem_modulo = 'vistorias' AND origem_id = 1",
      );
      expect(debito?.valor_debito).toBe(800);

      // Crédito de min(800, 1500) = 800 em "Depósitos caução recebidos" (3301)
      const [credito] = consultar<{ valor_credito: number }>(
        db,
        "SELECT valor_credito FROM ledger_entries WHERE conta_id = 3301 AND origem_modulo = 'vistorias' AND origem_id = 1",
      );
      expect(credito?.valor_credito).toBe(800);

      // O razão de fato reflete os R$ 800 provisionados — não um lançamento órfão numa
      // conta inexistente (o defeito original: conta_id 27 nunca aparecia em nenhum saldo).
      expect(obterSaldoConta(db, periodo_id, 5502)).toBe(800);
    });

    it("vistoria sem dano não gera lançamento nenhum", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada)
         VALUES (2, 1, 1, 'concluida', '2025-06-12')`,
      );
      executar(
        db,
        `INSERT INTO vistoria_item (vistoria_id, tipo, descricao)
         VALUES (2, 'achado_positivo', 'Tudo em ordem')`,
      );

      expect(calcularValorDanosVistoria(db, 2)).toBe(0);

      const provisionou = provisarDanosVistoria(db, 2, entidade_id, periodo_id);
      expect(provisionou).toBe(false);

      const lancamentos = consultar(
        db,
        "SELECT id FROM ledger_entries WHERE origem_modulo = 'vistorias' AND origem_id = 2",
      );
      expect(lancamentos.length).toBe(0);
    });

    it("não provisiona vistoria que ainda não foi concluída", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status) VALUES (3, 1, 1, 'agendada')`,
      );

      expect(provisarDanosVistoria(db, 3, entidade_id, periodo_id)).toBe(false);
    });

    it("finalizarVistoriaContabil só provisiona vistoria aprovada e devolve o valor provisionado", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada)
         VALUES (4, 1, 1, 'aprovada', '2025-06-14')`,
      );
      executar(
        db,
        `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado)
         VALUES (4, 'necessidade_reparo', 'Fechadura emperrada', 250)`,
      );

      const resultado = finalizarVistoriaContabil(db, 4, entidade_id, periodo_id);
      expect(resultado.sucesso).toBe(true);
      expect(resultado.valor_provisionado).toBe(250);

      const relatorio = relatorioVistoriasComProvisionamento(db);
      const linha = relatorio.find((r) => r.vistoria_id === 4);
      expect(linha?.valor_danos_estimado).toBe(250);
      expect(linha?.valor_provisionado).toBe(250);
    });
  });

  describe("sincronizarVistoriaConcluidaParaProvisionamento (integracao-vistorias-provisionamento.ts)", () => {
    it("registra 'provisionado' no log e atualiza o status_provisionamento da vistoria", () => {
      executar(
        db,
        `INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao)
         VALUES (1, 1, 1500, '2025-01-01', 'nenhum')`,
      );
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada)
         VALUES (10, 1, 1, 'concluida', '2025-06-15')`,
      );
      executar(
        db,
        `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado)
         VALUES (10, 'dano', 'Vidro quebrado', 300)`,
      );

      const ok = sincronizarVistoriaConcluidaParaProvisionamento(db, 10, entidade_id, periodo_id);
      expect(ok).toBe(true);

      const [log] = consultar<{
        status: string;
        valor_danos_estimado: number;
        valor_provision_registrada: number;
        valor_desconto_caucao: number;
      }>(
        db,
        "SELECT * FROM provisionamento_vistoria_log WHERE vistoria_id = 10 ORDER BY criado_em DESC LIMIT 1",
      );
      expect(log.status).toBe("provisionado");
      expect(log.valor_danos_estimado).toBe(300);
      expect(log.valor_provision_registrada).toBe(300);
      expect(log.valor_desconto_caucao).toBe(300);

      const [vistoria] = consultar<{ status_provisionamento: string }>(
        db,
        "SELECT status_provisionamento FROM vistorias WHERE id = 10",
      );
      expect(vistoria.status_provisionamento).toBe("provisionado");

      const consistencia = validarConsistenciaVistoriaProvisionamento(db, 10);
      expect(consistencia.consistente).toBe(true);
      expect(consistencia.discrepancias).toEqual([]);
    });

    it("marca 'nao_requer' quando a vistoria concluída não tem dano, sem tentar lançar no razão", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada)
         VALUES (11, 1, 1, 'concluida', '2025-06-16')`,
      );

      const ok = sincronizarVistoriaConcluidaParaProvisionamento(db, 11, entidade_id, periodo_id);
      expect(ok).toBe(true);

      const status = obterStatusProvisionamento(db, 11);
      expect(status.status).toBe(StatusProvisionamento.NAO_REQUER);

      const lancamentos = consultar(
        db,
        "SELECT id FROM ledger_entries WHERE origem_modulo = 'vistorias' AND origem_id = 11",
      );
      expect(lancamentos.length).toBe(0);
    });

    it("reverte a provisão quando os danos são reparados", () => {
      executar(
        db,
        `INSERT INTO caucoes (id, contrato_id, valor_inicial, data_deposito, indice_correcao)
         VALUES (1, 1, 1500, '2025-01-01', 'nenhum')`,
      );
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada)
         VALUES (12, 1, 1, 'concluida', '2025-06-17')`,
      );
      executar(
        db,
        `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado)
         VALUES (12, 'dano', 'Torneira vazando', 200)`,
      );

      sincronizarVistoriaConcluidaParaProvisionamento(db, 12, entidade_id, periodo_id);
      expect(obterSaldoConta(db, periodo_id, 5502)).toBe(200);

      const revertido = revertorProvisionamentoDanosVistoria(db, 12, entidade_id, periodo_id, "2025-06-20");
      expect(revertido).toBe(true);
      expect(obterSaldoConta(db, periodo_id, 5502)).toBe(0);

      const [vistoria] = consultar<{ status_provisionamento: string }>(
        db,
        "SELECT status_provisionamento FROM vistorias WHERE id = 12",
      );
      expect(vistoria.status_provisionamento).toBe("revertido");
    });

    it("processarVistoriasPendentes processa todas as vistorias concluídas ainda sem log de provisão", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada)
         VALUES (20, 1, 1, 'concluida', '2025-06-01')`,
      );
      executar(
        db,
        `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado)
         VALUES (20, 'dano', 'Porta emperrada', 100)`,
      );
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada)
         VALUES (21, 1, 1, 'concluida', '2025-06-02')`,
      );

      const resultado = processarVistoriasPendentes(db, entidade_id, periodo_id);
      expect(resultado.processadas).toBe(2);
      expect(resultado.provisionadas).toBe(1);
      expect(resultado.sem_danos).toBe(1);
      expect(resultado.erros).toBe(0);
    });

    it("gerarRelatorioProvisionoesPendentes conta vistorias concluídas e pendentes sem estourar erro", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada)
         VALUES (30, 1, 1, 'concluida', '2025-06-01')`,
      );
      executar(
        db,
        `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado)
         VALUES (30, 'dano', 'Janela quebrada', 400)`,
      );

      const relatorio = gerarRelatorioProvisionoesPendentes(db, entidade_id);
      expect(relatorio.total_vistorias).toBe(1);
      expect(relatorio.pendentes).toBe(1);
      expect(relatorio.provisionadas).toBe(0);
      expect(relatorio.valor_total_pendente).toBe(400);
    });
  });
});
