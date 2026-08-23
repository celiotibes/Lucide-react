# 🚀 Checklist de Produção — CRMT Marketing e Anúncios

**Objetivo**: Ativar sistema de leads automatizado em produção  
**Tempo Total**: ~1.5 horas  
**Status**: Pronto para iniciar

---

## 📋 FASE 1: Planilha Central (30 min)

### Passo 1.1: Criar nova Google Sheet
- [ ] Acesse https://sheets.google.com
- [ ] Clique "Novo Arquivo" → "Planilha"
- [ ] Renomeie: **"Central de Leads — CRMT Marketing e Anúncios 2026"**
- [ ] Copie o ID da URL (entre `/d/` e `/edit`)
- [ ] **Salve em local seguro** — você precisará deste ID depois

### Passo 1.2: Criar abas por propriedade
Crie 3 abas no mesmo arquivo (clique no "+" no rodapé):

**Aba 1: "Pottker 25"**
- [ ] Renomeie a aba de "Plan1" para "Pottker 25"

**Aba 2: "Milton Sullivan 142"**
- [ ] Clique "+" → "Planilha" → renomeie para "Milton Sullivan 142"

**Aba 3: "Ana Maria Nunes 214"**
- [ ] Clique "+" → "Planilha" → renomeie para "Ana Maria Nunes 214"

**Aba 4: "Leads"**
- [ ] Clique "+" → "Planilha" → renomeie para "Leads"

### Passo 1.3: Estruturar aba "Pottker 25"
Na célula A1, adicione este cabeçalho (linha 5):

```
Nº | Tipo | Área | Preço (R$) | Status | Locatário | Início Contrato | Avaliação | Dias Alugada
```

Depois, preencha as linhas 6+ com os dados:

| Nº | Tipo | Área | Preço | Status | Locatário | Início | Avaliação | Dias |
|---|---|---|---|---|---|---|---|---|
| 18 | 2 quartos | 50 m² | 2699 | Alugada | — | — | — | — |
| 2 | 2 quartos | 50 m² | 2699 | Alugada | — | 23/08/2026 | — | 0 |
| 17 | 2 quartos | 50 m² | 2699 | Vacante | — | — | — | — |
| 1 | 1 quarto | 22 m² | 1950 | Vacante | — | — | — | — |

- [ ] Preenchida a aba "Pottker 25"

### Passo 1.4: Estruturar aba "Milton Sullivan 142"

| Nº | Tipo | Área | Preço | Status | Locatário | Início | Avaliação | Dias |
|---|---|---|---|---|---|---|---|---|
| 1 | 1-2 quartos | 30 m² | 1950 | Vacante | — | — | — | — |
| 2 | 1-2 quartos | 30 m² | 1950 | Vacante | — | — | — | — |
| 3 | 1-2 quartos | 30 m² | 1950 | Vacante | — | — | — | — |

- [ ] Preenchida a aba "Milton Sullivan 142"

### Passo 1.5: Estruturar aba "Ana Maria Nunes 214"

| Nº | Tipo | Área | Preço | Status | Locatário | Início | Avaliação | Dias |
|---|---|---|---|---|---|---|---|---|
| 1 | 1 quarto | 35 m² | 1850 | Alugada | — | — | — | — |
| 2 | 2 quartos | 55 m² | 2200 | Alugada | — | — | — | — |
| 3 | 3 quartos | 80 m² | 2800 | Alugada | — | — | — | — |

- [ ] Preenchida a aba "Ana Maria Nunes 214"

### Passo 1.6: Estruturar aba "Leads"
Adicione colunas (linha 4):

| A | B | C | D | E | F | G | H | I | Q |
|---|---|---|---|---|---|---|---|---|---|
| ID | Data Entrada | Nome | WhatsApp | Canal | Público | Unidade | Status | Último Contato | Alerta Enviado |

- [ ] Aba "Leads" criada com cabeçalho

---

## 🔐 FASE 2: Google Apps Script (20 min)

### Passo 2.1: Abrir Apps Script
- [ ] No Google Sheet, clique "Extensões" (menu superior)
- [ ] Selecione "Apps Script"
- [ ] Abrirá uma aba nova no editor

### Passo 2.2: Copiar código
- [ ] Abra o arquivo `/marketing-system/scripts/AppsScript.gs` neste repositório
- [ ] Copie TODO o código
- [ ] Cole no editor do Google Apps Script (apague "function myFunction() { }")
- [ ] Clique "Salvar" (Ctrl+S)

### Passo 2.3: Atualizar variáveis (IMPORTANTE)
No topo do script, procure por:

```javascript
var OPERATOR_EMAIL = "celiotibes@gmail.com";
var PLANILHA_CENTRAL_ID = "1wFoUCZaRPk2V1WbWyI0V4N5EC2yIZb2CNviOCPizaOQ";
```

- [ ] Deixe `OPERATOR_EMAIL = "celiotibes@gmail.com"` (seu email)
- [ ] Substitua `PLANILHA_CENTRAL_ID` pelo ID que você copiou no Passo 1.1

### Passo 2.4: Configurar Gatilhos (Triggers)
- [ ] No editor Apps Script, clique o ícone de **Relógio** (Acionadores) → esquerda
- [ ] Clique "+ Adicionar acionador"
- [ ] Configure 4 gatilhos:

**Gatilho 1: checkSLA**
- Função: `checkSLA`
- Tipo evento: Baseado em tempo → Temporizador por **minutos**
- Frequência: A cada **5 minutos**
- [ ] Criar

**Gatilho 2: checkFollowUps**
- Função: `checkFollowUps`
- Tipo evento: Baseado em tempo → Temporizador por **horas**
- Frequência: A cada **1 hora**
- [ ] Criar

**Gatilho 3: checkReviewRequests**
- Função: `checkReviewRequests`
- Tipo evento: Baseado em tempo → Temporizador **diário**
- Frequência: Uma vez por dia (qualquer horário)
- [ ] Criar

**Gatilho 4: onEditLeadsSheet** (IMPORTANTE)
- Função: `onEditLeadsSheet`
- Tipo evento: **Da planilha** → **Ao editar**
- [ ] Criar

- [ ] Todos 4 gatilhos configurados

### Passo 2.5: Testar (Opcional)
- [ ] Volta no editor, menu "Executar" → selecione `checkSLA`
- [ ] Clique ▶️ (Run) — vai enviar um e-mail para você de teste
- [ ] Verifique seu email para confirmar que funcionou

- [ ] AppsScript testado

---

## 📱 FASE 3: Deploy Landing Page (15 min)

### Passo 3.1: Preparar arquivo
- [ ] Abra `/marketing-system/landing/index.html` neste repositório
- [ ] **NÃO altere nada** — já está com dados reais integrados

### Passo 3.2: Deploy em Netlify
- [ ] Acesse https://netlify.com
- [ ] Faça login (ou crie conta)
- [ ] Clique "New site from Git"
- [ ] Selecione repositório: `celiotibes/Lucide-react`
- [ ] Branch: `claude/marketing-strategy-tool-dtbhvi`
- [ ] Build command: (deixe vazio)
- [ ] Publish directory: `marketing-system/landing`
- [ ] Clique "Deploy"
- [ ] Aguarde ~2 min até "Live"

- [ ] Landing page em produção

**URL da Landing**: Netlify te dará um domínio tipo `https://xxxxx.netlify.app`  
Ou você pode usar domínio próprio via CNAME.

### Passo 3.3: Validar links
- [ ] Abra a URL da landing em navegador
- [ ] Clique no botão "Ver unidades disponíveis no WhatsApp"
- [ ] Deve abrir WhatsApp com mensagem pré-pronta
- [ ] Verifique que o número (41) 4042-5242 está correto

- [ ] Links WhatsApp testados

---

## 📊 FASE 4: Deploy Dashboard (10 min)

### Passo 4.1: Preparar arquivo
- [ ] Abra `/marketing-system/dashboard/painel.html`
- [ ] Procure por: `const SHEET_ID = "..."`
- [ ] Substitua pela ID da sua Planilha Central (do Passo 1.1)

### Passo 4.2: Deploy em Netlify
- [ ] Volte em Netlify
- [ ] Crie "New site from Git" (ou use mesmo site, mudando diretório)
- [ ] Repositório: `celiotibes/Lucide-react`
- [ ] Branch: `claude/marketing-strategy-tool-dtbhvi`
- [ ] Build command: (deixe vazio)
- [ ] Publish directory: `marketing-system/dashboard`
- [ ] Clique "Deploy"

- [ ] Dashboard em produção

**URL do Dashboard**: Netlify dará um novo domínio

### Passo 4.3: Testar com dados
- [ ] Abra a URL do dashboard
- [ ] Verifique se aparecem os gráficos de ocupação
- [ ] Os números devem corresponder ao que você preencheu na Planilha Central

- [ ] Dashboard testado com dados reais

---

## ✅ FASE 5: Validação Final (10 min)

### Teste 1: Lead Manual
- [ ] Volte no Google Sheet "Leads"
- [ ] Adicione um lead de teste na linha 5:
  - ID: 1
  - Data Entrada: 23/08/2026 08:00
  - Nome: "Teste Lead"
  - WhatsApp: 41991234567
  - Canal: Website
  - Público: Estudante
  - Unidade: "Pottker 25 - APTO 17"
  - Status: "Novo"

- [ ] Aguarde 6 minutos
- [ ] Verifique seu e-mail — deve ter recebido alerta SLA

- [ ] Sistema de SLA testado

### Teste 2: Sincronização Reversa
- [ ] No mesmo lead, mude Status de "Novo" para "Fechado"
- [ ] Aguarde alguns segundos
- [ ] Verifique seu e-mail — deve ter confirmação de sincronização
- [ ] Volte na aba "Pottker 25" e veja se APTO 17 virou "Alugada"

- [ ] Sincronização reversa testada

### Teste 3: Visualização Dashboard
- [ ] Abra URL do dashboard
- [ ] Taxa de ocupação deve ter subido (era 5/10 = 50%, agora deve ser 6/10 = 60%)

- [ ] Dashboard refletindo mudanças em tempo real

---

## 🎯 Resumo Final

| Item | Status | Responsável | Prazo |
|------|--------|-------------|-------|
| Planilha Central criada | ☐ | Você | Hoje |
| AppsScript instalado e testado | ☐ | Você | Hoje |
| Landing page em produção | ☐ | Você | Hoje |
| Dashboard em produção | ☐ | Você | Hoje |
| Testes de funcionamento | ☐ | Você | Hoje |
| **Sistema GO LIVE** | ☐ | Você | **Hoje** |

---

## 🆘 Problemas Frequentes

**Problema**: AppsScript não envia e-mail no teste  
**Solução**: Verifique se o email em `OPERATOR_EMAIL` é o seu. Clique em "Consentimento" e autorize seu próprio acesso.

**Problema**: Dashboard não mostra dados  
**Solução**: Verifique se o `SHEET_ID` está correto e se a Planilha Central tem dados preenchidos.

**Problema**: Links WhatsApp não funcionam  
**Solução**: Verifique se o número de telefone no HTML é (41) 4042-5242 ou corrija com o número certo.

---

**Sistema CRMT pronto para escalar!** 🚀  
Próximo passo: Monitorar leads vindos do site e otimizar campanhas de marketing.
