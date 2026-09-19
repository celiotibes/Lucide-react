import { describe, it, expect, beforeEach } from "vitest";
import { DuplicatePaymentGuard } from "../duplicate-payment-guard";
import { ContextoAutenticacao, Usuario, UserRole } from "../../auth/auth-service";

describe("Duplicate Payment Protection (P1.5)", () => {
  let guard: DuplicatePaymentGuard;

  const usuarios_teste = {
    admin: {
      id: "user_admin_1",
      nome: "Admin",
      email: "admin@example.com",
      role: "admin" as UserRole,
      ativo: true,
      data_criacao: "2026-01-01",
    } as Usuario,
    gestor: {
      id: "user_gestor_1",
      nome: "Gestor",
      email: "gestor@example.com",
      role: "gestor" as UserRole,
      ativo: true,
      data_criacao: "2026-01-01",
    } as Usuario,
    paulo: {
      id: "user_prestador_1",
      nome: "Paulo Bruxel",
      email: "paulo@example.com",
      role: "prestador" as UserRole,
      prestador_id: 1,
      ativo: true,
      data_criacao: "2026-01-01",
    } as Usuario,
  };

  beforeEach(() => {
    guard = new DuplicatePaymentGuard();
  });

  describe("Verificação de Duplicação", () => {
    it("permite primeira submissão", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      const resultado = guard.verificarDuplicacao(contexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(false);
      expect(resultado.motivo).toBeUndefined();
    });

    it("bloqueia segunda submissão do mesmo mês (status pendente)", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      // Primeira submissão
      guard.registrarPagamento(contexto, 1, "2026-08", 5000, "pendente");

      // Tentativa de segunda submissão
      const resultado = guard.verificarDuplicacao(contexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(true);
      expect(resultado.motivo).toContain("pendente");
    });

    it("bloqueia segunda submissão se status é aprovado", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      // Primeira submissão aprovada
      guard.registrarPagamento(contexto, 1, "2026-08", 5000, "aprovado");

      // Tentativa de segunda submissão
      const resultado = guard.verificarDuplicacao(contexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(true);
      expect(resultado.motivo).toContain("aprovado");
    });

    it("permite resubmissão se pagamento anterior foi rejeitado", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      // Primeira submissão rejeitada
      guard.registrarPagamento(contexto, 1, "2026-08", 5000, "rejeitado");

      // Tentativa de resubmissão após rejeição
      const resultado = guard.verificarDuplicacao(contexto, 1, "2026-08");

      expect(resultado.duplicado).toBe(false);
      expect(resultado.motivo).toContain("rejeitado");
      expect(resultado.pagamentoAnterior).toBeDefined();
    });

    it("permite submissões de meses diferentes", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      // Submissão agosto
      guard.registrarPagamento(contexto, 1, "2026-08", 5000, "pendente");

      // Submissão setembro (mesmo prestador, mês diferente)
      const resultado = guard.verificarDuplicacao(contexto, 1, "2026-09");

      expect(resultado.duplicado).toBe(false);
    });

    it("bloqueia prestador tentando submeter dados de outro", () => {
      const contexto_paulo: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      // Paulo tenta submeter para prestador 2
      const resultado = guard.verificarDuplicacao(contexto_paulo, 2, "2026-08");

      expect(resultado.duplicado).toBe(true);
      expect(resultado.motivo).toContain("outro prestador");
    });

    it("permite admin submeter para qualquer prestador", () => {
      const contexto_admin: ContextoAutenticacao = {
        usuario: usuarios_teste.admin,
        autenticado: true,
        role: "admin",
      };

      const resultado = guard.verificarDuplicacao(contexto_admin, 1, "2026-08");

      expect(resultado.duplicado).toBe(false);
    });

    it("permite gestor submeter para qualquer prestador", () => {
      const contexto_gestor: ContextoAutenticacao = {
        usuario: usuarios_teste.gestor,
        autenticado: true,
        role: "gestor",
      };

      const resultado = guard.verificarDuplicacao(contexto_gestor, 1, "2026-08");

      expect(resultado.duplicado).toBe(false);
    });
  });

  describe("Registro de Pagamentos", () => {
    it("registra pagamento com status padrão (pendente)", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      const pagamento = guard.registrarPagamento(contexto, 1, "2026-08", 5000);

      expect(pagamento.status).toBe("pendente");
      expect(pagamento.prestador_id).toBe(1);
      expect(pagamento.mes_referencia).toBe("2026-08");
      expect(pagamento.total_pagar).toBe(5000);
      expect(pagamento.usuario_id).toBe("user_prestador_1");
    });

    it("registra pagamento com status customizado", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.admin,
        autenticado: true,
        role: "admin",
      };

      const pagamento = guard.registrarPagamento(
        contexto,
        1,
        "2026-08",
        5000,
        "aprovado"
      );

      expect(pagamento.status).toBe("aprovado");
    });
  });

  describe("Atualização de Status", () => {
    it("atualiza status de pendente para aprovado", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      guard.registrarPagamento(contexto, 1, "2026-08", 5000, "pendente");

      const resultado = guard.atualizarStatus(1, "2026-08", "aprovado");

      expect(resultado).toBe(true);

      // Verificar que status foi atualizado
      const verificacao = guard.verificarDuplicacao(contexto, 1, "2026-08");
      expect(verificacao.pagamentoAnterior?.status).toBe("aprovado");
    });

    it("atualiza status de pendente para rejeitado", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      guard.registrarPagamento(contexto, 1, "2026-08", 5000, "pendente");

      const resultado = guard.atualizarStatus(1, "2026-08", "rejeitado");

      expect(resultado).toBe(true);

      // Verificar que permite resubmissão após rejeição
      const verificacao = guard.verificarDuplicacao(contexto, 1, "2026-08");
      expect(verificacao.duplicado).toBe(false);
    });

    it("retorna false se pagamento não existe", () => {
      const resultado = guard.atualizarStatus(1, "2026-08", "aprovado");

      expect(resultado).toBe(false);
    });
  });

  describe("Consultas", () => {
    it("obtém histórico de prestador", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      guard.registrarPagamento(contexto, 1, "2026-08", 5000);
      guard.registrarPagamento(contexto, 1, "2026-09", 5200);
      guard.registrarPagamento(contexto, 2, "2026-08", 4000);

      const historico = guard.obterHistoricoPrestador(1);

      expect(historico).toHaveLength(2);
      expect(historico[0].mes_referencia).toBe("2026-08");
      expect(historico[1].mes_referencia).toBe("2026-09");
    });

    it("obtém pagamentos pendentes", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      guard.registrarPagamento(contexto, 1, "2026-08", 5000, "pendente");
      guard.registrarPagamento(contexto, 1, "2026-09", 5200, "aprovado");
      guard.registrarPagamento(contexto, 2, "2026-08", 4000, "pendente");

      const pendentes = guard.obterPendentes();

      expect(pendentes).toHaveLength(2);
      expect(pendentes.every((p) => p.status === "pendente")).toBe(true);
    });

    it("obtém pagamentos por período", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      const agora = new Date();
      guard.registrarPagamento(contexto, 1, "2026-08", 5000);

      const data_inicio = new Date(agora.getTime() - 60000); // 1 minuto atrás
      const data_fim = new Date(agora.getTime() + 60000); // 1 minuto depois

      const pagamentos = guard.obterPorPeriodo(data_inicio, data_fim);

      expect(pagamentos.length).toBeGreaterThan(0);
    });
  });

  describe("Casos de Uso Integrados", () => {
    it("workflow completo: submissão → rejeição → resubmissão → aprovação", () => {
      const contexto: ContextoAutenticacao = {
        usuario: usuarios_teste.paulo,
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      // 1. Submissão inicial
      let verif = guard.verificarDuplicacao(contexto, 1, "2026-08");
      expect(verif.duplicado).toBe(false);

      guard.registrarPagamento(contexto, 1, "2026-08", 5000, "pendente");

      // 2. Não permite segunda submissão (ainda pendente)
      verif = guard.verificarDuplicacao(contexto, 1, "2026-08");
      expect(verif.duplicado).toBe(true);

      // 3. Admin rejeita
      guard.atualizarStatus(1, "2026-08", "rejeitado");

      // 4. Agora permite resubmissão
      verif = guard.verificarDuplicacao(contexto, 1, "2026-08");
      expect(verif.duplicado).toBe(false);

      guard.registrarPagamento(contexto, 1, "2026-08", 5100, "pendente");

      // 5. Admin aprova
      guard.atualizarStatus(1, "2026-08", "aprovado");

      // 6. Não permite mais resubmissão (aprovado)
      verif = guard.verificarDuplicacao(contexto, 1, "2026-08");
      expect(verif.duplicado).toBe(true);
      expect(verif.pagamentoAnterior?.status).toBe("aprovado");
    });
  });
});
