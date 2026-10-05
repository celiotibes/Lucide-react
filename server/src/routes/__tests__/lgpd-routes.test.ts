/**
 * Testes para rotas LGPD — direitos do titular de dados
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AuthServiceDB } from '../../domain/auth/auth-service-db';
import { AuditTrailServiceDB } from '../../domain/auth/audit-trail-db';
import { gerarHashSenha } from '../../domain/auth/password';
import { criarRotasAuth } from '../auth-routes';
import { criarRotasLgpd } from '../lgpd-routes';
import { tokenDoCookie } from './token-cookie';

// Mock types for auth route dependencies
interface MockPermissoesService {
  listarMatriz: () => unknown[];
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const TEST_DB_PATH = path.join(__dirname, `test-lgpd-routes-${process.pid}.db`);
const SENHA_PADRAO = 'senha-correta-123';

function resolverSchema(nomeArquivo: string): string {
  const candidatos = [
    path.join(__dirname, `../../../${nomeArquivo}`),
    path.join(process.cwd(), `server/src/${nomeArquivo}`),
    path.join(process.cwd(), `src/${nomeArquivo}`),
  ];
  const encontrado = candidatos.find((p) => fs.existsSync(p));
  if (!encontrado) {
    throw new Error(`Schema não encontrado: ${nomeArquivo} (tentei ${candidatos.join(', ')})`);
  }
  return fs.readFileSync(encontrado, 'utf-8');
}

function createTestDatabase(): Database.Database {
  if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
  const db = new Database(TEST_DB_PATH);
  db.pragma('foreign_keys = ON');
  db.exec(resolverSchema('migrations-phase2-auth.sql'));
  return db;
}

async function criarAppDeTeste(db: Database.Database) {
  const app = express();
  app.use(express.json());
  app.use(
    '/api/auth',
    criarRotasAuth({
      authService,
      auditService,
      permissoesService: { listarMatriz: () => [] } as MockPermissoesService,
    })
  );
  app.use('/api/lgpd', criarRotasLgpd({ authService, auditService, db }));
  return { app, authService, auditService };
}

async function login(app: express.Express, email: string): Promise<string> {
  const resp = await request(app)
    .post('/api/auth/login')
    .send({ email, senha: SENHA_PADRAO });
  expect(resp.status).toBe(200);
  return tokenDoCookie(resp);
}

describe('Rotas LGPD (/api/lgpd)', () => {
  let db: Database.Database;
  let app: express.Express;
  let authService: AuthServiceDB;
  let auditService: AuditTrailServiceDB;

  beforeEach(async () => {
    db = createTestDatabase();
    const hash = await gerarHashSenha(SENHA_PADRAO);

    // Inserir usuários para teste
    const stmt = db.prepare(
      `INSERT INTO usuarios (id, nome, email, senha_hash, role, ativo, data_criacao)
       VALUES (?, ?, ?, ?, ?, true, '2026-01-01')`
    );
    stmt.run('user_titular_1', 'Titular Um', 'titular1@example.com', hash, 'titular');
    stmt.run('user_titular_2', 'Titular Dois', 'titular2@example.com', hash, 'titular');
    stmt.run('user_inquilino', 'Inquilino Teste', 'inquilino@example.com', hash, 'inquilino');

    ({ app, authService, auditService } = await criarAppDeTeste(db));
  });

  afterEach(() => {
    db.close();
    if (fs.existsSync(TEST_DB_PATH)) fs.unlinkSync(TEST_DB_PATH);
    vi.restoreAllMocks();
  });

  describe('GET /meus-dados', () => {
    it('rejeita sem sessão (401)', async () => {
      const resp = await request(app).get('/api/lgpd/meus-dados');
      expect(resp.status).toBe(401);
    });

    it('retorna dados do usuário: id, nome, email, role, ativo, data_criacao, ultimo_login', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .get('/api/lgpd/meus-dados')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body).toHaveProperty('usuario');
      expect(resp.body.usuario).toMatchObject({
        id: 'user_titular_1',
        nome: 'Titular Um',
        email: 'titular1@example.com',
        role: 'titular',
        ativo: 1, // SQLite: true = 1
      });
      expect(resp.body.usuario).toHaveProperty('data_criacao');
      expect(resp.body.usuario).toHaveProperty('ultimo_login');
      // NUNCA deve incluir senha_hash
      expect(resp.body.usuario).not.toHaveProperty('senha_hash');
    });

    it('NÃO inclui senha_hash na resposta', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .get('/api/lgpd/meus-dados')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.usuario).not.toHaveProperty('senha_hash');
    });

    it('inclui sessões ativas (sem token)', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .get('/api/lgpd/meus-dados')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body).toHaveProperty('sessoes_ativas');
      expect(Array.isArray(resp.body.sessoes_ativas)).toBe(true);
      // Não deve ter campo 'token' nas sessões
      resp.body.sessoes_ativas.forEach((s: Record<string, unknown>) => {
        expect(s).not.toHaveProperty('token');
      });
    });

    it('inclui últimas ações de auditoria', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .get('/api/lgpd/meus-dados')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body).toHaveProperty('acessos_recentes');
      expect(Array.isArray(resp.body.acessos_recentes)).toBe(true);
    });

    it('registra acesso na auditoria', async () => {
      const token = await login(app, 'titular1@example.com');
      await request(app)
        .get('/api/lgpd/meus-dados')
        .set('Cookie', `session_token=${token}`);

      const auditStmt = db.prepare(
        `SELECT * FROM auditoria WHERE usuario_id = ? AND tipo_acao = 'lgpd_acesso_dados'
         ORDER BY timestamp DESC LIMIT 1`
      );
      const audit = auditStmt.get('user_titular_1') as { descricao: string; resultado: string } | undefined;
      expect(audit).toBeDefined();
      expect(audit!.descricao).toContain('LGPD Art. 18');
      expect(audit!.resultado).toBe('sucesso');

      // Um acesso BEM-SUCEDIDO não pode poluir a trilha de segurança com "acesso_negado".
      const falsos = db.prepare(`SELECT COUNT(*) AS n FROM auditoria WHERE usuario_id = ? AND tipo_acao = 'acesso_negado'`).get('user_titular_1') as { n: number };
      expect(falsos.n).toBe(0);
    });

    it('permite usuário com papel externo (inquilino)', async () => {
      const token = await login(app, 'inquilino@example.com');
      const resp = await request(app)
        .get('/api/lgpd/meus-dados')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.usuario.email).toBe('inquilino@example.com');
    });

    it('um usuário não vê dados de outro', async () => {
      const token1 = await login(app, 'titular1@example.com');
      // Mesmo que tentássemos enviar outro ID na URL (não temos), a rota
      // sempre usa o usuário autenticado do token
      const resp = await request(app)
        .get('/api/lgpd/meus-dados')
        .set('Cookie', `session_token=${token1}`);

      expect(resp.status).toBe(200);
      expect(resp.body.usuario.email).toBe('titular1@example.com');
    });
  });

  describe('GET /acessos', () => {
    it('rejeita sem sessão (401)', async () => {
      const resp = await request(app).get('/api/lgpd/acessos');
      expect(resp.status).toBe(401);
    });

    it('retorna trilha de auditoria com limite padrão 100', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .get('/api/lgpd/acessos')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body).toHaveProperty('acessos');
      expect(resp.body).toHaveProperty('total');
      expect(resp.body).toHaveProperty('limite');
      expect(resp.body.limite).toBe(100);
    });

    it('aceita limite válido na query string', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .get('/api/lgpd/acessos?limite=50')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.limite).toBe(50);
    });

    it('respeita máximo de 500 para limite', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .get('/api/lgpd/acessos?limite=999')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(200);
      expect(resp.body.limite).toBe(500);
    });

    it('rejeita limite inválido (400)', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .get('/api/lgpd/acessos?limite=abc')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(400);
      expect(resp.body).toHaveProperty('erro');
    });

    it('rejeita limite negativo (400)', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .get('/api/lgpd/acessos?limite=-10')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(400);
    });

    it('permite usuário com papel externo', async () => {
      const token = await login(app, 'inquilino@example.com');
      const resp = await request(app)
        .get('/api/lgpd/acessos')
        .set('Cookie', `session_token=${token}`);

      expect(resp.status).toBe(200);
    });
  });

  describe('POST /deletar-conta', () => {
    it('rejeita sem sessão (401)', async () => {
      const resp = await request(app)
        .post('/api/lgpd/deletar-conta')
        .send({ senha: SENHA_PADRAO, confirmacao: 'EXCLUIR' });

      expect(resp.status).toBe(401);
    });

    it('rejeita sem senha no corpo (400)', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ confirmacao: 'EXCLUIR' });

      expect(resp.status).toBe(400);
    });

    it('rejeita confirmação incorreta (400)', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: SENHA_PADRAO, confirmacao: 'SIM' });

      expect(resp.status).toBe(400);
      expect(resp.body.erro).toContain('EXCLUIR');
    });

    it('rejeita senha errada (403) e registra acesso_negado', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: 'senha-errada', confirmacao: 'EXCLUIR' });

      expect(resp.status).toBe(403);
      expect(resp.body.erro).toContain('Senha incorreta');

      // Verifica que foi registrado acesso_negado
      const auditStmt = db.prepare(
        `SELECT * FROM auditoria WHERE usuario_id = ? AND tipo_acao = 'acesso_negado'
         ORDER BY timestamp DESC LIMIT 1`
      );
      const audit = auditStmt.get('user_titular_1') as { resultado: string } | undefined;
      expect(audit).toBeDefined();
      expect(audit!.resultado).toBe('negado');
    });

    it('não anonimiza com senha errada', async () => {
      const token = await login(app, 'titular1@example.com');
      await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: 'senha-errada', confirmacao: 'EXCLUIR' });

      const usuarioStmt = db.prepare('SELECT nome, email FROM usuarios WHERE id = ?');
      const usuario = usuarioStmt.get('user_titular_1') as { nome: string; email: string } | undefined;
      expect(usuario?.nome).toBe('Titular Um'); // Não foi anonimizado
      expect(usuario?.email).toBe('titular1@example.com');
    });

    it('anonimiza usuário com senha correta', async () => {
      const token = await login(app, 'titular1@example.com');
      const resp = await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: SENHA_PADRAO, confirmacao: 'EXCLUIR' });

      expect(resp.status).toBe(200);

      const usuarioStmt = db.prepare('SELECT nome, email, ativo FROM usuarios WHERE id = ?');
      const usuario = usuarioStmt.get('user_titular_1') as { nome: string; email: string; ativo: number } | undefined;
      expect(usuario?.nome).toBe('Usuário removido');
      expect(usuario?.email).toBe('removido-user_titular_1@anonimizado.invalid');
      expect(usuario?.ativo).toBe(0); // false
    });

    it('revoga todas as sessões do usuário', async () => {
      const token = await login(app, 'titular1@example.com');
      // Verificar que a sessão estava ativa
      let sessoesStmt = db.prepare('SELECT COUNT(*) as count FROM sessoes WHERE usuario_id = ? AND ativo = true');
      let result = sessoesStmt.get('user_titular_1') as unknown as { count: number };
      expect(result.count).toBeGreaterThan(0);

      // Deletar conta
      await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: SENHA_PADRAO, confirmacao: 'EXCLUIR' });

      // Verificar que não há mais sessões ativas
      sessoesStmt = db.prepare('SELECT COUNT(*) as count FROM sessoes WHERE usuario_id = ? AND ativo = true');
      result = sessoesStmt.get('user_titular_1') as unknown as { count: number };
      expect(result.count).toBe(0);
    });

    it('mesma sessão passa a dar 401 após anonimização', async () => {
      const token = await login(app, 'titular1@example.com');

      // Deletar conta
      const delResp = await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: SENHA_PADRAO, confirmacao: 'EXCLUIR' });

      expect(delResp.status).toBe(200);

      // Tentar usar o mesmo token
      const meusDadosResp = await request(app)
        .get('/api/lgpd/meus-dados')
        .set('Cookie', `session_token=${token}`);

      expect(meusDadosResp.status).toBe(401);
    });

    it('mantém auditoria (guarda legal)', async () => {
      const token = await login(app, 'titular1@example.com');
      await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: SENHA_PADRAO, confirmacao: 'EXCLUIR' });

      const auditStmt = db.prepare(
        `SELECT COUNT(*) as count FROM auditoria WHERE usuario_id = ?`
      );
      const result = auditStmt.get('user_titular_1') as unknown as { count: number };
      expect(result.count).toBeGreaterThan(0);
    });

    it('rejeita se último titular ativo (409)', async () => {
      // O segundo titular ainda está ativo, então o primeiro pode ser deletado
      const token1 = await request(app)
        .post('/api/auth/login')
        .send({ email: 'titular1@example.com', senha: SENHA_PADRAO });
      const token = tokenDoCookie(token1);

      // Marcar o segundo titular como inativo
      db.prepare('UPDATE usuarios SET ativo = false WHERE id = ?').run('user_titular_2');

      const resp = await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: SENHA_PADRAO, confirmacao: 'EXCLUIR' });

      expect(resp.status).toBe(409);
      expect(resp.body.erro).toContain('último titular ativo');

      // Verifica que NÃO foi anonimizado
      const usuarioStmt = db.prepare('SELECT nome FROM usuarios WHERE id = ?');
      const usuario = usuarioStmt.get('user_titular_1') as { nome: string } | undefined;
      expect(usuario?.nome).toBe('Titular Um');
    });

    it('permite usuário com papel externo (inquilino) usar as 3 rotas', async () => {
      const token = await login(app, 'inquilino@example.com');

      // GET /meus-dados
      const meusDadosResp = await request(app)
        .get('/api/lgpd/meus-dados')
        .set('Cookie', `session_token=${token}`);
      expect(meusDadosResp.status).toBe(200);

      // GET /acessos
      const acessosResp = await request(app)
        .get('/api/lgpd/acessos')
        .set('Cookie', `session_token=${token}`);
      expect(acessosResp.status).toBe(200);

      // POST /deletar-conta
      const delResp = await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: SENHA_PADRAO, confirmacao: 'EXCLUIR' });
      expect(delResp.status).toBe(200);
    });
  });

  describe('exclusão: trilha e cookie', () => {
    it('grava lgpd_exclusao_conta, limpa os cookies e o inquilino exclui mesmo sendo o único não-titular', async () => {
      const token = await login(app, 'inquilino@example.com');
      const resp = await request(app)
        .post('/api/lgpd/deletar-conta')
        .set('Cookie', `session_token=${token}`)
        .send({ senha: SENHA_PADRAO, confirmacao: 'EXCLUIR' });

      expect(resp.status).toBe(200);
      const limpos = ([] as string[]).concat(resp.headers['set-cookie'] ?? []);
      expect(limpos.some((c) => c.startsWith('session_token=;'))).toBe(true);

      const audit = db.prepare(`SELECT resultado FROM auditoria WHERE usuario_id = ? AND tipo_acao = 'lgpd_exclusao_conta'`).get('user_inquilino') as { resultado: string } | undefined;
      expect(audit?.resultado).toBe('sucesso');

      const u = db.prepare('SELECT nome, email, ativo FROM usuarios WHERE id = ?').get('user_inquilino') as { nome: string; email: string; ativo: number };
      expect(u).toEqual({ nome: 'Usuário removido', email: 'removido-user_inquilino@anonimizado.invalid', ativo: 0 });
    });
  });
});
