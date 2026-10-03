import { describe, expect, it } from "vitest";
import { PLANO_DE_CONTAS } from "../../planoDeContas";
import { PLANO_DE_CONTAS_ERP } from "../planoDeContasErp";
import {
  CONTA_CAIXA_ERP,
  CONTA_CLASSIFICACAO_PENDENTE,
  CONTA_LUCROS_ACUMULADOS_ERP,
  MAPA_APP_PARA_ERP,
  contaContrapartida,
} from "../mapeamentoPlanoApp";

describe("mapeamentoPlanoApp", () => {
  describe("contaContrapartida", () => {
    it("código mapeado retorna a conta correspondente do razão, marcada como classificada", () => {
      expect(contaContrapartida("1.1.01")).toEqual({ conta_id: 4101, classificada: true });
      expect(contaContrapartida("2.1.01")).toEqual({ conta_id: 5210, classificada: true });
    });

    it("código nulo, indefinido ou vazio retorna a conta de classificação pendente, não classificada", () => {
      expect(contaContrapartida(null)).toEqual({ conta_id: CONTA_CLASSIFICACAO_PENDENTE, classificada: false });
      expect(contaContrapartida(undefined)).toEqual({ conta_id: CONTA_CLASSIFICACAO_PENDENTE, classificada: false });
      expect(contaContrapartida("")).toEqual({ conta_id: CONTA_CLASSIFICACAO_PENDENTE, classificada: false });
    });

    it("código desconhecido (fora do plano do app) também retorna a conta de pendência, nunca uma conta 'parecida'", () => {
      expect(contaContrapartida("9.9.99")).toEqual({ conta_id: CONTA_CLASSIFICACAO_PENDENTE, classificada: false });
    });

    it("cada código de PLANO_DE_CONTAS (app) tem uma tradução para o razão", () => {
      for (const conta of PLANO_DE_CONTAS) {
        const r = contaContrapartida(conta.codigo);
        expect(r.classificada).toBe(true);
        expect(r.conta_id).not.toBe(CONTA_CLASSIFICACAO_PENDENTE);
      }
    });
  });

  describe("MAPA_APP_PARA_ERP", () => {
    it("tem uma entrada para todo código do plano do app (nenhum código órfão sem contrapartida)", () => {
      const codigosApp = new Set(PLANO_DE_CONTAS.map((c) => c.codigo));
      const codigosMapeados = new Set(Object.keys(MAPA_APP_PARA_ERP));
      expect(codigosMapeados).toEqual(codigosApp);
    });

    it("toda conta de contrapartida referenciada existe de fato no plano do razão (PLANO_DE_CONTAS_ERP)", () => {
      // Tipado como Set<number> (em vez de inferir o union de literais de PLANO_DE_CONTAS_ERP)
      // porque contaId, abaixo, vem de MAPA_APP_PARA_ERP — que é Record<string, number> — e
      // não de um literal do plano do razão; comparar contra o union exigiria um "as" por
      // código do app só para satisfazer o compilador, sem ganho de segurança real.
      const idsErpValidos = new Set<number>(PLANO_DE_CONTAS_ERP.map((c) => c.id));
      for (const [codigoApp, contaId] of Object.entries(MAPA_APP_PARA_ERP)) {
        expect(idsErpValidos.has(contaId), `código do app "${codigoApp}" aponta para conta ${contaId}, que não existe no razão`).toBe(true);
      }
    });

    it("receitas do app (grupo 'receita') mapeiam para contas de receita do razão (faixa 4, natureza crédito)", () => {
      const erpPorId = new Map<number, (typeof PLANO_DE_CONTAS_ERP)[number]>(PLANO_DE_CONTAS_ERP.map((c) => [c.id, c]));
      for (const conta of PLANO_DE_CONTAS.filter((c) => c.grupo === "receita")) {
        const contaErp = erpPorId.get(MAPA_APP_PARA_ERP[conta.codigo]);
        expect(contaErp?.grupo, `${conta.codigo} (${conta.descricao})`).toBe("receita");
      }
    });

    it("despesas do app (grupo 'despesa') mapeiam para despesa, exceto as duas patrimoniais documentadas (capex e amortização)", () => {
      const erpPorId = new Map<number, (typeof PLANO_DE_CONTAS_ERP)[number]>(PLANO_DE_CONTAS_ERP.map((c) => [c.id, c]));
      const excecoesPatrimoniais = new Set(["2.1.03", "2.1.06"]); // capex → ativo; amortização → passivo
      for (const conta of PLANO_DE_CONTAS.filter((c) => c.grupo === "despesa")) {
        const contaErp = erpPorId.get(MAPA_APP_PARA_ERP[conta.codigo]);
        if (excecoesPatrimoniais.has(conta.codigo)) {
          expect(["ativo", "passivo"]).toContain(contaErp?.grupo);
        } else {
          expect(contaErp?.grupo, `${conta.codigo} (${conta.descricao})`).toBe("despesa");
        }
      }
    });

    it("depósito caução (9.0.02) mapeia para passivo, nunca para receita", () => {
      const erpPorId = new Map<number, (typeof PLANO_DE_CONTAS_ERP)[number]>(PLANO_DE_CONTAS_ERP.map((c) => [c.id, c]));
      const contaErp = erpPorId.get(MAPA_APP_PARA_ERP["9.0.02"]);
      expect(contaErp?.grupo).toBe("passivo");
    });
  });

  describe("constantes de conta", () => {
    it("CONTA_CAIXA_ERP aponta para a conta 'Caixa' (ativo) do plano do razão", () => {
      const conta = PLANO_DE_CONTAS_ERP.find((c) => c.id === CONTA_CAIXA_ERP);
      expect(conta?.descricao).toBe("Caixa");
      expect(conta?.grupo).toBe("ativo");
    });

    it("CONTA_CLASSIFICACAO_PENDENTE aponta para a conta transitória de suspense", () => {
      const conta = PLANO_DE_CONTAS_ERP.find((c) => c.id === CONTA_CLASSIFICACAO_PENDENTE);
      expect(conta?.descricao).toBe("Classificação pendente (conta transitória)");
    });

    it("CONTA_LUCROS_ACUMULADOS_ERP aponta para uma conta de patrimônio líquido", () => {
      const conta = PLANO_DE_CONTAS_ERP.find((c) => c.id === CONTA_LUCROS_ACUMULADOS_ERP);
      expect(conta?.descricao).toBe("Lucros acumulados");
      expect(conta?.grupo).toBe("patrimonio_liquido");
    });
  });
});
