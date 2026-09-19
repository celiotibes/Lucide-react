import { describe, it, expect, beforeEach } from "vitest";
import { AuthService, Usuario } from "../auth-service";
import { AuditTrailService } from "../audit-trail";
import { PermissionGuard } from "../permission-guard";
import bcryptjs from "bcryptjs";

describe("Authentication & Authorization (P1.4)", () => {
  let authService: AuthService;
  let auditService: AuditTrailService;
  let guard: PermissionGuard;
  let usuarios_teste: Usuario[];

  beforeEach(async () => {
    authService = new AuthService();
    auditService = new AuditTrailService();
    guard = new PermissionGuard(authService, auditService);

    // C-1: Generate bcrypt hashes for test users
    const senhaHash = await AuthService.gerarHashSenha("senha123");

    usuarios_teste = [
      {
        id: "user_admin_1",
        nome: "Admin User",
        email: "admin@example.com",
        role: "admin",
        ativo: true,
        data_criacao: "2026-01-01",
        senha_hash: senhaHash,
      },
      {
        id: "user_gestor_1",
        nome: "Gestor User",
        email: "gestor@example.com",
        role: "gestor",
        ativo: true,
        data_criacao: "2026-01-01",
        senha_hash: senhaHash,
      },
      {
        id: "user_prestador_1",
        nome: "Paulo Bruxel",
        email: "paulo@example.com",
        role: "prestador",
        prestador_id: 1,
        ativo: true,
        data_criacao: "2026-01-01",
        senha_hash: senhaHash,
      },
    ];
  });

  describe("Authentication", () => {
    it("autentica usuário com email e senha válidos", async () => {
      const resultado = await authService.autenticar(
        "admin@example.com",
        "senha123",
        usuarios_teste
      );

      expect(resultado.sucesso).toBe(true);
      expect(resultado.token).toBeDefined();
      expect(resultado.erro).toBeUndefined();
    });

    it("rejeita email inválido", async () => {
      const resultado = await authService.autenticar(
        "invalido@example.com",
        "senha123",
        usuarios_teste
      );

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Email ou senha");
    });

    it("rejeita senha vazia", async () => {
      const resultado = await authService.autenticar(
        "admin@example.com",
        "",
        usuarios_teste
      );

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Email ou senha");
    });

    it("protege contra brute force após 5 tentativas", async () => {
      const email = "admin@example.com";

      // 5 tentativas falhadas
      for (let i = 0; i < 5; i++) {
        await authService.autenticar(email, "senha_errada", usuarios_teste);
      }

      // 6ª tentativa com senha correta também falha
      const resultado = await authService.autenticar(
        email,
        "senha123",
        usuarios_teste
      );

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Muitas tentativas");
    });

    it("C-2: Valida token JWT após autenticação", async () => {
      const resultado = await authService.autenticar(
        "admin@example.com",
        "senha123",
        usuarios_teste
      );

      expect(resultado.token).toBeDefined();

      const contexto = authService.validarToken(resultado.token!);

      expect(contexto).toBeDefined();
      expect(contexto?.usuario?.email).toBe("admin@example.com");
      expect(contexto?.autenticado).toBe(true);
    });

    it("C-2: Invalida token JWT após logout", async () => {
      const resultado = await authService.autenticar(
        "admin@example.com",
        "senha123",
        usuarios_teste
      );

      const token = resultado.token!;
      authService.logout(token);

      const contexto = authService.validarToken(token);
      expect(contexto).toBeNull();
    });

    it("C-1: Rejeita senha incorreta mesmo com bcrypt", async () => {
      const resultado = await authService.autenticar(
        "admin@example.com",
        "senha_incorreta",
        usuarios_teste
      );

      expect(resultado.sucesso).toBe(false);
      expect(resultado.erro).toContain("Email ou senha");
    });
  });

  describe("Authorization - Permissões por Role", () => {
    it("admin tem acesso a todas as operações", async () => {
      const resultado = await authService.autenticar(
        "admin@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      expect(authService.temPermissao(contexto!, "prestador_contrato", "criar")).toBe(true);
      expect(authService.temPermissao(contexto!, "prestador_contrato", "atualizar")).toBe(true);
      expect(authService.temPermissao(contexto!, "prestador_pagamento", "aprovar")).toBe(true);
      expect(authService.temPermissao(contexto!, "usuario", "criar")).toBe(true);
    });

    it("gestor pode ler e aprovar mas não criar contratos", async () => {
      const resultado = await authService.autenticar(
        "gestor@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      expect(authService.temPermissao(contexto!, "prestador_contrato", "ler")).toBe(true);
      expect(authService.temPermissao(contexto!, "prestador_contrato", "criar")).toBe(false);
      expect(authService.temPermissao(contexto!, "prestador_pagamento", "aprovar")).toBe(true);
      expect(authService.temPermissao(contexto!, "usuario", "criar")).toBe(false);
    });

    it("prestador pode criar apontamentos mas não aprovar pagamentos", async () => {
      const resultado = await authService.autenticar(
        "paulo@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      expect(authService.temPermissao(contexto!, "prestador_apontamento", "criar")).toBe(true);
      expect(authService.temPermissao(contexto!, "prestador_apontamento", "ler")).toBe(true);
      expect(authService.temPermissao(contexto!, "prestador_pagamento", "aprovar")).toBe(false);
      expect(authService.temPermissao(contexto!, "usuario", "criar")).toBe(false);
    });
  });

  describe("Data Access Control", () => {
    it("prestador só acessa seus próprios dados", async () => {
      const resultado = await authService.autenticar(
        "paulo@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      // Pode acessar seus próprios dados (prestador_id = 1)
      expect(authService.podeLerPrestador(contexto!, 1)).toBe(true);

      // Não pode acessar dados de outro prestador
      expect(authService.podeLerPrestador(contexto!, 2)).toBe(false);
    });

    it("gestor acessa dados de qualquer prestador", async () => {
      const resultado = await authService.autenticar(
        "gestor@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      expect(authService.podeLerPrestador(contexto!, 1)).toBe(true);
      expect(authService.podeLerPrestador(contexto!, 2)).toBe(true);
    });

    it("admin acessa dados de qualquer prestador", async () => {
      const resultado = await authService.autenticar(
        "admin@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      expect(authService.podeLerPrestador(contexto!, 1)).toBe(true);
      expect(authService.podeLerPrestador(contexto!, 99)).toBe(true);
    });

    it("prestador não pode modificar apontamentos de outro", async () => {
      const resultado = await authService.autenticar(
        "paulo@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      // Pode modificar seus próprios
      expect(authService.podeModificarApontamentos(contexto!, 1)).toBe(true);

      // Não pode modificar de outro
      expect(authService.podeModificarApontamentos(contexto!, 2)).toBe(false);
    });
  });

  describe("Approval Permissions", () => {
    it("apenas gestor e admin podem aprovar", async () => {
      const admin_result = await authService.autenticar(
        "admin@example.com",
        "senha123",
        usuarios_teste
      );
      const admin_ctx = authService.validarToken(admin_result.token!);

      const gestor_result = await authService.autenticar(
        "gestor@example.com",
        "senha123",
        usuarios_teste
      );
      const gestor_ctx = authService.validarToken(gestor_result.token!);

      const paulo_result = await authService.autenticar(
        "paulo@example.com",
        "senha123",
        usuarios_teste
      );
      const paulo_ctx = authService.validarToken(paulo_result.token!);

      expect(authService.podeAprovarPagamento(admin_ctx!)).toBe(true);
      expect(authService.podeAprovarPagamento(gestor_ctx!)).toBe(true);
      expect(authService.podeAprovarPagamento(paulo_ctx!)).toBe(false);
    });
  });

  describe("Audit Trail Integration", () => {
    it("registra acesso negado quando sem permissão", async () => {
      const resultado = await authService.autenticar(
        "paulo@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      guard.verificarPermissao(contexto!, "usuario", "criar");

      const registros = auditService.obterTodos({ resultado: "negado" });

      expect(registros.length).toBeGreaterThan(0);
      expect(registros[registros.length - 1].usuario_id).toBe("user_prestador_1");
    });

    it("registra ações bem-sucedidas com auditoria", async () => {
      const resultado = await authService.autenticar(
        "admin@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      auditService.registrarAcao(
        contexto,
        "criar_apontamento",
        "prestador_apontamento",
        "apon_123",
        {
          descricao: "Apontamento criado",
          valores_novos: { data: "2026-09-19", horas: 8 },
        }
      );

      const registros = auditService.obterHistoricoUsuario("user_admin_1");

      expect(registros.length).toBeGreaterThan(0);
      expect(registros[registros.length - 1].tipo_acao).toBe("criar_apontamento");
    });

    it("calcula estatísticas de auditoria", async () => {
      const resultado = await authService.autenticar(
        "admin@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      // Simular algumas ações
      for (let i = 0; i < 3; i++) {
        auditService.registrarAcao(
          contexto,
          "atualizar_apontamento",
          "prestador_apontamento",
          `apon_${i}`,
          { resultado: "sucesso" }
        );
      }

      const stats = auditService.obterEstatisticas(24);

      expect(stats.total_registros).toBeGreaterThan(0);
      expect(stats.acao_mais_comum).toBe("atualizar_apontamento");
    });
  });

  describe("Permission Guard", () => {
    it("bloqueia operação sem autenticação", () => {
      const resultado = guard.verificarPermissao(
        { usuario: null, autenticado: false },
        "prestador_apontamento",
        "criar"
      );

      expect(resultado.permitido).toBe(false);
      expect(resultado.motivo).toContain("autenticado");
    });

    it("permite operação com permissão adequada", async () => {
      const auth_result = await authService.autenticar(
        "admin@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(auth_result.token!);

      const resultado = guard.verificarPermissao(
        contexto!,
        "prestador_contrato",
        "criar"
      );

      expect(resultado.permitido).toBe(true);
    });

    it("valida acesso a prestador específico", async () => {
      const resultado = await authService.autenticar(
        "paulo@example.com",
        "senha123",
        usuarios_teste
      );

      const contexto = authService.validarToken(resultado.token!);

      const seu_prestador = guard.validarAcessoPrestador(contexto!, 1);
      expect(seu_prestador.permitido).toBe(true);

      const outro_prestador = guard.validarAcessoPrestador(contexto!, 2);
      expect(outro_prestador.permitido).toBe(false);
    });
  });
});
