/**
 * Database-backed Authentication Service (Phase 2)
 * Persists users, sessions, and credentials to database
 *
 * Replaces in-memory AuthService with database persistence
 * Uses prepared statements to prevent SQL injection
 */

import type Database from "better-sqlite3";
import { logger } from '../../services/logger-service.js';
import { randomUUID } from "crypto";
import {
  ContextoAutenticacao,
  UserRole,
  Usuario,
  PermissaoOperacao,
  PERMISSOES_POR_ROLE,
  temPermissao as temPermissaoPura,
  podeAcessarPrestador,
  podeAprovarPagamentoPrestador,
} from "./auth-service";
import { gerarHashSenha, verificarSenha, verificarContraDummy } from "./password";
import { gerarTokenSessao, tokenTemAssinaturaValida } from "./token";

// Re-export types from original service
export type { ContextoAutenticacao, UserRole, Usuario, PermissaoOperacao };
export { PERMISSOES_POR_ROLE };

/** Erro interno usado só para sair de dentro da transação de bootstrapTitular
 * quando já existe um titular — nunca escapa da classe, sempre convertido
 * numa resposta { sucesso: false, erro } antes de retornar ao chamador. */
class ErroBootstrapJaUtilizado extends Error {}

export interface ResultadoAutenticacao {
  sucesso: boolean;
  token?: string;
  usuario?: Usuario;
  erro?: string;
  /** Motivo detalhado, só para uso interno (auditoria/log) — NUNCA deve ser
   * devolvido na resposta HTTP ao chamador: expor a diferença entre
   * "usuário não existe" e "senha errada" permite enumerar quais e-mails
   * têm conta no sistema. */
  motivoInterno?:
    | "bloqueado_por_tentativas"
    | "usuario_nao_encontrado"
    | "usuario_inativo"
    | "senha_invalida"
    | "erro_interno";
  /** Preenchido só quando um usuário com este e-mail de fato existe (senha
   * errada ou conta inativa) — nunca em "não encontrado" nem "bloqueado".
   * Uso exclusivo de quem for gravar a trilha de auditoria com o usuario_id
   * certo em vez de null; nunca deve ir para a resposta HTTP (o cliente não
   * pode aprender, por essa via, que o e-mail existe). */
  usuarioParaAuditoria?: Usuario;
}

/**
 * Database-backed Authentication Service
 * Phase 2/Fase 1: Persistent storage with real scrypt password hashing and
 * signed session tokens (ver password.ts e token.ts para as escolhas).
 */
export class AuthServiceDB {
  private db: Database.Database;
  private tentativasFalhas: Map<string, number> = new Map(); // Still use memory for brute force within session

  constructor(database: Database.Database) {
    this.db = database;
  }

  /**
   * Autentica um usuário com email e senha.
   *
   * Sempre roda uma verificação de hash (real ou contra um valor dummy)
   * antes de responder — mesmo quando o e-mail não existe ou o usuário está
   * inativo — para o tempo de resposta não distinguir "e-mail inexistente"
   * de "e-mail existe, senha errada" (mitiga enumeração de usuários por
   * timing). A mensagem de erro devolvida (`erro`) é sempre a mesma
   * genérica; `motivoInterno` carrega o detalhe só para quem for auditar.
   */
  async autenticar(
    email: string,
    senha: string,
    opcoes?: { enderecoIp?: string; userAgent?: string },
  ): Promise<ResultadoAutenticacao> {
    const ERRO_GENERICO = "Email ou senha inválidos";

    // Proteção contra brute force (contador em memória, por processo).
    // Isto é complementar ao rate limit por IP aplicado na rota HTTP —
    // este aqui pune tentativas repetidas contra o MESMO e-mail, mesmo que
    // vindas de IPs diferentes; o rate limit da rota pune volume por IP.
    const tentativas = this.tentativasFalhas.get(email) || 0;
    if (tentativas >= 5) {
      return {
        sucesso: false,
        erro: "Muitas tentativas falhadas. Tente novamente em 15 minutos.",
        motivoInterno: "bloqueado_por_tentativas",
      };
    }

    try {
      const stmt = this.db.prepare(
        "SELECT id, nome, email, senha_hash, role, prestador_id, ativo FROM usuarios WHERE email = ?",
      );
      const usuarioRow = stmt.get(email) as
        | {
            id: string;
            nome: string;
            email: string;
            senha_hash: string;
            role: UserRole;
            prestador_id: number | null;
            ativo: number | boolean;
          }
        | undefined;

      const paraUsuario = (): Usuario => ({
        id: usuarioRow!.id,
        nome: usuarioRow!.nome,
        email: usuarioRow!.email,
        role: usuarioRow!.role,
        prestador_id: usuarioRow!.prestador_id ?? undefined,
        ativo: !!usuarioRow!.ativo,
        data_criacao: "",
      });

      if (!usuarioRow || !usuarioRow.ativo) {
        // Sem usuário (ou inativo): gasta o mesmo custo de CPU de uma
        // verificação real, contra um hash dummy, para não vazar por
        // timing que este e-mail não tem conta ativa.
        await verificarContraDummy(senha);
        this.tentativasFalhas.set(email, tentativas + 1);
        return {
          sucesso: false,
          erro: ERRO_GENERICO,
          motivoInterno: !usuarioRow ? "usuario_nao_encontrado" : "usuario_inativo",
          usuarioParaAuditoria: usuarioRow ? paraUsuario() : undefined,
        };
      }

      const senhaValida = await verificarSenha(senha, usuarioRow.senha_hash);
      if (!senhaValida) {
        this.tentativasFalhas.set(email, tentativas + 1);
        return {
          sucesso: false,
          usuarioParaAuditoria: paraUsuario(),
          erro: ERRO_GENERICO,
          motivoInterno: "senha_invalida",
        };
      }

      const token = gerarTokenSessao();

      const data_expiracao = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 horas
      const insertSession = this.db.prepare(
        `INSERT INTO sessoes (token, usuario_id, data_expiracao, ativo, endereco_ip, user_agent)
         VALUES (?, ?, ?, ?, ?, ?)`,
      );
      // better-sqlite3 só aceita number, string, bigint, buffer ou null como
      // parâmetro vinculado — um boolean JS (true/false) lança
      // "SQLite3 can only bind numbers, strings, bigints, buffers, and null".
      // A coluna "ativo" é INTEGER/BOOLEAN por convenção SQLite (0/1).
      insertSession.run(
        token,
        usuarioRow.id,
        data_expiracao.toISOString(),
        1,
        opcoes?.enderecoIp ?? null,
        opcoes?.userAgent ?? null,
      );

      const updateLogin = this.db.prepare(
        "UPDATE usuarios SET ultimo_login = CURRENT_TIMESTAMP WHERE id = ?",
      );
      updateLogin.run(usuarioRow.id);

      this.tentativasFalhas.delete(email);

      return { sucesso: true, token, usuario: paraUsuario() };
    } catch (erro) {
      return {
        sucesso: false,
        erro: erro instanceof Error ? erro.message : "Erro ao autenticar",
        motivoInterno: "erro_interno",
      };
    }
  }

  /**
   * Valida um token de sessão. Primeiro confere a assinatura HMAC (barato,
   * sem tocar o banco — rejeita token forjado/corrompido de cara); só faz a
   * consulta ao banco se a assinatura bater.
   */
  validarToken(token: string): ContextoAutenticacao | null {
    if (!tokenTemAssinaturaValida(token)) {
      return null;
    }
    try {
      const stmt = this.db.prepare(
        `SELECT s.usuario_id, u.nome, u.email, u.role, u.prestador_id, u.ativo,
                CURRENT_TIMESTAMP < s.data_expiracao as valida
         FROM sessoes s
         JOIN usuarios u ON s.usuario_id = u.id
         WHERE s.token = ? AND s.ativo = true`
      );
      const sessao = stmt.get(token) as unknown;

      if (!sessao || !sessao.valida) {
        return null;
      }

      const usuario: Usuario = {
        id: sessao.usuario_id,
        nome: sessao.nome,
        email: sessao.email,
        role: sessao.role,
        prestador_id: sessao.prestador_id,
        ativo: sessao.ativo,
        data_criacao: "", // Não necessário para validação
      };

      return {
        usuario,
        autenticado: true,
        role: sessao.role,
        prestador_id: sessao.prestador_id,
        token,
      };
    } catch {
      return null;
    }
  }

  /**
   * Verifica se um usuário tem permissão para uma operação
   */
  temPermissao(
    contexto: ContextoAutenticacao,
    recurso: string,
    operacao: "criar" | "ler" | "atualizar" | "deletar" | "aprovar"
  ): boolean {
    return temPermissaoPura(contexto, recurso, operacao);
  }

  /**
   * Verifica se o usuário pode acessar dados de um prestador específico
   */
  podeLerPrestador(contexto: ContextoAutenticacao, prestador_id: number): boolean {
    return podeAcessarPrestador(contexto, prestador_id);
  }

  /**
   * Verifica se o usuário pode modificar apontamentos de um prestador
   */
  podeModificarApontamentos(
    contexto: ContextoAutenticacao,
    prestador_id: number
  ): boolean {
    return podeAcessarPrestador(contexto, prestador_id);
  }

  /**
   * Verifica se o usuário pode aprovar pagamentos
   */
  podeAprovarPagamento(contexto: ContextoAutenticacao): boolean {
    return podeAprovarPagamentoPrestador(contexto);
  }

  /**
   * Logout - invalida a sessão
   */
  logout(token: string): void {
    try {
      const stmt = this.db.prepare("UPDATE sessoes SET ativo = false WHERE token = ?");
      stmt.run(token);
    } catch (erro) {
      logger.error("Erro ao fazer logout:", erro);
    }
  }

  /**
   * Cria um novo usuário (exige permissão "usuario:criar" no contexto de
   * quem está chamando — hoje `titular`/`administrador`, ver
   * PERMISSOES_POR_ROLE). Recebe a senha em texto puro e grava só o hash
   * (nunca loga nem devolve a senha ou o hash completo).
   *
   * NOTA (próximo passo, não implementado): não existe hoje coluna/tabela
   * para marcar "precisa trocar a senha no primeiro login" — o desenho
   * atual (`usuarios.senha_hash`) não suporta isso sem uma mudança de
   * schema, fora do escopo desta rodada (ver `POST /api/auth/usuarios` em
   * auth-routes.ts e o relatório desta tarefa).
   */
  async criarUsuario(
    novo_usuario: Omit<Usuario, "id" | "data_criacao"> & { senha: string },
    contexto: ContextoAutenticacao
  ): Promise<{ sucesso: boolean; usuario?: Usuario; erro?: string }> {
    if (!temPermissaoPura(contexto, "usuario", "criar")) {
      return {
        sucesso: false,
        erro: "Sem permissão para criar usuários",
      };
    }

    try {
      const usuario_id = `user_${randomUUID()}`;
      const senha_hash = await gerarHashSenha(novo_usuario.senha);

      const stmt = this.db.prepare(
        `INSERT INTO usuarios (id, nome, email, senha_hash, role, prestador_id, ativo, data_criacao)
         VALUES (?, ?, ?, ?, ?, ?, true, CURRENT_TIMESTAMP)`
      );

      stmt.run(
        usuario_id,
        novo_usuario.nome,
        novo_usuario.email,
        senha_hash,
        novo_usuario.role,
        novo_usuario.prestador_id ?? null
      );

      return {
        sucesso: true,
        usuario: {
          id: usuario_id,
          nome: novo_usuario.nome,
          email: novo_usuario.email,
          role: novo_usuario.role,
          prestador_id: novo_usuario.prestador_id,
          ativo: novo_usuario.ativo,
          data_criacao: new Date().toISOString(),
        },
      };
    } catch (erro) {
      if (erro instanceof Error && erro.message.includes("UNIQUE constraint failed")) {
        return { sucesso: false, erro: "Já existe um usuário com este e-mail" };
      }
      return {
        sucesso: false,
        erro: erro instanceof Error ? erro.message : "Erro ao criar usuário",
      };
    }
  }

  /**
   * Bootstrap do primeiro usuário `titular`.
   *
   * Só funciona enquanto não existir NENHUM usuário com role='titular' no
   * banco — depois disso trava (403), de propósito: é a porta de entrada
   * da primeira instalação, não uma rota geral de "criar admin" que
   * ficaria aberta para sempre. A checagem e o INSERT rodam dentro de uma
   * transação (`db.transaction`) para não abrir uma janela de corrida onde
   * duas chamadas concorrentes na primeira instalação criassem dois
   * titulares — o better-sqlite3 serializa as transações, então a segunda
   * chamada só enxerga a contagem depois da primeira ter commitado.
   */
  async bootstrapTitular(dados: {
    nome: string;
    email: string;
    senha: string;
  }): Promise<{ sucesso: boolean; usuario?: Usuario; erro?: string }> {
    if (!dados.nome || !dados.email || !dados.senha) {
      return { sucesso: false, erro: "nome, email e senha são obrigatórios" };
    }
    if (dados.senha.length < 8) {
      return { sucesso: false, erro: "Senha precisa ter pelo menos 8 caracteres" };
    }

    // scrypt roda ANTES da transação: é uma operação assíncrona (Promise),
    // e uma transação do better-sqlite3 precisa ser síncrona do início ao
    // fim (ela prende a conexão inteira enquanto roda) — misturar await lá
    // dentro quebraria essa garantia.
    const senha_hash = await gerarHashSenha(dados.senha);
    const usuario_id = `user_${randomUUID()}`;

    try {
      const executar = this.db.transaction(() => {
        const jaExisteTitular = this.db
          .prepare("SELECT COUNT(*) as count FROM usuarios WHERE role = 'titular'")
          .get() as { count: number };

        if (jaExisteTitular.count > 0) {
          throw new ErroBootstrapJaUtilizado();
        }

        this.db
          .prepare(
            `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
             VALUES (?, ?, ?, ?, 'titular', true, CURRENT_TIMESTAMP)`,
          )
          .run(usuario_id, dados.nome, dados.email, senha_hash);
      });

      executar();

      return {
        sucesso: true,
        usuario: {
          id: usuario_id,
          nome: dados.nome,
          email: dados.email,
          role: "titular",
          ativo: true,
          data_criacao: new Date().toISOString(),
        },
      };
    } catch (erro) {
      if (erro instanceof ErroBootstrapJaUtilizado) {
        return {
          sucesso: false,
          erro: "Bootstrap já foi utilizado — já existe um usuário titular. Peça para um titular existente criar sua conta.",
        };
      }
      if (erro instanceof Error && erro.message.includes("UNIQUE constraint failed")) {
        return { sucesso: false, erro: "Já existe um usuário com este e-mail" };
      }
      return {
        sucesso: false,
        erro: erro instanceof Error ? erro.message : "Erro ao criar titular inicial",
      };
    }
  }

  /** Busca um usuário autenticado por id — usado por GET /api/auth/me depois
   * que o middleware já validou o token; nunca devolve senha_hash. */
  obterUsuarioPorId(usuario_id: string): Usuario | null {
    try {
      const stmt = this.db.prepare(
        "SELECT id, nome, email, role, prestador_id, ativo, data_criacao, ultimo_login FROM usuarios WHERE id = ?",
      );
      const row = stmt.get(usuario_id) as Usuario | undefined;
      return row ?? null;
    } catch {
      return null;
    }
  }

  /**
   * Retorna todos os usuários (exige permissão "usuario:ler" — hoje nenhum
   * papel tem essa entrada em PERMISSOES_POR_ROLE, então este método sempre
   * devolve lista vazia; comportamento herdado de antes desta fase, não
   * introduzido aqui, e não exposto por nenhuma rota HTTP).
   */
  obterUsuarios(contexto: ContextoAutenticacao): Usuario[] {
    if (!this.temPermissao(contexto, "usuario", "ler")) {
      return [];
    }

    try {
      const stmt = this.db.prepare(
        "SELECT id, nome, email, role, prestador_id, ativo, data_criacao FROM usuarios"
      );
      const usuarios = stmt.all() as Usuario[];
      return usuarios;
    } catch (erro) {
      logger.error("Erro ao obter usuários:", erro);
      return [];
    }
  }

  /**
   * Limpa sessões expiradas (pode ser chamado periodicamente)
   */
  limparSessoesExpiradas(): number {
    try {
      const stmt = this.db.prepare(
        "DELETE FROM sessoes WHERE data_expiracao < CURRENT_TIMESTAMP"
      );
      const result = stmt.run();
      return result.changes;
    } catch (erro) {
      logger.error("Erro ao limpar sessões:", erro);
      return 0;
    }
  }
}
