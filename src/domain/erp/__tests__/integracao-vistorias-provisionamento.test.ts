import { describe, expect, it, beforeEach } from "vitest";
import type { Database } from "sql.js";
import { criarBancoDeTeste } from "../../../test/fixtureDb";
import { executar, consultar } from "../../../db/connection";
import { criarEntidadeLegal } from "../entidadeLegal";
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
 * Testes complementares de integracao-vistorias-provisionamento.ts.
 *
 * O caminho feliz principal de cada função exportada (sincronizarVistoriaConcluidaParaProvisionamento
 * com dano, revertorProvisionamentoDanosVistoria, processarVistoriasPendentes,
 * gerarRelatorioProvisionoesPendentes básico, obterStatusProvisionamento com status
 * 'nao_requer', validarConsistenciaVistoriaProvisionamento no caso consistente) já está
 * cobertos em integracao-vistorias.test.ts (que testa os dois módulos irmãos juntos, contra
 * o mesmo schema real). Este arquivo cobre as bordas que faltavam: vistoria inexistente,
 * vistoria ainda não concluída, ausência de provisão a reverter, banco vazio, discrepâncias
 * de validarConsistenciaVistoriaProvisionamento, o default de obterStatusProvisionamento
 * sem nenhum log, o caminho de erro real (capturado pelo catch) de
 * sincronizarVistoriaConcluidaParaProvisionamento/processarVistoriasPendentes, e a lista
 * `vistorias_criticas` de gerarRelatorioProvisionoesPendentes com mais de uma vistoria em
 * atraso — a mesma lista que um bug de destructuring anterior (`const [x] = consultar(...)`)
 * reduzia à primeira linha só; aqui ela é exercida com 2 vistorias críticas para garantir que
 * continua vindo como array completo.
 *
 * ACHADO (gravidade real) corrigido nesta tarefa:
 *
 * `sincronizarVistoriaConcluidaParaProvisionamento` chamada com um `vistoriaId` que não
 * existe em `vistorias` quebrava em vez de devolver `false`: o ramo de "vistoria não
 * encontrada ou não concluída" tentava gravar um log de erro em
 * `provisionamento_vistoria_log` usando esse mesmo `vistoriaId` inexistente — mas essa
 * tabela tem `vistoria_id INTEGER NOT NULL REFERENCES vistorias(id)` (schema.sql), então o
 * INSERT sempre violava a chave estrangeira e lançava. A exceção subia para o `catch` da
 * própria função, que tentava gravar o MESMO log de erro de novo (mesmo vistoriaId
 * inexistente) — e falhava do mesmo jeito, só que agora sem nenhum catch ao redor, então a
 * exceção escapava da função inteira em vez de retornar `false` como a assinatura promete.
 * Corrigido separando o caso "vistoria não existe" (retorna `false` sem tentar gravar nada,
 * já que não há FK que essa linha possa satisfazer) do caso "vistoria existe mas não está
 * concluída" (grava o log normalmente, agora também com o imovel_id/contrato_id reais da
 * vistoria em vez do `0`/`undefined` fixos que estavam lá antes).
 *
 * Como reproduzir antes da correção: chamar
 * `sincronizarVistoriaConcluidaParaProvisionamento(db, 999, entidadeId, periodoId)` com 999
 * inexistente em `vistorias` — a chamada lança `Error: FOREIGN KEY constraint failed` em vez
 * de devolver `false`.
 */
describe("integracao-vistorias-provisionamento — casos de borda e erro", () => {
  let db: Database;
  let entidade_id: number;
  let periodo_id: number;

  beforeEach(async () => {
    db = await criarBancoDeTeste();

    const onboarding = criarEntidadeLegal(db, {
      nome: "Titular de Teste — Provisionamento",
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

    executar(db, `INSERT INTO imoveis (id, apelido, tipo, financiado, uso_pessoal) VALUES (1, 'Kitnet Teste', 'kitnet', 0, 0)`);
    executar(
      db,
      `INSERT INTO contratos_locacao (id, imovel_id, locatario, tipo, valor_referencia, data_inicio)
       VALUES (1, 1, 'Inquilino de Teste', 'residencial_fixo', 1500, '2025-01-01')`,
    );
  });

  describe("sincronizarVistoriaConcluidaParaProvisionamento", () => {
    it("retorna false sem gravar log quando a vistoria não existe (não quebra a FK de provisionamento_vistoria_log)", () => {
      // BUG real encontrado por este teste, corrigido no próprio arquivo de produção:
      // `provisionamento_vistoria_log.vistoria_id` tem `REFERENCES vistorias(id)` — tentar
      // gravar um log de erro para um vistoriaId inexistente violava essa FK, e a falha se
      // repetia dentro do próprio catch (que tentava o mesmo INSERT), estourando a exceção
      // para fora da função em vez de devolver `false`. Ver comentário em
      // sincronizarVistoriaConcluidaParaProvisionamento.
      const ok = sincronizarVistoriaConcluidaParaProvisionamento(db, 999, entidade_id, periodo_id);
      expect(ok).toBe(false);

      const logs = consultar(db, "SELECT id FROM provisionamento_vistoria_log WHERE vistoria_id = 999");
      expect(logs).toHaveLength(0);
    });

    it("retorna false e grava log de erro (com o imóvel/contrato reais) quando a vistoria ainda não está concluída", () => {
      executar(db, `INSERT INTO vistorias (id, imovel_id, contrato_id, status) VALUES (1, 1, 1, 'agendada')`);

      const ok = sincronizarVistoriaConcluidaParaProvisionamento(db, 1, entidade_id, periodo_id);
      expect(ok).toBe(false);

      const status = obterStatusProvisionamento(db, 1);
      expect(status.status).toBe(StatusProvisionamento.ERRO);

      const [log] = consultar<{ imovel_id: number; contrato_id: number; referencia_documento: string }>(
        db,
        "SELECT imovel_id, contrato_id, referencia_documento FROM provisionamento_vistoria_log WHERE vistoria_id = 1",
      );
      expect(log.imovel_id).toBe(1);
      expect(log.contrato_id).toBe(1);
      expect(log.referencia_documento).toBe("Vistoria não está concluída");
    });

    it("captura erro real do razão (periodo_id inválido) e grava status ERRO em vez de deixar a exceção subir", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada) VALUES (1, 1, 1, 'concluida', '2025-06-10')`,
      );
      executar(db, `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado) VALUES (1, 'dano', 'Piso', 500)`);

      const periodoInexistente = periodo_id + 9999;
      const ok = sincronizarVistoriaConcluidaParaProvisionamento(db, 1, entidade_id, periodoInexistente);
      expect(ok).toBe(false);

      const status = obterStatusProvisionamento(db, 1);
      expect(status.status).toBe(StatusProvisionamento.ERRO);
    });
  });

  describe("revertorProvisionamentoDanosVistoria", () => {
    it("retorna false quando não há provisão registrada para a vistoria", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada) VALUES (1, 1, 1, 'concluida', '2025-06-10')`,
      );

      const revertido = revertorProvisionamentoDanosVistoria(db, 1, entidade_id, periodo_id, "2025-06-20");
      expect(revertido).toBe(false);
    });

    it("retorna false quando a vistoria nem existe", () => {
      const revertido = revertorProvisionamentoDanosVistoria(db, 999, entidade_id, periodo_id, "2025-06-20");
      expect(revertido).toBe(false);
    });
  });

  describe("processarVistoriasPendentes", () => {
    it("banco sem nenhuma vistoria concluída retorna todos os contadores zerados", () => {
      const resultado = processarVistoriasPendentes(db, entidade_id, periodo_id);
      expect(resultado).toEqual({ processadas: 0, provisionadas: 0, sem_danos: 0, erros: 0 });
    });

    it("conta como erro quando sincronizarVistoriaConcluidaParaProvisionamento falha de verdade (periodo_id inválido)", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada) VALUES (1, 1, 1, 'concluida', '2025-06-10')`,
      );
      executar(db, `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado) VALUES (1, 'dano', 'Piso', 500)`);

      const resultado = processarVistoriasPendentes(db, entidade_id, periodo_id + 9999);
      expect(resultado.processadas).toBe(1);
      expect(resultado.erros).toBe(1);
      expect(resultado.provisionadas).toBe(0);
      expect(resultado.sem_danos).toBe(0);
    });
  });

  describe("validarConsistenciaVistoriaProvisionamento", () => {
    it("vistoria inexistente: inconsistente com a discrepância 'Vistoria não encontrada'", () => {
      const resultado = validarConsistenciaVistoriaProvisionamento(db, 999);
      expect(resultado.consistente).toBe(false);
      expect(resultado.discrepancias).toEqual(["Vistoria não encontrada"]);
      expect(resultado.provisaoInfo).toBeUndefined();
    });

    it("vistoria concluída sem nenhum registro de provisão: sinaliza a discrepância", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada) VALUES (1, 1, 1, 'concluida', '2025-06-10')`,
      );

      const resultado = validarConsistenciaVistoriaProvisionamento(db, 1);
      expect(resultado.consistente).toBe(false);
      expect(resultado.discrepancias).toContain("Vistoria concluída mas sem registro de provisão");
    });

    it("provisão marcada como 'provisionado' mas sem lançamento correspondente no razão: sinaliza a discrepância", () => {
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada) VALUES (1, 1, 1, 'concluida', '2025-06-10')`,
      );
      // Log inserido diretamente (sem passar pelo fluxo real de provisionamento) para simular
      // o cenário de inconsistência: log diz "provisionado" mas nunca houve lançamento no
      // ledger para essa vistoria.
      executar(
        db,
        `INSERT INTO provisionamento_vistoria_log
          (vistoria_id, imovel_id, contrato_id, status, valor_danos_estimado, valor_provision_registrada, valor_desconto_caucao, referencia_documento, criado_em)
         VALUES (1, 1, 1, 'provisionado', 500, 500, 0, 'VIST-1-PROV', datetime('now'))`,
      );

      const resultado = validarConsistenciaVistoriaProvisionamento(db, 1);
      expect(resultado.consistente).toBe(false);
      expect(resultado.discrepancias).toContain("Provisão registrada mas sem lançamento no ledger");
      expect(resultado.provisaoInfo?.status).toBe("provisionado");
    });
  });

  describe("obterStatusProvisionamento", () => {
    it("sem nenhum log registrado, retorna status PENDENTE e os demais campos undefined", () => {
      const status = obterStatusProvisionamento(db, 1234);
      expect(status.status).toBe(StatusProvisionamento.PENDENTE);
      expect(status.valor_danos).toBeUndefined();
      expect(status.valor_provision).toBeUndefined();
      expect(status.ultima_atualizacao).toBeUndefined();
    });
  });

  describe("gerarRelatorioProvisionoesPendentes", () => {
    it("banco totalmente vazio: todos os contadores zerados e vistorias_criticas é um array vazio", () => {
      const relatorio = gerarRelatorioProvisionoesPendentes(db, entidade_id);
      expect(relatorio).toEqual({
        total_vistorias: 0,
        provisionadas: 0,
        pendentes: 0,
        valor_total_pendente: 0,
        vistorias_criticas: [],
      });
    });

    it("lista todas as vistorias críticas (>30 dias de atraso) como array completo, não só a primeira", () => {
      const hoje = new Date();
      const diasAtras = (n: number) => {
        const d = new Date(hoje);
        d.setDate(d.getDate() - n);
        return d.toISOString().slice(0, 10);
      };

      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada) VALUES (1, 1, 1, 'concluida', ?)`,
        [diasAtras(45)],
      );
      executar(db, `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado) VALUES (1, 'dano', 'Piso', 500)`);

      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada) VALUES (2, 1, 1, 'concluida', ?)`,
        [diasAtras(90)],
      );
      executar(db, `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado) VALUES (2, 'dano', 'Janela', 300)`);

      // Vistoria concluída recente (menos de 30 dias) não deve entrar em vistorias_criticas.
      executar(
        db,
        `INSERT INTO vistorias (id, imovel_id, contrato_id, status, data_realizada) VALUES (3, 1, 1, 'concluida', ?)`,
        [diasAtras(5)],
      );
      executar(db, `INSERT INTO vistoria_item (vistoria_id, tipo, descricao, valor_estimado) VALUES (3, 'dano', 'Torneira', 100)`);

      const relatorio = gerarRelatorioProvisionoesPendentes(db, entidade_id);

      expect(relatorio.total_vistorias).toBe(3);
      expect(relatorio.pendentes).toBe(3);
      expect(relatorio.valor_total_pendente).toBe(900);

      expect(relatorio.vistorias_criticas).toHaveLength(2);
      const idsCriticos = relatorio.vistorias_criticas.map((v) => v.vistoria_id).sort();
      expect(idsCriticos).toEqual([1, 2]);
      // Ordenado por dias_atraso DESC: a vistoria 2 (90 dias) vem antes da 1 (45 dias).
      expect(relatorio.vistorias_criticas[0].vistoria_id).toBe(2);
      expect(relatorio.vistorias_criticas[0].valor_danos).toBe(300);
      expect(relatorio.vistorias_criticas[1].vistoria_id).toBe(1);
      expect(relatorio.vistorias_criticas[1].valor_danos).toBe(500);
    });
  });
});
