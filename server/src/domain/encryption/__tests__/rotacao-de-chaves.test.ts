import { describe, it, expect, vi, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { inspect } from 'util';
import { criptografar, gerarChaveCriptografia } from '../field-level-encryption';
import {
  Chaveiro,
  carregarChaveiro,
  criptografarParaColuna,
  criptografarVersionado,
  descriptografarVersionado,
  lerEnvelope,
  ErroChaveDesconhecida,
  ErroChaveCriptografia,
} from '../chaveiro';
import { reencriptarCampos } from '../reencriptar-campos';
import { lerArgs } from '../../../scripts/rotacionar-chaves';

const b64 = () => gerarChaveCriptografia().toString('base64');

afterEach(() => vi.restoreAllMocks());

describe('chaveiro e envelope versionado', () => {
  it('round-trip com chave ativa grava kid e decifra', () => {
    const k = new Chaveiro({ a: gerarChaveCriptografia() }, 'a');
    const env = criptografarVersionado('123.456.789-09', k);
    expect(env.kid).toBe('a');
    expect(descriptografarVersionado(env, k)).toBe('123.456.789-09');
    const col = criptografarParaColuna('segredo', k);
    expect(col.startsWith('fle:a:')).toBe(true);
    expect(descriptografarVersionado(col, k)).toBe('segredo');
  });

  it('dado legado sem versão é lido com a chave legada (kid 1)', () => {
    const chave = gerarChaveCriptografia();
    const legado = criptografar('legado', chave); // sem kid
    expect(legado.kid).toBeUndefined();
    const k = carregarChaveiro({ FIELD_ENCRYPTION_KEY: chave.toString('hex') });
    expect(k.kidAtivo).toBe('1');
    expect(descriptografarVersionado(legado, k)).toBe('legado');
    expect(descriptografarVersionado(JSON.stringify(legado), k)).toBe('legado');
  });

  it('carrega de FIELD_ENCRYPTION_KEYS em JSON e em kid:base64', () => {
    const [a, b] = [b64(), b64()];
    const j = carregarChaveiro({ FIELD_ENCRYPTION_KEYS: JSON.stringify({ '1': a, '2': b }), FIELD_ENCRYPTION_ACTIVE_KID: '2' });
    const l = carregarChaveiro({ FIELD_ENCRYPTION_KEYS: `1:${a},2:${b}`, FIELD_ENCRYPTION_ACTIVE_KID: '2' });
    expect(j.kids()).toEqual(['1', '2']);
    expect(descriptografarVersionado(criptografarParaColuna('x', j), l)).toBe('x');
  });

  it('exige kid ativo existente e configuração válida', () => {
    const a = b64();
    expect(() => carregarChaveiro({})).toThrow(ErroChaveCriptografia);
    expect(() => carregarChaveiro({ FIELD_ENCRYPTION_KEYS: `1:${a}` })).toThrow(/ACTIVE_KID/);
    expect(() => carregarChaveiro({ FIELD_ENCRYPTION_KEYS: `1:${a}`, FIELD_ENCRYPTION_ACTIVE_KID: '9' })).toThrow(/não está/);
  });

  it('kid desconhecido falha fechado sem vazar chave', () => {
    const antiga = gerarChaveCriptografia();
    const nova = gerarChaveCriptografia();
    const col = criptografarParaColuna('x', new Chaveiro({ v1: antiga }, 'v1'));
    const so_nova = new Chaveiro({ v2: nova }, 'v2');
    let erro: unknown;
    try {
      descriptografarVersionado(col, so_nova);
    } catch (e) {
      erro = e;
    }
    expect(erro).toBeInstanceOf(ErroChaveDesconhecida);
    const msg = (erro as Error).message;
    expect(msg).toContain('v1');
    for (const k of [antiga, nova]) {
      expect(msg).not.toContain(k.toString('hex'));
      expect(msg).not.toContain(k.toString('base64'));
    }
  });

  it('chave inválida ou JSON malformado não ecoa o conteúdo', () => {
    const segredo = 'SEGREDO-NAO-VAZAR';
    for (const env of [
      { FIELD_ENCRYPTION_KEYS: `{"1": ${segredo}`, FIELD_ENCRYPTION_ACTIVE_KID: '1' },
      { FIELD_ENCRYPTION_KEYS: `1:${segredo}`, FIELD_ENCRYPTION_ACTIVE_KID: '1' },
    ]) {
      try {
        carregarChaveiro(env);
        throw new Error('deveria falhar');
      } catch (e) {
        expect((e as Error).message).not.toContain(segredo);
      }
    }
  });

  it('dado adulterado falha sem expor plaintext', () => {
    const k = new Chaveiro({ a: gerarChaveCriptografia() }, 'a');
    const env = criptografarVersionado('plaintext-secreto', k);
    const adulterado = { ...env, tag: '00'.repeat(16) };
    expect(() => descriptografarVersionado(adulterado, k)).toThrow(/adulterado/);
  });

  it('chaveiro não expõe material em inspect/JSON', () => {
    const chave = gerarChaveCriptografia();
    const k = new Chaveiro({ a: chave }, 'a');
    for (const s of [inspect(k, { showHidden: true }), JSON.stringify(k), String(inspect(k))]) {
      expect(s).not.toContain(chave.toString('hex'));
      expect(s).not.toContain(chave.toString('base64'));
    }
  });

  it('lerEnvelope não confunde texto puro com envelope', () => {
    expect(lerEnvelope('123.456.789-09')).toBeNull();
    expect(lerEnvelope('{"a":1}')).toBeNull();
    expect(lerEnvelope('fle:a:zz:zz:zz')).toBeNull();
  });
});

describe('reencriptarCampos', () => {
  function montar() {
    const k1 = gerarChaveCriptografia();
    const k2 = gerarChaveCriptografia();
    const antigo = new Chaveiro({ '1': k1 }, '1');
    const rotacionado = new Chaveiro({ '1': k1, '2': k2 }, '2');
    const db = new Database(':memory:');
    db.exec('CREATE TABLE clientes (id INTEGER PRIMARY KEY, cpf TEXT, email TEXT)');
    const ins = db.prepare('INSERT INTO clientes (cpf, email) VALUES (?, ?)');
    // 3 legados (JSON sem kid), 2 versionados na chave 1, 1 nulo, 1 texto puro
    for (let i = 0; i < 3; i++) ins.run(JSON.stringify(criptografar(`cpf${i}`, k1)), JSON.stringify(criptografar(`mail${i}`, k1)));
    for (let i = 3; i < 5; i++) ins.run(criptografarParaColuna(`cpf${i}`, antigo), criptografarParaColuna(`mail${i}`, antigo));
    ins.run(null, '');
    ins.run('texto puro', null);
    return { db, k1, k2, antigo, rotacionado };
  }

  it('rotação ponta a ponta: tudo na chave nova e legível; chave antiga dispensável', () => {
    const { db, k2, rotacionado } = montar();
    const r = reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf', 'email'], lote: 2, chaveiro: rotacionado });
    expect(r.reescritos).toBe(10);
    expect(r.pendentes).toBe(0);
    expect(r.lotes).toBeGreaterThan(1);
    expect(r.naoCifrados).toBe(4); // null, '', null, texto puro

    const soNova = new Chaveiro({ '2': k2 }, '2'); // chave antiga aposentada
    const linhas = db.prepare('SELECT cpf, email FROM clientes WHERE id <= 5 ORDER BY id').all() as any[];
    linhas.forEach((l, i) => {
      expect(descriptografarVersionado(l.cpf, soNova)).toBe(`cpf${i}`);
      expect(descriptografarVersionado(l.email, soNova)).toBe(`mail${i}`);
    });
    expect((db.prepare('SELECT cpf FROM clientes WHERE id = 7').get() as any).cpf).toBe('texto puro');
  });

  it('é idempotente: segunda execução não reescreve nada', () => {
    const { db, rotacionado } = montar();
    reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf', 'email'], chaveiro: rotacionado });
    const antes = db.prepare('SELECT * FROM clientes ORDER BY id').all();
    const r = reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf', 'email'], chaveiro: rotacionado });
    expect(r.reescritos).toBe(0);
    expect(r.jaAtuais).toBe(10);
    expect(db.prepare('SELECT * FROM clientes ORDER BY id').all()).toEqual(antes);
  });

  it('dry-run não grava e relata o que seria feito', () => {
    const { db, rotacionado } = montar();
    const antes = db.prepare('SELECT * FROM clientes ORDER BY id').all();
    const r = reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf', 'email'], dryRun: true, chaveiro: rotacionado });
    expect(r.dryRun).toBe(true);
    expect(r.reescritos).toBe(10);
    expect(r.pendentes).toBe(10);
    expect(db.prepare('SELECT * FROM clientes ORDER BY id').all()).toEqual(antes);
  });

  it('é retomável: interrompido no meio, a nova execução termina o restante', () => {
    const { db, rotacionado } = montar();
    const parcial = reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf', 'email'], lote: 2, chaveiro: rotacionado });
    expect(parcial.pendentes).toBe(0);
    // simula retomada a partir de cursor: dados novos legados adicionados depois
    db.prepare('INSERT INTO clientes (cpf, email) VALUES (?, ?)').run(
      JSON.stringify(criptografar('novo', rotacionado.obter('1'))),
      null
    );
    const r = reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf', 'email'], lote: 2, chaveiro: rotacionado, aPartirDe: parcial.ultimoRowid });
    expect(r.reescritos).toBe(1);
    expect(r.linhasExaminadas).toBe(1);
  });

  it('transação por lote: erro de gravação no lote desfaz só aquele lote', () => {
    const { db, rotacionado } = montar();
    db.exec(`CREATE TRIGGER barra BEFORE UPDATE ON clientes WHEN NEW.id = 4 BEGIN SELECT RAISE(ABORT, 'x'); END`);
    expect(() =>
      reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf'], lote: 2, chaveiro: rotacionado })
    ).toThrow();
    const ate2 = db.prepare('SELECT cpf FROM clientes WHERE id <= 2').all() as any[];
    expect(ate2.every((l) => l.cpf.startsWith('fle:2:'))).toBe(true); // lote 1 confirmado
    const lote2 = db.prepare('SELECT cpf FROM clientes WHERE id IN (3,4)').all() as any[];
    expect(lote2.some((l) => l.cpf.startsWith('fle:2:'))).toBe(false); // lote 2 desfeito
    db.exec('DROP TRIGGER barra');
    const r = reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf'], lote: 2, chaveiro: rotacionado });
    expect(r.pendentes).toBe(0); // retoma e conclui
  });

  it('kid desconhecido: não altera a linha, conta falha e segue', () => {
    const { db, k2 } = montar();
    const so2 = new Chaveiro({ '2': k2 }, '2'); // sem a chave 1 -> todos falham fechado
    const antes = db.prepare('SELECT * FROM clientes ORDER BY id').all();
    const r = reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf', 'email'], chaveiro: so2 });
    expect(r.reescritos).toBe(0);
    expect(r.falhas.length).toBe(10);
    expect(r.pendentes).toBe(10);
    expect(db.prepare('SELECT * FROM clientes ORDER BY id').all()).toEqual(antes);
  });

  it('rejeita identificadores perigosos', () => {
    const { db, rotacionado } = montar();
    expect(() => reencriptarCampos(db, { tabela: 'clientes; DROP TABLE clientes', colunas: ['cpf'], chaveiro: rotacionado })).toThrow();
    expect(() => reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf"--'], chaveiro: rotacionado })).toThrow();
  });

  it('nunca loga nem retorna chave ou plaintext', () => {
    const { db, k1, k2, rotacionado } = montar();
    const espioes = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => vi.spyOn(console, m).mockImplementation(() => {}));
    const r1 = reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf', 'email'], chaveiro: rotacionado });
    const so2 = new Chaveiro({ '2': k2 }, '2');
    db.prepare('INSERT INTO clientes (cpf) VALUES (?)').run(JSON.stringify(criptografar('cpf-sensivel', k1)));
    const r2 = reencriptarCampos(db, { tabela: 'clientes', colunas: ['cpf'], chaveiro: so2 });
    const saida = JSON.stringify([r1, r2, espioes.map((e) => e.mock.calls)]);
    for (const proibido of [k1.toString('hex'), k1.toString('base64'), k2.toString('hex'), k2.toString('base64'), 'cpf-sensivel', 'cpf0', 'mail0']) {
      expect(saida).not.toContain(proibido);
    }
  });
});

describe('script rotacionar-chaves (argumentos)', () => {
  it('lê --dry-run, lote e colunas', () => {
    const a = lerArgs(['--tabela=clientes', '--colunas=cpf,email', '--lote=100', '--dry-run']);
    expect(a).toMatchObject({ lote: 100, dryRun: true, alvos: [{ tabela: 'clientes', colunas: ['cpf', 'email'] }] });
    expect(() => lerArgs([])).toThrow();
    expect(() => lerArgs(['--x'])).toThrow();
  });
});
