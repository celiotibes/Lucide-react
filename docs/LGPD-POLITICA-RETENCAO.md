# LGPD - Política de Retenção de Dados

**Data de criação:** 2026-10-04  
**Status:** Implementação concluída (esquema + executor + CLI)  
**Responsável:** Compliance / DPO  

---

## 1. Visão Geral

A Política de Retenção de Dados implementa obrigações da LGPD (Lei Geral de Proteção de Dados) de manter dados apenas pelo tempo necessário para suas finalidades legítimas, equilibrando:

- **Direito ao Esquecimento** (Art. 18 LGPD): exclusão de dados pessoais conforme solicitação
- **Obrigação Fiscal** (Lei 8.934/1994): manutenção de livros contábeis por 10 anos
- **Bloqueios Judiciais** (Litigation Holds): preservação de dados em contextos de litígio

---

## 2. Arquitetura

### 2.1 Tabelas de Suporte

```sql
politica_retencao
├─ Define período de retenção por tabela
├─ Associa base legal (fiscal, operacional, contábil)
└─ Pode ser ativada/desativada sem perder histórico

marcacao_esquecimento
├─ Marca registros para exclusão sob direito ao esquecimento
├─ Rastreia motivo (solicitação do usuário, término de contrato)
└─ Status: pendente → anonimizado → deletado

litigio_bloqueio
├─ Bloqueia exclusão de dados em contextos de litígio
├─ Exigido para: processos judiciais, auditorias da IRPF, ações da ANPD
├─ Número do processo como referência
└─ Requer auditoria completa para desbloqueio

registro_retencao_executada
├─ Auditoria de cada execução de limpeza
├─ Registra: tabela, quantidade deletada, motivo, modo (dry-run ou real)
└─ Permite rastrear completo de exclusões
```

### 2.2 Serviço de Execução

`RetentionPolicyExecutor` oferece:

- **Execução com Dry-Run**: testa sem deletar (padrão seguro)
- **Verificação de Litígio**: não deleta se `litigio_bloqueio.ativo = 1`
- **Auditoria Completa**: cada deleção é registrada com motivo
- **Validação de Backup**: proíbe deleção real sem backup validado

---

## 3. Políticas de Retenção Padrão

| Tabela | Dias | Base Legal | Descrição |
|--------|------|-----------|-----------|
| `prestadores` | 90 | Operacional | Anonimizar contatos inativos |
| `contratos_locacao` | 1095 (3 anos) | Operacional | Lei do Inquilinato, art. 52 |
| `contrato_locatarios` | 1095 | Operacional | Locatários após termo de contrato |
| `caucoes` | 1095 | Operacional | Caução após devolução |
| `transacoes` | 3650 (10 anos) | Fiscal | Lei 8.934/1994 (Livros Contábeis) |
| `contas_bancarias` | 3650 | Fiscal | Guarda de documentação bancária |
| `documentos` | 3650 | Fiscal | Notas fiscais, recibos, boletos |
| `documentos_gerados` | 3650 | Fiscal | Laudos e RAD (probatória) |
| `log_alteracoes` | 36500 | Contábil | Perpétuo (imutável por design) |
| `imoveis` | 36500 | Contábil | Patrimônio contábil (indefinido) |
| `vistorias` | 1095 | Operacional | Após contrato encerrado |
| `vistoria_anexo` | 1095 | Operacional | Fotos/documentos de vistoria |

---

## 4. Fluxos de Uso

### 4.1 Deleção Automática por Retenção

**Dia 1:** Data de criação/encerramento do contrato registrada.

**Dia N (retencao_dias):** Sistema identifica registros expirados.

**Fluxo com Dry-Run (SEGURO - Padrão):**
```bash
$ node retention-policy-cli.ts execute --dry-run
```
Saída: lista registros que SERIAM deletados, sem deletar.

**Fluxo com Deleção Real (Requer Backup Validado):**
```bash
# 1. Validar backup
$ node backup-cli.ts validate

# 2. Executar deleção real
$ node retention-policy-cli.ts execute --real --backup-validated

# Resultado:
# ✓ X registros deletados
# ✓ Auditado em registro_retencao_executada
# ✓ Logs com detalhes completos
```

### 4.2 Direito ao Esquecimento (Art. 18 LGPD)

**Usuário solicita:** "Quero ser esquecido."

**Fluxo:**

```typescript
// 1. Marcar para esquecimento
executor.marcarParaEsquecimento(
  'contrato_locatarios',
  registroId,
  'solicitacao_usuario',
  'usuario@example.com'
);
// Resultado: status = 'pendente', não será deletado ainda

// 2. Anonimizar (opcional, antes de deletar)
// Remover PII: nome → "Titular Anonimizado", email → NULL
// Mantém transações contábeis intactas (imutável)

// 3. Hard Delete (30 dias depois)
// Status muda para 'deletado'
```

**Restrição Legal:** Se o registro está em `log_alteracoes` (trilha contábil), não é deletado — apenas anonimizado. A trilha de auditoria é perpétua.

### 4.3 Bloqueio por Litígio (Litigation Hold)

**Cenário:** Auditoria da IRPF, processo judicial, investigação ANPD.

**Bloquear:**
```bash
$ node retention-policy-cli.ts hold contas_bancarias 42 \
  --reason "auditoria_irpf" \
  --number "00000000000190201/0000-91"
```

**Efeito:** Qualquer tentativa de deletar `contas_bancarias:42` é bloqueada.

**Log de Auditoria:**
```json
{
  "tabela_nome": "contas_bancarias",
  "registro_id": 42,
  "motivo_litigio": "auditoria_irpf",
  "numero_processo": "00000000000190201/0000-91",
  "data_bloqueio": "2026-10-04T10:30:00Z",
  "bloqueado_por": "dpo",
  "ativo": 1
}
```

**Desbloquear (Requer Aprovação):**
```bash
$ node retention-policy-cli.ts release contas_bancarias 42
```

Registra: data, quem desbloqueou, observações (auditado completamente).

---

## 5. Integração com Backup

A deleção de dados NÃO pode ocorrer sem que o backup tenha sido validado:

```typescript
// ❌ REJEITA
executor.executarRetencao({
  dryRun: false,
  backupValidado: false  // Erro!
});

// ✅ ACEITA (após validar backup)
executor.executarRetencao({
  dryRun: false,
  backupValidado: true,
  executadoPor: 'sistema'
});
```

**Sequência Segura:**
1. Backup automático executado
2. Backup validado (checksum, integridade confirmada)
3. Retenção limpa dados expirados
4. Ambos auditados com timestamps

---

## 6. Relatório de Retenção

```bash
$ node retention-policy-cli.ts report
```

Saída:
```
📊 RELATÓRIO DE RETENÇÃO LGPD:
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
   Políticas Ativas: 12
   Registros Bloqueados (Litígio): 3
   Última Execução: 2026-10-01T23:30:00Z
```

### Listando Bloqueios:

```bash
$ node retention-policy-cli.ts list-blocked

⚖️  REGISTROS BLOQUEADOS POR LITÍGIO (3):
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
Tabela          | ID    | Motivo           | Processo
contas_bancarias| 42    | auditoria_irpf   | 00000000000190201/0000-91
transacoes      | 1234  | processo_judicial| 0001234/2026-CV
imoveis         | 5     | sindicancia_anpd | (sem número)
```

---

## 7. Casos de Uso: Exemplos

### Caso 1: Limpeza de Dados Operacionais (90 dias)

```bash
# Teste
$ node retention-policy-cli.ts execute --dry-run
# Saída: "Seriam deletados 542 registros de prestadores"

# Depois de validar backup
$ node retention-policy-cli.ts execute --real --backup-validated
# Auditado em: registro_retencao_executada
#   ├─ tabela_nome: prestadores
#   ├─ registros_deletados: 542
#   ├─ motivo_exclusao: politica_retencao
#   └─ data_execucao: 2026-10-04T10:30:00Z
```

### Caso 2: Conflito - Contrato Encerrado + Auditoria Fiscal

```
Cenário:
├─ Contrato de locação encerrado em 2023-06-30
├─ Retenção obrigatória: 3 anos (2026-06-30)
├─ Sistema quer deletar em 2026-07-01
└─ MAS: Auditoria IRPF aberta em 2026-09-01

Ação:
$ node retention-policy-cli.ts hold contrato_locatarios 999 \
  --reason auditoria_irpf \
  --number 00000000000190201/0000-91

Resultado:
├─ Registro BLOQUEADO
├─ Não será deletado (mesmo que politicamente expirado)
└─ Log auditado para conformidade legal
```

### Caso 3: Direito ao Esquecimento + Trilha Contábil

```
Usuário: "Quero ser esquecido"

Ação:
1. executor.marcarParaEsquecimento(
     'contrato_locatarios', 999, 'solicitacao_usuario', user@email
   )
   Status: pendente

2. Anonimizar dados pessoais (nome, email, telefone)
   Executar:
   UPDATE contrato_locatarios
   SET nome = 'Titular Anonimizado', email = NULL, telefone = NULL
   WHERE id = 999

3. Hard delete de contrato_locatarios:999
   Transações associadas em log_alteracoes: MANTIDAS (imutável)
   
Resultado:
├─ PII removida
├─ Contrato histórico rastreável apenas via log (anonimizado)
└─ Conformidade legal: direito ao esquecimento + auditoria fiscal
```

---

## 8. Procedimentos Operacionais

### 8.1 Ativar/Desativar Política de Retenção

```typescript
// Desativar temporariamente (ex: durante auditoria)
db.prepare(`
  UPDATE politica_retencao
  SET ativa = 0
  WHERE tabela_nome = 'transacoes'
`).run();

// Reativar
db.prepare(`
  UPDATE politica_retencao
  SET ativa = 1
  WHERE tabela_nome = 'transacoes'
`).run();
```

### 8.2 Modificar Período de Retenção

```typescript
// Aumentar retenção de auditoria IRPF de 10 para 15 anos
db.prepare(`
  UPDATE politica_retencao
  SET retencao_dias = 5475
  WHERE tabela_nome = 'transacoes'
`).run();
```

### 8.3 Auditoria Completa de Exclusões

```sql
-- Ver todas as deleções por retenção
SELECT
  tabela_nome,
  COUNT(*) as total_deletados,
  SUM(registros_deletados) as registros,
  MAX(data_execucao) as ultima_execucao
FROM registro_retencao_executada
GROUP BY tabela_nome
ORDER BY data_execucao DESC;

-- Ver bloqueios ativos
SELECT *
FROM litigio_bloqueio
WHERE ativo = 1
ORDER BY data_bloqueio DESC;

-- Ver esquecimentos pendentes
SELECT *
FROM marcacao_esquecimento
WHERE status IN ('pendente', 'anonimizado')
ORDER BY solicitado_em DESC;
```

---

## 9. Compliance e Conformidade

### 9.1 Conformidade LGPD

- ✅ **Art. 7º (Bases Legais):** Cada tabela associada a base legal específica
- ✅ **Art. 17 (Esquecimento):** Implementado com `marcacao_esquecimento`
- ✅ **Art. 18 (Acesso/Correção/Portabilidade):** Integrado com direitos do titular
- ✅ **Art. 28 (DPA):** Operadores terceirizados devem seguir políticas

### 9.2 Conformidade Fiscal

- ✅ **Lei 8.934/1994:** Livros contábeis retidos por 10 anos
- ✅ **Lei do Inquilinato:** Contratos e cauções por 3 anos
- ✅ **Lei 8.245/1991:** Documentação de imóvel/locação
- ✅ **Cartório:** Matrículas de imóvel (indefinido)

### 9.3 Conformidade Judicial

- ✅ **Litigation Holds:** Bloqueios para preservação de prova
- ✅ **Auditoria:** Cada bloqueio/desbloqueio registrado
- ✅ **Rastreabilidade:** Quem bloqueou, quando, por qual motivo

---

## 10. Testes e Validação

### Teste 1: Dry-Run não deleta dados

```bash
$ node retention-policy-cli.ts execute --dry-run
# Resultado: reporta registros, mas nada é deletado
```

### Teste 2: Litígio bloqueia deleção

```bash
# 1. Marcar para esquecimento
$ node retention-policy-cli.ts forget test_dados 123

# 2. Bloquear por litígio
$ node retention-policy-cli.ts hold test_dados 123 --reason "outro"

# 3. Tentar deletar
$ node retention-policy-cli.ts execute --dry-run
# Resultado: "1 registro bloqueado por litígio, 0 seriam deletados"
```

### Teste 3: Desbloqueio permite deleção

```bash
# 1. Desbloquear
$ node retention-policy-cli.ts release test_dados 123

# 2. Tentar deletar
$ node retention-policy-cli.ts execute --dry-run
# Resultado: "1 registro seria deletado"
```

---

## 11. Alertas e Monitoramento

### Alertas Críticos

- ⚠️ **Tentativa de deletar sem backup validado** → Bloqueado com erro
- ⚠️ **Deleção de registro em litígio** → Rejeitado, loggado como tentativa
- ⚠️ **Retenção desativada** → Alerta ao DPO

### Métricas para Dashboard

```typescript
executor.gerarRelatoriRetencao()
// {
//   politicas_ativas: 12,
//   registros_expirados_total: 5432,
//   registros_bloqueados_total: 3,
//   ultima_execucao: "2026-10-01T23:30:00Z"
// }
```

---

## 12. Revisão e Atualização

### Anual

- [ ] Revisar períodos de retenção com DPO/advogado
- [ ] Validar conformidade com novas leis/regulamentos
- [ ] Atualizar bases legais conforme jurisprudência

### Quando há mudança legal

- [ ] Atualizar `politica_retencao` com novo período
- [ ] Documentar motivo da mudança
- [ ] Comunicar ao time de compliance

---

## 13. Contato e Escalação

**DPO/Compliance:** Revisar esta política antes de produção  
**Jurídico:** Validar conformidade com legislação brasileira  
**DevOps:** Integrar com plano de backup e disaster recovery  

---

**Versão:** 1.0  
**Última atualização:** 2026-10-04  
**Status:** Pronto para produção
