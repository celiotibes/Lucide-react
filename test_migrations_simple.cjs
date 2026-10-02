const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

const testDbPath = '/tmp/test_analytics.db';

// Remove arquivo de teste anterior
if (fs.existsSync(testDbPath)) {
  fs.unlinkSync(testDbPath);
}

// Criar banco de testes
const db = new Database(testDbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('✓ Banco de dados de teste criado');

// Ler e executar a migração fase 6
const migrationPath = path.join(__dirname, 'server/src/migrations-phase6-analytics-completa.sql');
const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

console.log('\n📋 Executando migração Phase 6...\n');

try {
  db.exec(migrationSQL);
  console.log('✓ Migração executada com sucesso (primeira vez)');
} catch (err) {
  console.error('❌ Erro na primeira execução:', err.message);
  process.exit(1);
}

// Testar idempotência: executar novamente
console.log('\n🔄 Testando idempotência (execução 2)...\n');
try {
  db.exec(migrationSQL);
  console.log('✓ Migração executada novamente sem erros (idempotente)');
} catch (err) {
  console.error('❌ Erro na segunda execução (não é idempotente):', err.message);
  process.exit(1);
}

// Verificar schema das 7 tabelas
const tables = [
  'dre_periodos',
  'fluxo_periodos',
  'margens_propriedades_periodo',
  'categorias_transacoes_asaas',
  'alertas_anomalias_registrados',
  'pagamentos_pix_solicitados',
  'audit_reconciliacao_pix'
];

console.log('\n📊 Verificando schema das tabelas:\n');

for (const tableName of tables) {
  const checkTable = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name=?"
  );
  const tableExists = checkTable.get(tableName);
  
  if (!tableExists) {
    console.error(`❌ Tabela ${tableName} não encontrada!`);
    process.exit(1);
  }

  const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
  console.log(`✓ ${tableName}`);
  console.log(`  Colunas: ${columns.length}`);
  columns.slice(0, 3).forEach(col => {
    console.log(`    - ${col.name}: ${col.type}`);
  });
  if (columns.length > 3) {
    console.log(`    ... + ${columns.length - 3} mais colunas`);
  }
  console.log();
}

// Verificar índices
console.log('📑 Índices criados:\n');
const indexQuery = db.prepare(
  "SELECT name, tbl_name FROM sqlite_master WHERE type='index' AND name LIKE 'idx_%'"
);
const indexes = indexQuery.all();
console.log(`Total de índices: ${indexes.length}`);
indexes.forEach(idx => {
  console.log(`  - ${idx.name} (tabela: ${idx.tbl_name})`);
});

console.log('\n✅ Testes de migração concluídos com sucesso!');
console.log(`📁 Banco de teste: ${testDbPath}`);

db.close();
