import { describe, it, expect, beforeAll, beforeEach } from "vitest";
import { AuthService, Usuario } from "../auth-service";
import { AuditTrailService } from "../audit-trail";
import { PermissionGuard } from "../permission-guard";
import { DuplicatePaymentGuard } from "../../erp/duplicate-payment-guard";

describe("Authentication & Authorization Integration (P1.4+P1.5)", () => {
  let authService: AuthService;
  let auditService: AuditTrailService;
  let guard: PermissionGuard;
  let paymentGuard: DuplicatePaymentGuard;

  let usuarios_teste: Usuario[];

  // O hash sai de gerarHashSenha em vez de ser uma constante colada aqui: assim o
  // teste continua válido se o custo do bcrypt mudar, e falha de verdade se a
  // validação de senha parar de conferir o hash.
  beforeAll(async () => {
    const senhaHash = await AuthService.gerarHashSenha("senha123");
    usuarios_teste = [
      {
        id: "user_admin_1",
        nome: "Admin User",
        email: "admin@example.com",
        role: "admin",
        senha_hash: senhaHash,
        ativo: true,
        data_criacao: "2026-01-01",
      },
      {
        id: "user_gestor_1",
        nome: "Gestor User",
        email: "gestor@example.com",
        role: "gestor",
        senha_hash: senhaHash,
        ativo: true,
        data_criacao: "2026-01-01",
      },
      {
        id: "user_prestador_1",
        nome: "Paulo Bruxel",
        email: "paulo@example.com",
        role: "prestador",
        prestador_id: 1,
        senha_hash: senhaHash,
        ativo: true,
        data_criacao: "2026-01-01",
      },
    ];
  });

  beforeEach(() => {
    authService = new AuthService();
    auditService = new AuditTrailService();
    guard = new PermissionGuard(authService, auditService);
    paymentGuard = new DuplicatePaymentGuard();
  });

  describe("Fluxo Completo: Autenticação → Submissão → Aprovação", () => {
    it("prestador faz login, submete apontamento, gestor aprova", async () => {
      // 1. Prestador faz login
      const loginResult = await authService.autenticar(
        "paulo@example.com",
        "senha123",
        usuarios_teste
      );

      expect(loginResult.sucesso).toBe(true);
      const prestadorToken = loginResult.token!;
      const prestadorContext = authService.validarToken(prestadorToken);

      expect(prestadorContext?.usuario?.role).toBe("prestador");
      expect(prestadorContext?.usuario?.prestador_id).toBe(1);

      // 2. Log login in audit trail
      auditService.registrarAcao(
        prestadorContext!,
        "login",
        "usuario",
        "paulo@example.com",
        {
          descricao: `${prestadorContext?.usuario?.nome} realizou login`,
          resultado: "sucesso",
        }
      );

      const loginAudits = auditService.obterTodos({ tipo_acao: "login" });
      expect(loginAudits.length).toBeGreaterThan(0);

      // 3. Prestador tenta submeter apontamento (tem permissão)
      const temPermissaoSubmeter = authService.temPermissao(
        prestadorContext!,
        "prestador_apontamento",
        "criar"
      );
      expect(temPermissaoSubmeter).toBe(true);

      // 4. Registrar submissão no payment guard
      const verificacaoDuplicacao1 = paymentGuard.verificarDuplicacao(
        prestadorContext!,
        1,
        "2026-08"
      );
      expect(verificacaoDuplicacao1.duplicado).toBe(false);

      paymentGuard.registrarPagamento(
        prestadorContext!,
        1,
        "2026-08",
        5000,
        "pendente"
      );

      auditService.registrarAcao(
        prestadorContext!,
        "criar_apontamento",
        "prestador_apontamento",
        "apon_2026-08",
        {
          descricao: "Apontamento de Paulo submetido",
          valores_novos: { dias: 22, total: 5000 },
          resultado: "sucesso",
          prestador_id: 1,
        }
      );

      // 5. Prestador não pode submeter novamente (duplicação)
      const verificacaoDuplicacao2 = paymentGuard.verificarDuplicacao(
        prestadorContext!,
        1,
        "2026-08"
      );
      expect(verificacaoDuplicacao2.duplicado).toBe(true);

      // 6. Gestor faz login
      const gestorLogin = await authService.autenticar(
        "gestor@example.com",
        "senha123",
        usuarios_teste
      );
      expect(gestorLogin.sucesso).toBe(true);
      const gestorToken = gestorLogin.token!;
      const gestorContext = authService.validarToken(gestorToken);

      auditService.registrarAcao(
        gestorContext!,
        "login",
        "usuario",
        "gestor@example.com",
        {
          descricao: `${gestorContext?.usuario?.nome} realizou login`,
          resultado: "sucesso",
        }
      );

      // 7. Gestor pode aprovar pagamentos
      const temPermissaoAprovar = authService.temPermissao(
        gestorContext!,
        "prestador_pagamento",
        "aprovar"
      );
      expect(temPermissaoAprovar).toBe(true);

      // 8. Gestor aprova pagamento
      const aprovacao = paymentGuard.atualizarStatus(gestorContext!, 1, "2026-08", "aprovado");
      expect(aprovacao.sucesso).toBe(true);

      auditService.registrarAcao(
        gestorContext!,
        "aprovar_pagamento",
        "prestador_pagamento",
        "pag_2026-08",
        {
          descricao: "Pagamento de Paulo aprovado",
          valores_novos: { status: "aprovado", total: 5000 },
          resultado: "sucesso",
          prestador_id: 1,
        }
      );

      // 9. Verificar auditoria completa
      const todosAudits = auditService.obterTodos();
      expect(todosAudits.length).toBeGreaterThan(0);

      const pagantoAudits = auditService.obterTodos({
        tipo_acao: "aprovar_pagamento",
      });
      expect(pagantoAudits.length).toBeGreaterThan(0);
    });

    it("prestador não pode acessar dados de outro prestador", async () => {
      const loginResult = await authService.autenticar(
        "paulo@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(loginResult.token!);

      // Paulo tenta acessar prestador 2 (outro)
      const podeLerOutroPrestador = authService.podeLerPrestador(contexto!, 2);
      expect(podeLerOutroPrestador).toBe(false);

      // Tenta usar payment guard para submeter para outro
      const verificacao = paymentGuard.verificarDuplicacao(contexto!, 2, "2026-08");
      expect(verificacao.duplicado).toBe(true);
      expect(verificacao.motivo).toContain("outro prestador");
    });

    it("rejeição permite resubmissão", () => {
      const contexto: any = {
        usuario: usuarios_teste[2],
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };
      // Quem rejeita é o gestor, não o prestador: mudar status exige admin/gestor.
      const contextoGestor: any = {
        usuario: usuarios_teste[1],
        autenticado: true,
        role: "gestor",
      };

      // 1. Submissão inicial
      const verif1 = paymentGuard.verificarDuplicacao(contexto, 1, "2026-08");
      expect(verif1.duplicado).toBe(false);

      expect(paymentGuard.registrarPagamento(contexto, 1, "2026-08", 5000, "pendente").sucesso).toBe(true);

      // 2. Rejeição
      expect(paymentGuard.atualizarStatus(contextoGestor, 1, "2026-08", "rejeitado").sucesso).toBe(true);

      // 3. Resubmissão permitida
      const verif2 = paymentGuard.verificarDuplicacao(contexto, 1, "2026-08");
      expect(verif2.duplicado).toBe(false);
      expect(verif2.pagamentoAnterior?.status).toBe("rejeitado");

      expect(paymentGuard.registrarPagamento(contexto, 1, "2026-08", 5100, "pendente").sucesso).toBe(true);

      // 4. Segunda submissão bloqueada (novamente pendente)
      const verif3 = paymentGuard.verificarDuplicacao(contexto, 1, "2026-08");
      expect(verif3.duplicado).toBe(true);
    });
  });

  describe("Relatórios de Auditoria", () => {
    it("gera estatísticas de auditoria do período", () => {
      const contexto: any = {
        usuario: usuarios_teste[2],
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      // Registrar várias ações
      for (let i = 0; i < 3; i++) {
        auditService.registrarAcao(
          contexto,
          "atualizar_apontamento",
          "prestador_apontamento",
          `apon_${i}`,
          {
            descricao: `Atualização ${i}`,
            resultado: "sucesso",
          }
        );
      }

      auditService.registrarAcao(
        contexto,
        "criar_apontamento",
        "prestador_apontamento",
        "apon_novo",
        {
          descricao: "Novo apontamento",
          resultado: "sucesso",
        }
      );

      // Estatísticas
      const stats = auditService.obterEstatisticas(24);

      expect(stats.total_registros).toBeGreaterThan(0);
      expect(stats.usuario_mais_ativo).toBe("user_prestador_1");
      expect(stats.acao_mais_comum).toBe("atualizar_apontamento");
    });

    it("gera relatório de período", () => {
      const contexto: any = {
        usuario: usuarios_teste[2],
        autenticado: true,
        role: "prestador",
        prestador_id: 1,
      };

      const agora = new Date();
      auditService.registrarAcao(
        contexto,
        "criar_apontamento",
        "prestador_apontamento",
        "apon_1",
        { resultado: "sucesso" }
      );

      const data_inicio = new Date(agora.getTime() - 3600000);
      const data_fim = new Date(agora.getTime() + 3600000);

      const relatorio = auditService.gerarRelatorioPeriodo(data_inicio, data_fim);

      expect(relatorio.total_eventos).toBeGreaterThan(0);
      expect(relatorio.usuarios_ativos).toBeGreaterThan(0);
      expect(relatorio.acessos_negados).toBeDefined();
    });
  });
});
