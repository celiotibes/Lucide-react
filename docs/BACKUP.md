# Backup e Restauração

Implementação de backup com 2+ cópias, criptografia AES-256-GCM, validação de integridade e testes de restauração.

## Visão Geral

- **Snapshot**: VACUUM INTO (ou fallback com cópia + VACUUM) para estado consistente do SQLite
- **Criptografia**: AES-256-GCM com chave em env (nunca logar a chave)
- **Armazenamento**: Cópia local (BACKUP_LOCAL_DIR) + Google Drive (2ª cópia offsite)
- **Integridade**: SHA-256 + manifesto JSON (nome, tamanho, hash, timestamp, schema, row counts)
- **Retenção**: Padrão 7 diários, 8 semanais, 12 mensais (compatível com >= 5 anos mensais)
- **RPO**: 15 minutos (requer WAL incremental — implementar após)
- **RTO**: 4 horas (restauração manual + restart)

## Configuração

### Variáveis de Ambiente (obrigatórias)

```bash
# Diretório local para backups (ex: /mnt/backup, /nas/backup)
export BACKUP_LOCAL_DIR=/mnt/backup

# Chave AES-256 (64 caracteres hex = 32 bytes)
# Gerar: openssl rand -hex 32
export BACKUP_ENCRYPTION_KEY=abc123def456...

# Google Drive (opcional, para 2ª cópia)
export GOOGLE_CREDENTIALS_JSON='{"type":"service_account",...}'
```

### .env.example

```
BACKUP_LOCAL_DIR=
BACKUP_ENCRYPTION_KEY=
GOOGLE_CREDENTIALS_JSON=
```

## CLI

```bash
# Criar novo backup
tsx server/src/scripts/backup.ts criar

# Verificar integridade do último
tsx server/src/scripts/backup.ts verificar

# Testar restauração
tsx server/src/scripts/backup.ts testar-restauracao

# Listar backups disponíveis
tsx server/src/scripts/backup.ts listar

# Ajuda
tsx server/src/scripts/backup.ts help
```

## Fluxo de Backup

1. **Geração de Snapshot**: Usa VACUUM INTO para cópia consistente sem lock exclusivo
2. **Coleta de Metadados**: Tabelas, row counts, schema version
3. **Criptografia**: AES-256-GCM com IV aleatório e auth tag
4. **Manifesto**: JSON com hash, sizes, metadados, IV/auth tag para descriptografia
5. **Armazenamento Local**: `${BACKUP_LOCAL_DIR}/${backup-id}.enc` + `-manifest.json`
6. **Upload Drive**: Chama `backupSQLiteToGoogleDrive()` para 2ª cópia
7. **Retenção**: Remove backups além das políticas de dailies/weeklies/monthlies

## Verificação de Integridade

```typescript
const result = await service.verificarBackup(caminhoArquivo, manifesto);
// Retorna: { valido, erros, avisos }
// Valida: arquivo existe, tamanho, descriptografia, hash SHA-256, PRAGMA integrity_check
```

## Teste de Restauração

```typescript
const result = await service.testarRestauracao(caminhoArquivo, manifesto);
// Retorna: { valido, relatorio, erros }
// Relatorio: integridade (ok/failed), tabelas com row counts, avisos
// Testa: descriptografia, PRAGMA integrity_check, contagem de linhas em tabelas-chave
```

## Regra 3-2-1

**Objetivo**: 3 cópias, em 2 tipos de mídia, 1 delas fora do local.

**Estado atual (parcial)**:
- Cópia 1: banco de produção (`data/app.db`).
- Cópia 2: backup criptografado em `BACKUP_LOCAL_DIR` (disco/NAS local).
- Cópia 3: o mesmo arquivo criptografado e seu manifesto no Google Drive (fora do local).

**O que isso NÃO garante**:
- **Mídias**: disco local e nuvem contam como 2 tipos, mas ambos são apagáveis; nenhuma cópia é imutável. O Drive **não** é imutável: quem tem acesso à conta (ou um ransomware com o token) pode apagar os arquivos.
- **Ransomware/exclusão acidental**: sem cópia imutável (object lock) ou desconectada, um comprometimento do servidor pode destruir todas as cópias acessíveis.
- **Agendamento**: o backup só roda quando acionado (`backup.ts criar`); não há agendador. Sem ele, o RPO real é o intervalo entre execuções manuais.
- **RPO de 15 minutos**: exige backup incremental (WAL) e agendador, ainda não implementados.

**Próximos passos recomendados**: agendar o backup completo (cron/CronJob), adicionar cópia imutável (bucket com object lock) e alertar em falha de backup.

## RPO e RTO

### RPO (Recovery Point Objective) — 15 minutos

**Objetivo**: Perder no máximo 15 minutos de dados

**Estado Atual**:
- Backup completo manual → RPO ∞ (até rodar manualmente)
- Backup agendado (1h em googleDriveBackup) → RPO ~60 min

**Para Atingir 15 min**:
- Implementar WAL incremental: lê SQLite journal a cada 15 min, copia mudanças
- Integrar com scheduler (cron ou job interno)
- Não está implementado — deixar como pendência clara

### RTO (Recovery Time Objective) — 4 horas

**Objetivo**: Restaurar operação em no máximo 4 horas

**Processo Atual**:
1. Baixar backup do Drive ou local (~5-15 min, rede dependente)
2. Descriptografar (~1 min)
3. Validar PRAGMA integrity_check (~5 min, tamanho DB dependente)
4. Substituir data/app.db
5. Reiniciar servidor (~2 min)
6. **Total**: ~20-30 min (bem abaixo de 4h)

## Testes

Executar testes vitest:

```bash
npm run test -- server/tests/backup-service.spec.ts
```

Cobertura:
- ✓ Criar backup → arquivo + manifesto
- ✓ Hash SHA-256 confere
- ✓ Adulteração detectada na verificação
- ✓ Restauração passa integrity check
- ✓ Chave ausente falha fechado (erro ao inicializar)
- ✓ Retenção remove apenas o que excede política
- ✓ Row counts conferem antes/depois

## Segurança

- **Chave**: Lida de env apenas, NUNCA logada ou gravada em arquivo
- **IV**: Aleatório a cada backup, armazenado no manifesto
- **Auth Tag**: Validado na descriptografia (AES-256-GCM autenticado)
- **Manifesto**: JSON em texto claro (contém metadados, não dados sensíveis)
- **Hash**: SHA-256 do arquivo original, protege contra corrupção de rede

## Próximas Fases

1. **WAL Incremental**: Implementar backup a cada 15 min via journal SQLite
2. **NAS Imutável**: Adicionar cópia em NAS com políticas de retenção imutável
3. **Monitoramento**: Alertas se backup falha, dashboard de status
4. **Automação**: Agendador interno (cron-like) para backup regular
5. **Restauração Remota**: Endpoint API para restaurar de fileId sem acesso local
