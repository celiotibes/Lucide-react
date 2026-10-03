import { describe, it, expect } from "vitest";
import {
  criarRespostaErro,
  extrairMensagemErro,
  transformarErroEmResposta,
  validarSchema,
  erroValidacao,
  erroNaoEncontrado,
  erroAcessoNegado,
  erroConflito,
} from "../utils/error-helpers.js";

describe("Error Helpers", () => {
  describe("criarRespostaErro", () => {
    it("deve criar resposta de erro de validação com status 400", () => {
      const { status, resposta } = criarRespostaErro("VALIDACAO", "Dados inválidos");

      expect(status).toBe(400);
      expect(resposta.erro).toBe("VALIDACAO");
      expect(resposta.mensagem).toBe("Dados inválidos");
      expect(resposta.timestamp).toBeDefined();
    });

    it("deve criar resposta de erro não encontrado com status 404", () => {
      const { status, resposta } = criarRespostaErro("NAO_ENCONTRADO", "Recurso não existe");

      expect(status).toBe(404);
      expect(resposta.erro).toBe("NAO_ENCONTRADO");
    });

    it("deve incluir requestId quando fornecido", () => {
      const { resposta } = criarRespostaErro("ERRO_INTERNO", "Erro", undefined, "req_123");

      expect(resposta.requestId).toBe("req_123");
    });

    it("deve incluir detalhes quando fornecidos", () => {
      const detalhes = { campo: "email", problema: "duplicado" };
      const { resposta } = criarRespostaErro("VALIDACAO", "Validação falhou", detalhes);

      expect(resposta.detalhes).toEqual(detalhes);
    });
  });

  describe("extrairMensagemErro", () => {
    it("deve extrair mensagem de Error", () => {
      const erro = new Error("Algo deu errado");
      expect(extrairMensagemErro(erro)).toBe("Algo deu errado");
    });

    it("deve extrair string diretamente", () => {
      expect(extrairMensagemErro("Erro em string")).toBe("Erro em string");
    });

    it("deve extrair message de objeto", () => {
      const erro = { message: "Erro no objeto" };
      expect(extrairMensagemErro(erro)).toBe("Erro no objeto");
    });

    it("deve extrair error de objeto", () => {
      const erro = { error: "Erro no campo error" };
      expect(extrairMensagemErro(erro)).toBe("Erro no campo error");
    });

    it("deve retornar padrão para erro desconhecido", () => {
      expect(extrairMensagemErro(null)).toBe("Erro desconhecido");
      expect(extrairMensagemErro(123)).toBe("Erro desconhecido");
    });
  });

  describe("validarSchema", () => {
    it("deve validar schema com campos presentes", () => {
      const obj = { nome: "João", email: "joao@example.com" };
      const erros = validarSchema(obj, ["nome", "email"]);

      expect(erros).toHaveLength(0);
    });

    it("deve detectar campos faltando", () => {
      const obj = { nome: "João" };
      const erros = validarSchema(obj, ["nome", "email", "telefone"]);

      expect(erros).toContain("Campo obrigatório ausente: email");
      expect(erros).toContain("Campo obrigatório ausente: telefone");
    });

    it("deve rejeitar objeto inválido", () => {
      const erros1 = validarSchema(null, ["campo"]);
      expect(erros1).toContain("Objeto inválido");

      const erros2 = validarSchema("string", ["campo"]);
      expect(erros2).toContain("Objeto inválido");
    });
  });

  describe("erroValidacao", () => {
    it("deve criar erro de validação com mensagem única", () => {
      const { status, resposta } = erroValidacao(["Email inválido"]);

      expect(status).toBe(400);
      expect(resposta.erro).toBe("VALIDACAO");
      expect(resposta.mensagem).toBe("Email inválido");
    });

    it("deve criar erro de validação com múltiplas mensagens", () => {
      const mensagens = ["Email inválido", "Senha muito curta"];
      const { status, resposta } = erroValidacao(mensagens);

      expect(status).toBe(400);
      expect(resposta.mensagem).toBe("Validação falhou");
      expect(resposta.detalhes).toEqual({ erros: mensagens });
    });
  });

  describe("erroNaoEncontrado", () => {
    it("deve criar erro sem identificador", () => {
      const { status, resposta } = erroNaoEncontrado("Usuário");

      expect(status).toBe(404);
      expect(resposta.mensagem).toBe("Usuário não encontrado");
    });

    it("deve criar erro com identificador", () => {
      const { status, resposta } = erroNaoEncontrado("Usuário", "user_123");

      expect(status).toBe(404);
      expect(resposta.mensagem).toBe('Usuário com ID "user_123" não encontrado');
    });
  });

  describe("erroAcessoNegado", () => {
    it("deve criar erro com motivo padrão", () => {
      const { status, resposta } = erroAcessoNegado();

      expect(status).toBe(403);
      expect(resposta.mensagem).toBe("Acesso negado");
    });

    it("deve criar erro com motivo customizado", () => {
      const { status, resposta } = erroAcessoNegado("Usuário sem permissão");

      expect(status).toBe(403);
      expect(resposta.mensagem).toBe("Usuário sem permissão");
    });
  });

  describe("erroConflito", () => {
    it("deve criar erro de conflito", () => {
      const { status, resposta } = erroConflito("Email já existe");

      expect(status).toBe(409);
      expect(resposta.erro).toBe("CONFLITO");
      expect(resposta.mensagem).toBe("Email já existe");
    });
  });

  describe("transformarErroEmResposta", () => {
    it("deve transformar Error genérico em resposta", () => {
      const erro = new Error("Algo falhou");
      const { status, resposta } = transformarErroEmResposta(erro, "test_context", false);

      expect(status).toBe(500);
      expect(resposta.erro).toBe("ERRO_INTERNO");
    });

    it("deve não expor detalhes em produção", () => {
      const erro = new Error("Detalhes sensíveis");
      const { resposta } = transformarErroEmResposta(erro, "test_context", false);

      expect(resposta.detalhes).toBeUndefined();
    });

    it("deve expor detalhes em desenvolvimento", () => {
      const erro = new Error("Detalhes sensíveis");
      const { resposta } = transformarErroEmResposta(erro, "test_context", true);

      expect(resposta.detalhes).toBeDefined();
    });
  });
});
