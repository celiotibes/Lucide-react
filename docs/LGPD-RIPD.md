# LGPD - Relatório de Impacto à Proteção de Dados (RIPD)

**RASCUNHO TÉCNICO** — requer revisão de advogado/DPO; não constitui parecer jurídico.

**Data de elaboração:** 2026-10-03  
**Escopo:** Reconstituição contábil e gestão de imóveis em atividade de locação  
**Responsável pela descrição:** Análise de código (schema.sql, migrations, logger-service.ts, field-level-encryption.ts)

---

## 1. Identificação do Processamento

**Nome do sistema:** Reconstituição Contábil Histórica (CRMT)

**Categorias principais de dados pessoais:**
- CPF, CNPJ (identificação fiscal)
- Dados bancários (número conta, agência, banco)
- E-mail, telefone (contato)
- Endereço (localização bem imóvel)
- Fotos/documentos de vistoria (dados biométricos indiretos)
- Histórico de alterações (log_alteracoes, transações)

**Finalidades:**
1. Execução de contratos de locação (Art. 7º, II LGPD)
2. Obrigações legais de guarda contábil (Art. 7º, III LGPD)
3. Comunicações com locatários, proprietários, prestadores (Art. 7º, V LGPD)
4. Auditoria e compliance fiscal (Art. 7º, III LGPD)

---

## 2. Análise de Riscos

### 2.1 Risco 1: Acesso Indevido a Dados Bancários

**Severidade:** CRÍTICA  
**Probabilidade:** MÉDIA

**Descrição:**
- Tabela `contas_bancarias` armazena `numero` e `agencia` em claro
- Não verificado se há criptografia de campo implementada em produção
- Campo `titular` identifica o proprietário
- Acesso a estes dados permite replicação de fraude (transferências, empréstimos falsificados)

**Materialização:**
- SQL injection contra tabela `contas_bancarias`
- Acesso de usuário administrativo malicioso
- Backup não-criptografado deixado em local acessível
- API key exposta em repositório (git history)

**Impacto:**
- Exposição de múltiplas contas bancárias (locatários, proprietários, administradores)
- Perda de confidencialidade de dados sensíveis
- Potencial fraude financeira
- Notificação obrigatória à Autoridade Nacional (ANPD) e aos titulares

**Medidas Existentes:**
- ✗ Criptografia field-level: não verificado se ativado em produção
- ✓ Winston logger com redação automática de CPF, CNPJ, e-mail, telefone, tokens e senhas (SEC-012); não cobre números de conta bancária
- ✗ Controle de acesso: não verificado (assumir que existe via app/API authentication)

**Medidas Recomendadas:**
1. **Ativar obrigatoriamente** criptografia ChaCha20-Poly1305 para `contas_bancarias.numero` e `.agencia`
2. Implementar **versionamento de chave** (ver Seção 2.6)
3. Implementar auditoria de leitura para `contas_bancarias` (quem acessou, quando)
4. Rotação trimestral de Master Key (MK)
5. Testes periódicos de recuperação sem Master Key (garantir irreversibilidade)

---

### 2.2 Risco 2: Vazamento de Dados em Logs

**Severidade:** ALTA  
**Probabilidade:** ALTA (antes de SEC-012)

**Descrição:**
- Logs Winston/arquivo podem conter CPF, CNPJ, email em texto plano
- Desenvolvedores compartilham logs para debug sem sanitização
- Logs ficam acessíveis em máquinas de desenvolvimento
- Backup de logs + banco dados = exposição completa de PII

**Materialização:**
- Desenvolvedor faz `tail -f app.log` e vê CPF: `123.456.789-01`
- Arquivo `.log` deixado em repositório git (git history persiste)
- Logs enviados para sistemas de monitoring (DataDog, Splunk) sem redação
- Log de erro com stack trace contendo CPF em contexto (variável)

**Impacto:**
- Titulares não descobrem vazamento (é "apenas" log, não banco)
- Compilação de logs públicos em rede = base de dados de CPF
- Reutilização de CPF em ataques de engenharia social
- Dificuldade de detectar escopo do vazamento (quantos logs vazaram?)

**Medidas Existentes:**
- ✓ **SEC-012:** Redação automática em logger-service.ts
  - Mascara CPF: `***.***.***-NN`
  - Mascara CNPJ: `**.***.***/****-NN`
  - Mascara email: `X***@dominio`
  - Mascara telefone: `(**) *****-NNNN`
  - Mascara tokens/senhas: `[REDACTED]`
  - Suporta objetos aninhados, arrays, Errors, ciclos
- ✓ Testes vitest cobrindo todos os casos (46 testes)

**Medidas Recomendadas:**
1. Estender redação para **sistemas de monitoring externo** (middleware)
2. Implementar **log retention policy** (ex: 30 dias, exceto audit logs = indefinido)
3. Criptografar arquivos `.log` em repouso
4. Auditar git history para logs já comitados (ferramentas: `trufflehog`, `git-secrets`)
5. Treinamento de equipe: nunca fazer `printf` / `console.log` de CPF/token em código (usar `log.redactarObjeto()`)

---

### 2.3 Risco 3: Vazamento de Fotos de Vistoria (Dados Biométricos Indiretos)

**Severidade:** CRÍTICA  
**Probabilidade:** MÉDIA

**Descrição:**
- Tabela `vistoria_anexo` armazena referências a fotos de imóvel
- Fotos podem incidentalmente conter rostos de locatários, assinaturas, documentos de identidade
- URL em `url_storage` é gerada por sistema cloud (AWS S3, GCP, Azure)
- Política de acesso ao storage não verificada

**Materialização:**
- Enumeração de URLs (S3 buckets são enumeráveis sem autenticação se politicamente aberto)
- Compartilhamento de URL em email (redireciona a terceiros)
- Expiração de token de acesso muito longa (24h, 7 dias, indefinido)
- Backup do banco + URLs = exposição de todas as fotos

**Impacto:**
- Identificação visual de locatários (rosto em foto de vistoria)
- Vazamento de dados biométricos de facto (rosto ≈ dado biométrico)
- Contas ANPD: biométrica é dado especialmente sensível (Art. 5º, II LGPD)
- Reutilização em deep fakes, OSINT, assédio

**Medidas Existentes:**
- Criptografia em repouso do storage de fotos: **não verificada** (provedor e configuração desconhecidos)
- MFA no acesso ao storage: **não verificado**
- ✗ Política de acesso ao bucket de storage: não verificada
- ✗ Expiração de presigned URLs: não verificada

**Medidas Recomendadas:**
1. Implementar **política de armazenamento** (S3 ACL, GCP IAM):
   - Bucket privado (nenhum acesso público)
   - Presigned URLs com **expiração de 15 minutos** (máximo)
   - IP whitelist para servidores da aplicação
2. Implementar **pseudonimização de fotos**:
   - Desfocar rosto antes de armazenar (Computer Vision API)
   - OU anonimizar documento de identidade (bloquear texto)
3. Audit log de acesso ao storage (quem downloadou, quando)
4. Treinar usuários: **não fazer download de vistoria para email** (compartilhar link expirado em vez de arquivo)

---

### 2.4 Risco 4: Retenção Excessiva + Conflito Direito ao Esquecimento

**Severidade:** ALTA  
**Probabilidade:** ALTA

**Descrição:**
- Lei 8.934/1994 obriga guarda de livros contábeis por 10 anos
- LGPD Art. 17 reconhece direito ao esquecimento (soft delete + hard delete)
- CONFIG_LGPD_PADRAO define `retencaoAposExclusao: 30` dias
- 30 dias é **insuficiente** para contexto contábil (auditoria externa, Receita Federal)
- Tabela `log_alteracoes` é perpetua (imutável por design) — nunca é deletada

**Materialização:**
- Locatário exerce direito ao esquecimento
- 30 dias depois, transações são deletadas hard
- Auditoria fiscal (5º ano) detecta lacuna no razão: não há transação
- Resposta: "foi deletada a pedido do titular" = insuficiente para conformidade fiscal

**Impacto:**
- Conflito legal: obrigação contábil vs. direito LGPD
- Potencial rejeição de auditoria independente (pista de adulteração)
- Multa LGPD (até 2% de faturamento) + multa fiscal (alteração de livros)

**Medidas Existentes:**
- Soft delete e anonimização existem **no código** de `lgpd-routes.ts` (`ativo = 0`, nome → "Usuário Deletado", cpf → NULL), mas essa rota **não está montada** no servidor (ver inventário, seção 3): hoje não há como acioná-las
- Ao aplicar anonimização, o razão contábil NÃO pode ser apagado dentro do prazo legal (é imutável por design): anonimizar o titular, não excluir os lançamentos
- ✗ Hard delete é apenas software (banco pode restaurar de backup)
- ✗ Retenção legal não está documentada

**Medidas Recomendadas:**
1. **Revisar com DPO + advogado** escopo do "direito ao esquecimento":
   - Aplica-se a transações contábeis? (provável que NÃO - Art. 17 admite exceções)
   - Aplica-se a dados operacionais (email, telefone)? (SIM)
2. Implementar **política diferenciada:**
   - **Dados operacionais** (email, telefone, endereço): hard delete 30 dias após soft delete
   - **Dados contábeis** (transações, razão): anonimizar apenas (hard delete nunca)
   - **Log de auditoria** (`log_alteracoes`): perpetuo (requerido por lei)
3. Publicar **Manifest de Retenção** (por finalidade):
   ```
   Dados de Locação:
   - Durante contrato: manutenção normal
   - Após término: 3 anos (prazo para ação de cobrança)
   - Anonimizar PII após 3 anos, manter transações por 10 anos (contábil)
   ```
4. Implementar **"criptografia de apagamento"** para dados não-contábeis:
   - Hard delete = overwrite com random bytes (evita recuperação via forensics)

---

### 2.5 Risco 5: Operadores Terceirizados sem Contrato DPA

**Severidade:** ALTA  
**Probabilidade:** ALTA

**Descrição:**
- Asaas (processamento de pagamentos): acessa CPF, CNPJ, número conta
- Pluggy (agregação de extratos): acessa credenciais bancárias (intermediadas)
- Possivelmente RD Station (CRM): acessa email
- Data Processing Agreements (DPA) não verificados

**Materialização:**
- Operador é comprometido (ex: funcionário malicioso da Asaas)
- Operador não tem política LGPD (dados retidos indefinidamente)
- Operador transfere dados para terceira empresa (sub-processor sem aviso)
- ANPD auditoria: "vocês têm DPA com Asaas?" → Resposta: "não" = multa

**Impacto:**
- Responsabilidade solidária do controlador (CRMT) pelo operador
- Violação Art. 28 LGPD (obrigação de DPA)
- Multa até 2% de faturamento

**Medidas Existentes:**
- ✗ Nenhuma verificada

**Medidas Recomendadas:**
1. Solicitar **DPA assinado** de cada operador (Asaas, Pluggy, etc.)
2. Verificar no DPA:
   - Criptografia em repouso e em trânsito
   - Retenção de dados: quanto tempo após cancelamento?
   - Sub-processors: são mencionados e consentidos?
   - Notificação de breach: qual é o SLA (Service Level Agreement)?
3. Implementar **matriz de operadores** (tabela público no sistema):
   ```
   GET /api/lgpd/operadores → [
     { nome: "Asaas", dados: "CPF, CNPJ, conta", dpa_vigente: "2026-01-15" },
     ...
   ]
   ```
4. Auditoria anual de conformidade de cada operador

---

### 2.6 Risco 6: Ausência de Versionamento de Chaves Criptográficas

**Severidade:** ALTA  
**Probabilidade:** ALTA

**Descrição:**
- Field-level encryption implementado (`field-level-encryption.ts`)
- Chave única (Master Key) criptografa todos os CPFs, CNPJs, emails
- Envelope criptografado contém `versao: 1` mas NÃO contém `key_id`
- Se Master Key é comprometida, todos os dados históricos são descriptografáveis
- Rotação de chave não é possível (como descriptografar dados antigos com chave nova?)

**Materialização:**
- Auditoria de segurança descobre que Master Key foi exposta (ex: em repo privado)
- CRMT quer rotacionar chave para chave nova
- Mas como descriptografar dados antigos com chave nova? Não há mapeamento
- Opção 1 (péssima): Manter chave antiga forever = risco perpetuo
- Opção 2 (custosa): Re-encriptação em lote com ambas as chaves = complexo

**Impacto:**
- Incapacidade de mitigar impacto de vazamento de chave
- Retenção indefinida de risco (dados criptografados com chave comprometida)

**Medidas Existentes:**
- ✓ ChaCha20-Poly1305 implementado (bom algoritmo)
- ✗ Versionamento de chave: não implementado

**Medidas Recomendadas (Desenho Proposto, SEM IMPLEMENTAÇÃO):**

**1. Alterar envelope criptografado:**
```typescript
interface DadosCriptografados {
  key_id: string;       // novo: uuid ou versão, ex: "2026-q4"
  algoritmo: string;    // "chacha20-poly1305"
  iv: string;           // nonce (12 bytes hex)
  conteudo: string;     // criptografado (hex)
  tag: string;          // auth tag (hex)
  versao: number;       // manter compatibilidade (agora sempre 2)
}
```

**2. Manter múltiplas chaves em memoria/KMS:**
```typescript
const CHAVES: Record<string, Buffer> = {
  "2025-q4": Buffer.from(...),  // chave ativa (nova)
  "2025-q3": Buffer.from(...),  // chave antiga (deprecada)
};
const CHAVE_ATIVA = "2025-q4";  // indicador de qual usar para novos dados
```

**3. Processo de descriptografia:**
```typescript
function descriptografar(dados: DadosCriptografados): string {
  const chave = CHAVES[dados.key_id];
  if (!chave) throw new Error(`Chave ${dados.key_id} não encontrada`);
  // ... descriptografar com chave específica
}
```

**4. Rotação de chave (re-encriptação em lote):**
- Batch job noturno (off-peak)
- Iterar sobre todas as linhas com PII encriptada
- Descriptografar com chave antiga (dados.key_id)
- Re-encriptação com chave nova (CHAVE_ATIVA)
- Atualizar `key_id` para nova versão
- Logging + auditoria de re-encriptação
- Manter chave antiga em escrowed (HSM/Vault) por 90 dias, depois destruir

**5. KMS (Key Management Service):**
- Integração com AWS KMS, Azure Key Vault, ou HashiCorp Vault
- Master Key nunca reside em aplicação (sempre no KMS)
- KMS audita todas as operações de desencriptação
- Rotação automática de chaves (ex: trimestral)

---

## 3. Avaliação de Impacto

| Risco | Severidade | Probabilidade | Risco Residual | Prioridade |
|-------|------------|---------------|----------------|-----------|
| 1. Acesso indevido a banco | CRÍTICA | MÉDIA | ALTA | **IMEDIATA** |
| 2. Vazamento em logs | ALTA | ALTA (antes SEC-012) | MÉDIO (pós-SEC-012) | MÉDIA |
| 3. Vazamento fotos vistoria | CRÍTICA | MÉDIA | ALTA | **IMEDIATA** |
| 4. Retenção excessiva | ALTA | ALTA | ALTA | **IMEDIATA** |
| 5. Sem DPA operadores | ALTA | ALTA | ALTA | **IMEDIATA** |
| 6. Sem versioning chaves | ALTA | ALTA | ALTA | MÉDIA (pendente implementação) |

---

## 4. Medidas Implementadas vs. Pendentes

### ✓ Implementadas
- [x] Redação automática de PII em logs (SEC-012, logger-service.ts)
- [x] Testes vitest de redação (42 testes)
- [x] Criptografia ChaCha20-Poly1305 (field-level-encryption.ts)
- [x] Soft delete com anonimização (lgpd-routes.ts)
- [x] Auditoria de alterações (log_alteracoes)

### ⚠ Pendentes
- [ ] Verificar ativação de field-level encryption em produção
- [ ] Implementar versionamento de chaves (KMS)
- [ ] Criar Data Processing Agreements com operadores
- [ ] Implementar política de retenção diferenciada (operacional vs. contábil)
- [ ] Pseudonimização de fotos (desfocar rosto)
- [ ] Auditoria de acesso a cloud storage
- [ ] Implementar portabilidade (Art. 20)
- [ ] Implementar informação sobre operadores (Art. 18)
- [ ] Consentimento explícito para email/telefone (Art. 7º, V)

---

## 5. Conclusão

**Risco Geral:** ALTO

A aplicação implementa **estrutura de compliance** básica (redação de logs, soft delete, auditoria), mas **falha em riscos críticos:**
- Dados bancários potencialmente em claro
- Fotos de vistoria acessíveis (rosto = biométrica)
- Ausência de DPA com operadores
- Conflito legal retenção vs. direito ao esquecimento

**Recomendação:** 
1. **Resolver imediatamente** riscos 1, 3, 4, 5
2. Revisar com DPO e advogado especializado em LGPD
3. Implementar versionamento de chaves antes de escalar produção
4. Treinar equipe em LGPD

**Próximo passo:** Agendamento com DPO/Escritório de advocacia para validação deste RIPD.

---

## Apêndice: Versionamento de Chaves — Desenho Técnico Resumido

**Sem implementação neste documento. Apenas proposta de arquitetura.**

```
┌─────────────────────────────────────────────────────┐
│                 KMS (AWS/Vault)                      │
│  ┌──────────────────────────────────────────────┐   │
│  │  2025-Q4 (ATIVO): ed25519... [destruir em Jan]  │
│  │  2025-Q3 (OLD):   2d41a9... [destruir em Out]   │
│  │  2025-Q2 (OLD):   7c...     [destruir em Jul]   │
│  └──────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────┘
                        ↑
                        │ (DESC apenas)
                        │
         ┌──────────────┴──────────────┐
         ↓                             ↓
    [APP Memory]               [Batch Re-encrypt Job]
    CHAVE_ATIVA = 2025-Q4
    (para novos dados)
         │
         │ (new data)
         ↓
    ┌──────────────┐
    │ (cpf: "XXX", │
    │  key_id: Q4,  │ ← Envelope criptografado
    │  iv, tag, ...)│
    └──────────────┘
         │
         │ (nightly)
         ↓
    Batch job:
    1. Read: key_id=Q3, decrypt com Q3, re-encrypt com Q4
    2. Update: key_id → Q4
    3. Delete Q3 após 90 dias
```

Isso garante:
- ✓ Rotação de chave possível
- ✓ Dados antigos recuperáveis (audit trail)
- ✓ Impacto de vazamento limitado (máximo 1 trimestre de dados)

---
