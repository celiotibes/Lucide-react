# LGPD - Inventário de Dados Pessoais e Bases Legais

**RASCUNHO TÉCNICO** — requer revisão de advogado/DPO; não constitui parecer jurídico.

**Data de última atualização:** 2026-10-03  
**Escopo:** Reconstituição contábil e gestão de imóveis (schema.sql, migrations, rotas LGPD)

---

## 1. Mapeamento de Dados Pessoais por Tabela/Módulo

### 1.1 Contas Bancárias (`contas_bancarias`)

| Campo | Tipo de Dado | Finalidade | Base Legal | Prazo Retenção | Quem Acessa | Criptografia |
|-------|---|----------|-----------|----------------|-----------|-------------|
| `banco` | Nome instituição | Operação financeira | Art. 7º, II (execução contrato) | 10 anos (contábil) | Admin, Auditor | Não verificado |
| `numero` | Número conta bancária | Operação financeira | Art. 7º, II (execução contrato) | 10 anos (contábil) | Admin, Auditor | Recomendado (field-level-encryption) |
| `agencia` | Código agência | Operação financeira | Art. 7º, II (execução contrato) | 10 anos (contábil) | Admin, Auditor | Recomendado |
| `titular` | Nome do titular | Identificação bancária | Art. 7º, II (execução contrato) | 10 anos (contábil) | Admin, Auditor | Não verificado |

**Observações:**
- Não verificado se há criptografia implementada em produção
- Acesso via relatórios de reconciliação bancária
- Dados imutáveis por design (são "fotografia" do extrato)

---

### 1.2 Prestadores (`prestadores`)

| Campo | Tipo de Dado | Finalidade | Base Legal | Prazo Retenção | Quem Acessa | Criptografia |
|-------|---|----------|-----------|----------------|-----------|-------------|
| `cpf_cnpj` | CPF ou CNPJ | Identificação fiscal | Art. 7º, II (obrigação legal/fiscal) | 10 anos (guarda fiscal) | Admin, RH, Auditor | Recomendado |
| `email` | E-mail | Notificação de OS | Art. 7º, V (consentimento) | Enquanto relacionamento | Admin | Recomendado |
| `telefone` | Telefone | Contato para OS | Art. 7º, V (consentimento) | Enquanto relacionamento | Admin | Recomendado |

---

### 1.3 Contratos de Locação (`contratos_locacao`) e Locatários (`contrato_locatarios`)

| Campo | Tipo de Dado | Finalidade | Base Legal | Prazo Retenção | Quem Acessa | Criptografia |
|-------|---|----------|-----------|----------------|-----------|-------------|
| `locatario` / `nome` | Nome completo | Execução contrato | Art. 7º, II (execução contrato) | 3 anos (após resolução contrato) | Admin, Inquilino | Recomendado |
| `cpf` | CPF | Identificação legal | Art. 7º, II; Art. 7º, III (obrigação legal) | 3 anos | Admin, Auditor | **Sim (CAMPOS_ENCRYPTA_OBRIGATORIO)** |
| `email` | E-mail | Comunicação contratual | Art. 7º, II; Art. 7º, V | 3 anos | Admin | Recomendado |
| `telefone` | Telefone | Contato emergência | Art. 7º, II; Art. 7º, V | 3 anos | Admin | Recomendado |

---

### 1.4 Documentos (`documentos`) e Vistoria (`vistorias`, `vistoria_anexo`)

| Campo | Tipo de Dado | Finalidade | Base Legal | Prazo Retenção | Quem Acessa | Criptografia |
|-------|---|----------|-----------|----------------|-----------|-------------|
| `cnpj_cpf_contraparte` | CNPJ/CPF | Identificação doc. fiscal | Art. 7º, II; III | 10 anos (contábil) | Admin, Auditor | Recomendado |
| `nome_contraparte` | Nome fornecedor/cliente | Identificação | Art. 7º, II | 10 anos (contábil) | Admin | Não verificado |
| `arquivo_nome` | Nome do arquivo PDF | Rastreabilidade | Art. 7º, II | 10 anos (contábil) | Admin | Sim (blob storage) |
| `vistoria_anexo.url_storage` | Fotos/documentos vistoria | Prova visual de danos | Art. 7º, II; IV (legítimo interesse) | 3 anos (prazo rescisão) | Admin, Proprietário | Sim (cloud storage com MFA) |

**Risco especial:** Fotos de vistoria podem conter rostos de locatários (PII biométrica)

---

### 1.5 Documentos Gerados (`documentos_gerados`)

| Campo | Tipo de Dado | Finalidade | Base Legal | Prazo Retenção | Quem Acessa | Criptografia |
|-------|---|----------|-----------|----------------|-----------|-------------|
| `nome_arquivo` | Nome do PDF (Laudo/RAD) | Rastreabilidade | Art. 7º, II | 10 anos (contábil) | Admin, Auditor, Judiciário | Sim (hash SHA256) |

---

### 1.6 Imovel (`imoveis`)

| Campo | Tipo de Dado | Finalidade | Base Legal | Prazo Retenção | Quem Acessa | Criptografia |
|-------|---|----------|-----------|----------------|-----------|-------------|
| `endereco` | Endereço completo | Identificação bem imóvel | Art. 7º, II | 10 anos (patrimônio) | Admin, Proprietário | Não verificado |
| `proprietario_nome` | Nome co-proprietário | Identificação legal (gestão 3ª) | Art. 7º, II | Enquanto gestão | Admin | Recomendado |
| `co_titular_nome` | Nome co-titular | Identificação legal | Art. 7º, II | Enquanto copropriedade | Admin, Cartório | Recomendado |

---

### 1.7 Log de Auditoria (`log_alteracoes`)

| Campo | Tipo de Dado | Finalidade | Base Legal | Prazo Retenção | Quem Acessa | Criptografia |
|-------|---|----------|-----------|----------------|-----------|-------------|
| `dados_anteriores` / `dados_novos` | JSON histórico | Trilha de auditoria | Art. 7º, III (obrigação legal) | Perpetuo (imutável por design) | Auditor, DPO, Judiciário | Sim (assinado digitalmente) |

**Nota crítica:** Contém snapshots de campos pessoais em texto JSON. Redação automática deve ser aplicada antes de logging (ver SEC-012 em logger-service.ts).

---

## 2. Integração com Criptografia Campo-a-Campo

**Arquivo:** `server/src/domain/encryption/field-level-encryption.ts`

**Campos Obrigatoriamente Encriptados (CAMPOS_ENCRYPTA_OBRIGATORIO):**
```
cpf, cnpj, email, telefone, numero_cartao, cvv, token_pagamento,
senha, chave_privada, token, api_key, secret_key, private_key
```

**Status verificado:**
- ✓ Criptografia ChaCha20-Poly1305 implementada
- ✓ Nonce aleatório de 12 bytes
- ✓ Tag de autenticação (Poly1305)
- ✗ **Versionamento de chave:** Não verificado. Envelope criptografado armazena `versao: 1` mas não armazena `key_id`. Ver Seção 3.1 (RIPD) para proposta de desenho.

---

## 3. Direitos do Titular: código existente, mas NÃO operacional

**Arquivo:** `server/src/routes/lgpd-routes.ts` (rotas `GET /api/lgpd/meus-dados`, `POST /api/lgpd/deletar-conta`, `GET /api/lgpd/acessos`)

**Verificado em 2026-10-03: nenhuma dessas rotas responde hoje.**
- ✗ `lgpd-routes.ts` **não é montado** em `server/src/index.ts` (só `assinatura-lgpd-routes` é).
- ✗ O arquivo importa `../domain/erp/compliance-audit-log`, que **não existe** em `server/src/` (só no cliente, `src/domain/erp/`); `lgpd-routes.test.ts` nem carrega por isso.

Portanto os direitos de acesso (Art. 18), exclusão/anonimização (Art. 17/18) e auditoria de acessos estão **escritos, mas não atendidos** na prática. Corrigir o import e montar o router é pré-requisito para qualquer afirmação de conformidade.

---

## 4. Lacunas e Recomendações

### 4.1 Direitos Não Implementados

| Direito LGPD | Artigo | Status | Ação |
|---|---|---|---|
| **Portabilidade** | 20 | Não implementado | Criar rota de exportação em formato estruturado (CSV/JSON) |
| **Correção** | 19 | Parcial | Rotas de atualização existem, mas sem auditoria de "antes/depois" visível ao titular |
| **Informação sobre compartilhamento** | 18 | Não implementado | Documentar e expor operadores (Asaas, Pluggy, RD Station) em `GET /api/lgpd/operadores` |
| **Limitação de uso** | 21 | Não implementado | Não há mecanismo de consentimento granular para cada finalidade |

### 4.2 Conflito Design: Direito ao Esquecimento vs. Guarda Contábil

**Problema:** Art. 17 (direito ao esquecimento) vs. Lei 8.934/1994 (guarda contábil obrigatória 10 anos)

**Solução proposta no código:**
```javascript
anonimizarAoExcluir: true,  // em CONFIG_LGPD_PADRAO
retencaoAposExclusao: 30,   // dias antes de hard delete
```

**Deficiência:** A tabela `transacoes` é imutável por design (registra trilha contábil). Hard delete 30 dias depois é insuficiente para contexto contábil.

**Recomendação:**
- Fazer **soft delete** (marcar `ativo = 0`, `data_delecao = NOW()`)
- **Anonimizar** campos PII (`nome → 'Titular Anonimizado'`, `cpf → NULL`, `email → NULL`)
- Manter `transacoes` intactas (razão imutável) mas com origem anonimizada
- Verificar com DPO se anonimização é reversível (se sim, não cumpre direito ao esquecimento)

### 4.3 Logs sem Redação

**Problema:** Antes de SEC-012 (redação de logs), logs do Winston continham PII em claro:
- CPF em mensagens de erro
- Tokens em Authorization headers
- E-mails em metadados

**Status:** ✓ **Resolvido em logger-service.ts** com redação automática em todas as mensagens

---

## 5. Operadores (Terceiros Processadores)

| Operador | Finalidade | Dados Processados | Contrato DPA |
|---|---|---|---|
| **Asaas** | Processamento de pagamentos | CPF, CNPJ, número conta, valores | Não verificado |
| **Pluggy** | Agregação de extratos bancários | Credenciais banco (intermediado) | Não verificado |
| **RD Station** (se integrado) | CRM/automação | E-mail, nome, histórico contato | Não verificado |
| **Cloud Storage** (AWS/GCP/Azure) | Armazenamento blobs vistoria | Fotos, PDFs, documentos digitalizados | Não verificado |

**Recomendação:** Coletar e publicar Data Processing Agreements (DPA) de cada operador.

---

## 6. Consentimento e Legitimidade

### 6.1 Atividades que dependem de consentimento (Art. 7º, V)
- E-mail do prestador (notificação OS)
- Telefone do locatário (contato emergência)
- Fotos de vistoria (prova visual)

**Status:** Não verificado. Rotas de criação de prestador/contrato não solicitam consentimento explícito.

### 6.2 Atividades com base em obrigação legal (Art. 7º, III)
- Guarda de transações (10 anos, contábil)
- Registro de alterações (`log_alteracoes`)
- Identificação de locatário/proprietário (Cartório, Receita Federal)

**Status:** ✓ Alinhado (trilha de auditoria em lugar).

---

## 7. Checklist de Compliance

- [ ] Revisar com advogado/DPO antes de produção
- [ ] Implementar Data Processing Agreements com operadores (Asaas, Pluggy)
- [ ] Implementar consentimento explícito para uso de email/telefone
- [ ] Criar rota de portabilidade (Art. 20)
- [ ] Criar rota de informação sobre operadores (Art. 18)
- [ ] Verificar se criptografia campo-a-campo está ativada em produção
- [ ] Auditar logs em produção para garantir que PII foi redatada (SEC-012)
- [ ] Documentar política de retenção de dados para cada finalidade
- [ ] Treinar equipe em LGPD e procedimento de DPA

---

## Referências

- Lei 13.709/2018 (LGPD)
- Lei 8.934/1994 (Guarda contábil)
- Lei 8.245/1991 (Lei do Inquilinato)
- Resolução Conselho Nacional de Justiça (CNJ) nº 65/2008 (Cartório)
