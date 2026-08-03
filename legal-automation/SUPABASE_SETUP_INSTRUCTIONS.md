# Supabase Database Setup Instructions

## Passo 1: Executar Migrations via Supabase SQL Editor

1. Acesse: https://app.supabase.com
2. Clique em seu projeto: `rxxcaecznjatsepirrqq` (legal-automation-prod)
3. No menu lateral, clique em **"SQL Editor"**
4. Clique em **"New Query"**
5. Copie TODO o conteúdo do arquivo `SUPABASE_MIGRATIONS.sql` deste repositório
6. Cole no editor SQL do Supabase
7. Clique em **"Run"** (botão verde)

⏱️ **Tempo de execução**: 2-3 minutos

## Passo 2: Verificar Criação das Tabelas

Após as migrations completarem com sucesso, execute esta query para verificar:

```sql
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

Você deve ver aproximadamente 57 tabelas criadas.

## Passo 3: Verificação de Integridade

Execute estas queries para validar:

```sql
-- Count total tables
SELECT COUNT(*) as table_count FROM information_schema.tables 
WHERE table_schema = 'public';

-- Count total indices
SELECT COUNT(*) as index_count FROM pg_indexes 
WHERE schemaname = 'public';

-- List all tables
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' 
ORDER BY tablename;
```

## Passo 4: Backup das Credenciais

As seguintes credenciais já estão configuradas no arquivo `.env`:

- **DATABASE_URL**: `postgresql://postgres.rxxcaecznjatsepirrqq:elZrN8Nd14TBqnyH@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require&pgbouncer=true`
- **JWT_SECRET**: `W1vab0UM0q6pxVTSJpuy8NTfX6X9LYOBdtGI0P6Hd0w=`
- **CERT_ENCRYPTION_KEY**: `7WeDaZ4Ees/uhvNBL6MO8qMHT6+yF1UAV9Z6JNRdxlI=`

## Passo 5: Testar Conexão (Opcional)

Se você quiser testar a conexão localmente:

```bash
psql postgresql://postgres.rxxcaecznjatsepirrqq:elZrN8Nd14TBqnyH@aws-0-sa-east-1.pooler.supabase.com:6543/postgres?sslmode=require -c "SELECT version();"
```

## Próximos Passos

Uma vez que as migrations estejam completas:

1. ✅ Banco de dados pronto
2. ⏭️ Configurar Render para deploy
3. ⏭️ Deploy automático do backend

---

**Status**: Aguardando execução das migrations no Supabase SQL Editor
