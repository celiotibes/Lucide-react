import { SQLiteDatabase } from 'expo-sqlite';

export async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS vistorias (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL CHECK(tipo IN ('entrada', 'periodica', 'saida', 'conferencia')),
      modo TEXT NOT NULL CHECK(modo IN ('presencial', 'autovistoria')),
      status TEXT NOT NULL,
      imovel_id TEXT NOT NULL,
      contrato_id TEXT NOT NULL,
      vistoria_base_id TEXT,
      data_agendada TEXT,
      data TEXT NOT NULL,
      realizada_por TEXT,
      synced BOOLEAN DEFAULT 0,
      synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ambientes (
      id TEXT PRIMARY KEY,
      vistoria_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      ordem INTEGER NOT NULL,
      synced BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (vistoria_id) REFERENCES vistorias(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS itens (
      id TEXT PRIMARY KEY,
      ambiente_id TEXT NOT NULL,
      nome TEXT NOT NULL,
      tipo TEXT NOT NULL,
      ordem INTEGER NOT NULL,
      obrigatorio BOOLEAN DEFAULT 1,
      synced BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (ambiente_id) REFERENCES ambientes(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS itens_vistoria (
      id TEXT PRIMARY KEY,
      vistoria_id TEXT NOT NULL,
      item_id TEXT NOT NULL,
      item_checklist_id TEXT,
      estado TEXT CHECK(estado IN ('novo', 'bom', 'regular', 'danificado', 'inexistente', NULL)),
      observacao TEXT,
      midia_json TEXT,
      transcricao_audio TEXT,
      audio_path TEXT,
      synced BOOLEAN DEFAULT 0,
      synced_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      FOREIGN KEY (vistoria_id) REFERENCES vistorias(id) ON DELETE CASCADE,
      FOREIGN KEY (item_id) REFERENCES itens(id)
    );

    CREATE TABLE IF NOT EXISTS medias (
      id TEXT PRIMARY KEY,
      item_vistoria_id TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('foto', 'video', 'audio')),
      caminho_local TEXT NOT NULL,
      url_remota TEXT,
      hash_sha256 TEXT,
      tamanho INTEGER,
      largura INTEGER,
      altura INTEGER,
      duracao REAL,
      exif_json TEXT,
      synced BOOLEAN DEFAULT 0,
      synced_at TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (item_vistoria_id) REFERENCES itens_vistoria(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS anotacoes_foto (
      id TEXT PRIMARY KEY,
      media_id TEXT NOT NULL,
      tipo TEXT NOT NULL CHECK(tipo IN ('seta', 'circulo', 'retangulo', 'texto')),
      coordenadas_json TEXT NOT NULL,
      cor TEXT DEFAULT '#FF0000',
      texto TEXT,
      ordem INTEGER,
      synced BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (media_id) REFERENCES medias(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS sync_queue (
      id TEXT PRIMARY KEY,
      tipo TEXT NOT NULL,
      entidade_id TEXT NOT NULL,
      acao TEXT NOT NULL CHECK(acao IN ('create', 'update', 'delete')),
      dados_json TEXT NOT NULL,
      tentativas INTEGER DEFAULT 0,
      erro_ultima_tentativa TEXT,
      criado_em TEXT NOT NULL,
      tentado_em TEXT
    );

    CREATE TABLE IF NOT EXISTS chaves_controles (
      id TEXT PRIMARY KEY,
      vistoria_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      quantidade INTEGER DEFAULT 1,
      estado TEXT,
      observacao TEXT,
      foto_id TEXT,
      synced BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (vistoria_id) REFERENCES vistorias(id) ON DELETE CASCADE,
      FOREIGN KEY (foto_id) REFERENCES medias(id)
    );

    CREATE TABLE IF NOT EXISTS leituras_medidor (
      id TEXT PRIMARY KEY,
      vistoria_id TEXT NOT NULL,
      tipo TEXT NOT NULL,
      leitura_anterior REAL,
      leitura_atual REAL,
      unidade TEXT,
      foto_id TEXT,
      synced BOOLEAN DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (vistoria_id) REFERENCES vistorias(id) ON DELETE CASCADE,
      FOREIGN KEY (foto_id) REFERENCES medias(id)
    );

    CREATE TABLE IF NOT EXISTS sync_metadata (
      chave TEXT PRIMARY KEY,
      valor TEXT NOT NULL,
      atualizado_em TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_vistorias_imovel_id ON vistorias(imovel_id);
    CREATE INDEX IF NOT EXISTS idx_vistorias_contrato_id ON vistorias(contrato_id);
    CREATE INDEX IF NOT EXISTS idx_vistorias_synced ON vistorias(synced);
    CREATE INDEX IF NOT EXISTS idx_ambientes_vistoria_id ON ambientes(vistoria_id);
    CREATE INDEX IF NOT EXISTS idx_itens_ambiente_id ON itens(ambiente_id);
    CREATE INDEX IF NOT EXISTS idx_itens_vistoria_vistoria_id ON itens_vistoria(vistoria_id);
    CREATE INDEX IF NOT EXISTS idx_medias_item_vistoria_id ON medias(item_vistoria_id);
    CREATE INDEX IF NOT EXISTS idx_sync_queue_tipo_acao ON sync_queue(tipo, acao);
  `);
}
