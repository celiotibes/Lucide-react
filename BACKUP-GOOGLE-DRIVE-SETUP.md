# Sistema de Backup Automático para Google Drive (Agente 5)

## Visão Geral

Este sistema realiza backup automático do banco de dados SQLite (`data/app.db`) para o Google Drive **a cada 1 hora**, garantindo que seus dados estejam sempre sincronizados e recuperáveis em caso de falha.

**Características:**
- ✅ Backup automático horário (sem configuração manual)
- ✅ Compressão ZIP com nível máximo
- ✅ Validação de integridade
- ✅ Folder organizada "Backups Contabilidade" no Drive
- ✅ Nomes únicos com timestamp: `backup-YYYY-MM-DD-HH-mm-ss.zip`
- ✅ Restauração manual via CLI ou API
- ✅ Logs detalhados de sucesso/falha
- ✅ Graceful degradation (sistema funciona sem Drive configurado)

---

## Setup Google Cloud & Service Account

### 1. Criar projeto no Google Cloud Console

1. Acesse [Google Cloud Console](https://console.cloud.google.com)
2. Clique em "Criar Projeto"
3. Nome: `Backup Contabilidade` (ou o que preferir)
4. Clique em "Criar"

### 2. Habilitar Google Drive API

1. Na barra de busca, procure por "Google Drive API"
2. Clique em "Google Drive API"
3. Clique em "ATIVAR"

### 3. Criar Service Account

1. Vá para "Credenciais" (abas laterais)
2. Clique em "Criar Credenciais" > "Conta de Serviço"
3. **Nome da conta de serviço:** `backup-contabilidade-agent`
4. **ID da conta de serviço:** `backup-contabilidade-agent` (auto)
5. Descrição: `Backup automático do banco SQLite`
6. Clique em "Criar e Continuar"
7. **Grant roles** (não obrigatório para este caso)
8. Clique em "Continuar"
9. Clique em "Criar Chave"
   - Tipo: **JSON**
   - Clique em "Criar"
   - Um arquivo `.json` será baixado automaticamente

### 4. Copiar JSON da chave privada

1. Abra o arquivo JSON que foi baixado
2. Copie **TODO o conteúdo JSON** (incluindo as quebras de linha)

---

## Configurar .env

No arquivo `.env` (ou `.env.local`), adicione:

```bash
# Formato: Cole o JSON COMPLETO da chave
GOOGLE_CREDENTIALS_JSON={"type":"service_account","project_id":"seu-projeto","private_key_id":"...","private_key":"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",...}
```

---

## Como Usar

### Backup Automático (padrão)

O sistema fará backup automaticamente **a cada 1 hora**. Nenhuma ação necessária!

### Executar Backup Manual

```bash
curl -X POST http://localhost:3000/api/backup/agora \
  -H "X-API-Key: sua-chave-api-key"
```

### Listar Backups

```bash
npm run backup:listar
```

### Restaurar um Backup

```bash
npm run backup:restaurar <file-id>
```

---

## Variáveis de Ambiente

| Variável | Tipo | Obrigatória |
|----------|------|-------------|
| `GOOGLE_CREDENTIALS_JSON` | String (JSON) | ❌ |

---

## API Endpoints

- `GET /api/backup/status` - Verifica configuração
- `GET /api/backup/listar` - Lista backups
- `POST /api/backup/agora` - Backup manual
- `POST /api/backup/restaurar/:fileId` - Restaura backup

---

## Segurança

- ⚠️ Nunca commitar `.env` com credenciais reais
- ✅ Use `.env.local` (gitignored)
- ✅ Ou configure via variáveis de ambiente no servidor
- ✅ Use secrets no seu platform de deploy

---

## Próximos Passos

1. Configure `GOOGLE_CREDENTIALS_JSON` no `.env`
2. Verifique os logs: `[GoogleDriveBackup]`
3. Teste com `npm run backup:listar`
4. Teste restauração mensalmente

Boa sorte! 🎉
