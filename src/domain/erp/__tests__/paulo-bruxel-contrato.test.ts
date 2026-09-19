import { describe, it, expect, beforeEach } from "vitest";
import {
  inicializarParametros,
  calcularDiaria,
  calcularDeslocamento,
  calcularCombustivel,
  processarMes,
  aplicarReajusteIpca,
  validarApontamentos,
  RegistroAcesso,
  ParametrosContrato,
} from "../paulo-bruxel-contrato";

describe("Paulo Bruxel Contract Module", () => {
  describe("inicializarParametros", () => {
    it("inicializa parâmetros para julho 2026", () => {
      const parametros = inicializarParametros("2026-07");

      expect(parametros.mes_referencia).toBe("2026-07");
      expect(parametros.diaria_base).toBe(121.63);
      expect(parametros.hora_adicional).toBe(14.53);
      expect(parametros.deslocamento_km).toBe(7.5);
      expect(parametros.combustivel_litro).toBe(7.0);
      expect(parametros.ipca_percentual).toBe(4.64);
      expect(parametros.base_obrigatoria_valor).toBeCloseTo(973.04, 1);
    });

    it("inicializa parâmetros para agosto 2026 com reajuste IPCA", () => {
      const parametros = inicializarParametros("2026-08");

      expect(parametros.mes_referencia).toBe("2026-08");
      expect(parametros.diaria_base).toBeCloseTo(127.24, 2);
      expect(parametros.ipca_percentual).toBe(4.64);
      expect(parametros.combustivel_litro).toBe(8.4); // 7.0 * 1.2 (+20%)
    });

    it("lança erro para mês não definido", () => {
      expect(() => inicializarParametros("2026-09")).toThrow();
    });
  });

  describe("calcularDiaria", () => {
    let parametros: ParametrosContrato;

    beforeEach(() => {
      parametros = inicializarParametros("2026-07");
    });

    it("calcula diária de dia útil com até 8 horas", () => {
      const resultado = calcularDiaria(parametros, "dia_util", 8);

      expect(resultado.diaria_pura).toBe(121.63);
      expect(resultado.adicional_fim_semana).toBe(0);
      expect(resultado.horas_extras).toBe(0);
      expect(resultado.valor_total).toBe(121.63);
    });

    it("calcula diária com horas extras (além de 8h)", () => {
      const resultado = calcularDiaria(parametros, "dia_util", 10);

      expect(resultado.diaria_pura).toBe(121.63);
      expect(resultado.horas_extras).toBeGreaterThan(0);
      expect(resultado.valor_total).toBeGreaterThan(121.63);
    });

    it("calcula diária de sábado com adicional de 15%", () => {
      const resultado = calcularDiaria(parametros, "sabado", 8);

      expect(resultado.diaria_pura).toBe(121.63);
      expect(resultado.adicional_fim_semana).toBeCloseTo(18.24, 2);
      expect(resultado.valor_total).toBeCloseTo(139.87, 2);
    });

    it("calcula diária de domingo com adicional de 15%", () => {
      const resultado = calcularDiaria(parametros, "domingo", 8);

      expect(resultado.diaria_pura).toBe(121.63);
      expect(resultado.adicional_fim_semana).toBeCloseTo(18.24, 2);
      expect(resultado.valor_total).toBeCloseTo(139.87, 2);
    });

    it("calcula diária de feriado com adicional de 15%", () => {
      const resultado = calcularDiaria(parametros, "feriado", 8);

      expect(resultado.adicional_fim_semana).toBeCloseTo(18.24, 2);
    });
  });

  describe("calcularDeslocamento", () => {
    let parametros: ParametrosContrato;

    beforeEach(() => {
      parametros = inicializarParametros("2026-07");
    });

    it("calcula deslocamento de 10 km", () => {
      const resultado = calcularDeslocamento(parametros, 10);

      expect(resultado.km_total).toBe(10);
      expect(resultado.valor_unitario).toBe(7.5);
      expect(resultado.valor_total).toBe(75.0);
    });

    it("calcula deslocamento de 50 km", () => {
      const resultado = calcularDeslocamento(parametros, 50);

      expect(resultado.valor_total).toBe(375.0);
    });

    it("calcula deslocamento de zero km", () => {
      const resultado = calcularDeslocamento(parametros, 0);

      expect(resultado.valor_total).toBe(0);
    });
  });

  describe("calcularCombustivel", () => {
    let parametros: ParametrosContrato;

    beforeEach(() => {
      parametros = inicializarParametros("2026-07");
    });

    it("calcula combustível com ajuste de +20%", () => {
      const resultado = calcularCombustivel(parametros, 10);

      expect(resultado.litros).toBe(10);
      expect(resultado.valor_litro_base).toBe(7.0);
      expect(resultado.ajuste_mercado).toBe(20);
      expect(resultado.valor_litro_final).toBe(8.4);
      expect(resultado.valor_total).toBe(84.0);
    });

    it("calcula combustível para agosto 2026", () => {
      const parametrosAgosto = inicializarParametros("2026-08");
      const resultado = calcularCombustivel(parametrosAgosto, 18.3);

      expect(resultado.valor_total).toBeCloseTo(184.46, 1);
    });
  });

  describe("processarMes", () => {
    let parametros: ParametrosContrato;
    let registros: RegistroAcesso[];

    beforeEach(() => {
      parametros = inicializarParametros("2026-07");
      registros = [
        {
          data: "2026-07-01",
          tipo_dia: "dia_util",
          horas_trabalhadas: 7,
          km_percorridos: 9,
          descricao: "Limpeza e manutenção",
        },
        {
          data: "2026-07-02",
          tipo_dia: "dia_util",
          horas_trabalhadas: 4,
          km_percorridos: 0,
          descricao: "Compras",
        },
        {
          data: "2026-07-03",
          tipo_dia: "dia_util",
          horas_trabalhadas: 5,
          km_percorridos: 0,
          descricao: "Manutenção",
        },
        {
          data: "2026-07-08",
          tipo_dia: "dia_util",
          horas_trabalhadas: 6,
          km_percorridos: 9,
          descricao: "Compras e limpeza",
        },
        {
          data: "2026-07-10",
          tipo_dia: "dia_util",
          horas_trabalhadas: 6,
          km_percorridos: 15,
          descricao: "Compras",
        },
        {
          data: "2026-07-15",
          tipo_dia: "dia_util",
          horas_trabalhadas: 4,
          km_percorridos: 0,
          descricao: "Compras",
        },
        {
          data: "2026-07-17",
          tipo_dia: "dia_util",
          horas_trabalhadas: 6,
          km_percorridos: 9,
          descricao: "Compras e manutenção",
        },
        {
          data: "2026-07-22",
          tipo_dia: "dia_util",
          horas_trabalhadas: 4,
          km_percorridos: 0,
          descricao: "Verificações",
        },
        {
          data: "2026-07-24",
          tipo_dia: "dia_util",
          horas_trabalhadas: 6,
          km_percorridos: 15,
          descricao: "Compras",
        },
        {
          data: "2026-07-30",
          tipo_dia: "dia_util",
          horas_trabalhadas: 6,
          km_percorridos: 15,
          descricao: "Compras e leitura",
        },
      ];
    });

    it("processa mês com 10 dias de trabalho", () => {
      const componentes = processarMes(parametros, registros, 50, 30);

      expect(componentes.total).toBeGreaterThan(0);
      expect(componentes.diarias_normais).toBeGreaterThan(0);
      expect(componentes.comunicacao).toBe(244.1);
      expect(componentes.reembolso_cartao).toBe(50);
      expect(componentes.reembolso_pix).toBe(30);
      expect(componentes.memoria_calculo).toContain("TOTAL");
    });

    it("inclui combustível quando há km percorridos", () => {
      const componentes = processarMes(parametros, registros);

      expect(componentes.combustivel).toBeGreaterThan(0);
    });

    it("não inclui combustível quando não há km", () => {
      const registrosSemKm = registros.map((r) => ({ ...r, km_percorridos: 0 }));
      const componentes = processarMes(parametros, registrosSemKm);

      expect(componentes.combustivel).toBe(0);
    });
  });

  describe("aplicarReajusteIpca", () => {
    let parametros: ParametrosContrato;

    beforeEach(() => {
      parametros = inicializarParametros("2026-07");
    });

    it("aplica reajuste IPCA de 4.64%", () => {
      const { parametrosNovos, historico } = aplicarReajusteIpca(
        parametros,
        4.64,
        "2026-08"
      );

      expect(parametrosNovos.mes_referencia).toBe("2026-08");
      expect(parametrosNovos.diaria_base).toBeCloseTo(127.27, 1);
      expect(parametrosNovos.hora_adicional).toBeCloseTo(15.2, 2);
      expect(historico.percentual_ipca).toBe(4.64);
      expect(historico.diaria_base_nova).toBeCloseTo(127.27, 1);
    });

    it("registra histórico do reajuste", () => {
      const { historico } = aplicarReajusteIpca(parametros, 5.0, "2026-08");

      expect(historico.mes_referencia).toBe("2026-08");
      expect(historico.diaria_base_anterior).toBe(121.63);
      expect(historico.data_ajuste).toBeDefined();
    });
  });

  describe("validarApontamentos", () => {
    it("valida apontamentos corretos", () => {
      const registros: RegistroAcesso[] = [
        {
          data: "2026-07-01",
          tipo_dia: "dia_util",
          horas_trabalhadas: 8,
          km_percorridos: 10,
        },
      ];

      const resultado = validarApontamentos(registros);

      expect(resultado.valido).toBe(true);
      expect(resultado.erros).toHaveLength(0);
    });

    it("rejeita horas negativas", () => {
      const registros: RegistroAcesso[] = [
        {
          data: "2026-07-01",
          tipo_dia: "dia_util",
          horas_trabalhadas: -2,
          km_percorridos: 10,
        },
      ];

      const resultado = validarApontamentos(registros);

      expect(resultado.valido).toBe(false);
      expect(resultado.erros.length).toBeGreaterThan(0);
    });

    it("rejeita km negativo", () => {
      const registros: RegistroAcesso[] = [
        {
          data: "2026-07-01",
          tipo_dia: "dia_util",
          horas_trabalhadas: 8,
          km_percorridos: -50,
        },
      ];

      const resultado = validarApontamentos(registros);

      expect(resultado.valido).toBe(false);
    });

    it("avisa quando há mais de 12 horas", () => {
      const registros: RegistroAcesso[] = [
        {
          data: "2026-07-01",
          tipo_dia: "dia_util",
          horas_trabalhadas: 15,
          km_percorridos: 10,
        },
      ];

      const resultado = validarApontamentos(registros);

      expect(resultado.avisos.length).toBeGreaterThan(0);
    });

    it("avisa quando há mais de 500 km", () => {
      const registros: RegistroAcesso[] = [
        {
          data: "2026-07-01",
          tipo_dia: "dia_util",
          horas_trabalhadas: 8,
          km_percorridos: 600,
        },
      ];

      const resultado = validarApontamentos(registros);

      expect(resultado.avisos.length).toBeGreaterThan(0);
    });

    it("rejeita registros vazios", () => {
      const resultado = validarApontamentos([]);

      expect(resultado.valido).toBe(false);
      expect(resultado.erros.length).toBeGreaterThan(0);
    });
  });

  describe("Caso Real - Junho 2026 (dados do formulário)", () => {
    it("processa dados reais de junho 2026", () => {
      const parametros = inicializarParametros("2026-07");

      // Dados do formulário de junho - 12 dias trabalhados
      const registrosJunho: RegistroAcesso[] = [
        // Semana 1
        { data: "2026-06-01", tipo_dia: "dia_util", horas_trabalhadas: 7, km_percorridos: 9 },
        { data: "2026-06-02", tipo_dia: "dia_util", horas_trabalhadas: 4, km_percorridos: 0 },
        { data: "2026-06-03", tipo_dia: "dia_util", horas_trabalhadas: 5, km_percorridos: 0 },
        { data: "2026-06-04", tipo_dia: "dia_util", horas_trabalhadas: 4, km_percorridos: 0 },
        // Semana 2
        { data: "2026-06-08", tipo_dia: "dia_util", horas_trabalhadas: 6, km_percorridos: 9 },
        { data: "2026-06-10", tipo_dia: "dia_util", horas_trabalhadas: 6, km_percorridos: 15 },
        // Semana 3
        { data: "2026-06-15", tipo_dia: "dia_util", horas_trabalhadas: 4, km_percorridos: 0 },
        { data: "2026-06-17", tipo_dia: "dia_util", horas_trabalhadas: 6, km_percorridos: 9 },
        // Semana 4
        { data: "2026-06-22", tipo_dia: "dia_util", horas_trabalhadas: 4, km_percorridos: 0 },
        { data: "2026-06-24", tipo_dia: "dia_util", horas_trabalhadas: 6, km_percorridos: 15 },
        // Semana 5
        { data: "2026-06-30", tipo_dia: "dia_util", horas_trabalhadas: 6, km_percorridos: 15 },
      ];

      const componentes = processarMes(parametros, registrosJunho, 0, 0);

      // Validação básica
      expect(componentes.total).toBeGreaterThan(0);
      expect(componentes.comunicacao).toBe(244.1); // R$ 244,10
    });
  });

  describe("Edge Cases - Casos Extremos", () => {
    let parametros: ParametrosContrato;

    beforeEach(() => {
      parametros = inicializarParametros("2026-07");
    });

    it("processa horas fracionárias (0.5 de hora)", () => {
      const resultado = calcularDiaria(parametros, "dia_util", 8.5);

      expect(resultado.valor_total).toBeGreaterThan(parametros.diaria_base);
      expect(resultado.horas_extras).toBeGreaterThan(0);
    });

    it("processa dia com 24 horas (limite máximo)", () => {
      const resultado = calcularDiaria(parametros, "dia_util", 24);

      expect(resultado.valor_total).toBeGreaterThan(0);
      expect(resultado.horas_extras).toBeGreaterThan(0);
      expect(isFinite(resultado.valor_total)).toBe(true);
    });

    it("processa dia com zero horas (ainda recebe diária base se apontado)", () => {
      const resultado = calcularDiaria(parametros, "dia_util", 0);

      // Se o dia foi apontado, ele recebe a diária base mesmo que tenha 0 horas
      // Válido quando alguém se desloca mas não trabalha por motivo de força maior
      expect(resultado.valor_total).toBe(parametros.diaria_base);
      expect(resultado.diaria_pura).toBe(parametros.diaria_base);
    });

    it("processa deslocamento de zero km", () => {
      const resultado = calcularDeslocamento(parametros, 0);

      expect(resultado.valor_total).toBe(0);
    });

    it("processa combustível com zero litros", () => {
      const resultado = calcularCombustivel(parametros, 0);

      expect(resultado.valor_total).toBe(0);
    });

    it("processa feriado com horas extras significativas", () => {
      const resultado = calcularDiaria(parametros, "feriado", 12);

      // Feriado tem 15% de adicional + horas extras
      expect(resultado.adicional_fim_semana).toBeGreaterThan(0);
      expect(resultado.horas_extras).toBeGreaterThan(0);
    });

    it("processa reembolsos muito altos sem overflow", () => {
      const registros: RegistroAcesso[] = [
        { data: "2026-07-01", tipo_dia: "dia_util", horas_trabalhadas: 8, km_percorridos: 0 }
      ];

      const componentes = processarMes(parametros, registros, 50000, 50000);

      expect(isFinite(componentes.total)).toBe(true);
      expect(componentes.reembolso_cartao).toBe(50000);
      expect(componentes.reembolso_pix).toBe(50000);
    });

    it("processa 31 dias do mês com trabalho todos os dias", () => {
      const registros: RegistroAcesso[] = Array.from({ length: 31 }, (_, i) => ({
        data: `2026-07-${String(i + 1).padStart(2, "0")}`,
        tipo_dia: "dia_util",
        horas_trabalhadas: 8,
        km_percorridos: 0
      }));

      const componentes = processarMes(parametros, registros, 0, 0);

      expect(componentes.total).toBeGreaterThan(0);
      expect(isFinite(componentes.total)).toBe(true);
    });

    it("valida deslocamento com mais de 500 km", () => {
      const resultado = calcularDeslocamento(parametros, 1000);

      expect(resultado.valor_total).toBe(7500); // 1000 * 7.50
      expect(isFinite(resultado.valor_total)).toBe(true);
    });
  });
});
