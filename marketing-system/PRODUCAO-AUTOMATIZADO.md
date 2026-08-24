# 🚀 Produção Automatizada — CRMT

Eu automatizei o máximo possível. Aqui está o que VOCÊ faz manualmente (20-30 min total).

---

## ✅ Ações Automáticas (já feitas)

- ✅ Landing page atualizada com dados reais
- ✅ Dashboard estruturado
- ✅ AppsScript.gs pronto
- ✅ Scripts de geração de dados criados
- ✅ Script de deploy configurado

---

## 🎯 Ações Manuais — Só o Essencial

### FASE 1: Planilha Central Google Sheets (10 min)

**Passo 1.1: Gerar dados estruturados**
```bash
python3 marketing-system/scripts/gerar-planilha.py
```

Isso gera uma tabela pronta para copiar/colar. Copie a saída TSV (formato tabela).

**Passo 1.2: Criar Planilha no Google**
1. Acesse https://sheets.google.com
2. Clique "Novo Arquivo" → "Planilha"
3. Renomeie: **"Central de Leads — CRMT Marketing e Anúncios 2026"**
4. Copie o **ID da URL** (entre `/d/` e `/edit`) — você vai precisar dele

**Passo 1.3: Preencher dados**
1. Crie 4 abas: "Pottker 25", "Milton Sullivan 142", "Ana Maria Nunes 214", "Leads"
2. Cola os dados gerados no script em cada aba
3. **Aba "Leads"** → cria cabeçalho na linha 4:
   ```
   ID | Data Entrada | Nome | WhatsApp | Canal | Público | Unidade | Status | Último Contato | Alerta Enviado
   ```

**Passo 1.4: Copiar ID da Planilha**
- Salve a planilha
- Copie o ID (URL vai ter: `/d/COLEFAQUI/edit`)
- Guarde esse ID

---

### FASE 2: Google Apps Script (5 min)

**Passo 2.1: Abrir Apps Script**
1. Na Planilha Central, clique "Extensões" (menu superior)
2. Selecione "Apps Script"
3. Abrirá aba nova

**Passo 2.2: Colar código**
1. Abra `marketing-system/scripts/AppsScript.gs`
2. Copie TODO o código
3. Cole no editor (limpe o código padrão)
4. Salve (Ctrl+S)

**Passo 2.3: Atualizar variável (IMPORTANTE)**
No topo do código, procure por:
```javascript
var PLANILHA_CENTRAL_ID = "1wFoUCZaRPk2V1WbWyI0V4N5EC2yIZb2CNviOCPizaOQ";
```

Substitua `1wFoUCZaRPk2V1...` pelo ID que você copiou no Passo 1.4

**Passo 2.4: Criar Gatilhos**
1. Clique ícone de **Relógio** (Acionadores) → esquerda
2. Clique "+ Adicionar acionador"
3. Crie 4:

| Função | Tipo Evento | Frequência |
|--------|-----------|-----------|
| checkSLA | Temporizador por minutos | A cada 5 minutos |
| checkFollowUps | Temporizador por horas | A cada 1 hora |
| checkReviewRequests | Temporizador diário | Uma vez por dia |
| onEditLeadsSheet | Da planilha → Ao editar | (sem frequência) |

**Passo 2.5: Testar (Opcional)**
- Menu "Executar" → selecione `checkSLA`
- Clique ▶️
- Você receberá um e-mail de teste em alguns segundos

---

### FASE 3: Deploy Landing + Dashboard (5 min)

**Passo 3.1: Instalar Netlify CLI**
```bash
npm install -g netlify-cli
```

**Passo 3.2: Login no Netlify**
```bash
netlify login
```

Abrirá navegador — faça login (ou crie conta se novo)

**Passo 3.3: Executar Deploy**
```bash
bash marketing-system/scripts/deploy-producao.sh
```

Escolha:
- Opção 1: Deploy só da landing page
- Opção 2: Deploy só do dashboard
- Opção 3: Deploy de ambos (recomendado)

Isso vai:
- Fazer upload dos arquivos para Netlify
- Gerar URLs públicas para landing e dashboard
- Deixar tudo ao vivo

---

### FASE 4: Validação Final (5 min)

**Passo 4.1: Testar Landing**
1. Abra a URL da landing que Netlify te deu
2. Clique "Ver unidades disponíveis no WhatsApp"
3. Verifique se abre WhatsApp com número (41) 4042-5242

**Passo 4.2: Testar Dashboard**
1. Abra a URL do dashboard
2. Verifique se aparecem os gráficos com dados

**Passo 4.3: Testar SLA**
1. Volte na Planilha Central → aba "Leads"
2. Adicione um lead de teste:
   ```
   ID: 1
   Data Entrada: [data/hora de agora]
   Nome: Teste Lead
   WhatsApp: 41991234567
   Canal: Website
   Público: Estudante
   Unidade: Pottker 25 - KITNET 06
   Status: Novo
   ```
3. Aguarde 6 minutos
4. Verifique seu e-mail — deve ter alerta SLA

---

## 📊 Resumo de Tempo

| Ação | Tempo |
|------|-------|
| Gerar dados (script) | 1 min |
| Criar Planilha + preencher | 5 min |
| Apps Script + gatilhos | 10 min |
| Deploy (Netlify) | 5 min |
| Testes | 5 min |
| **TOTAL** | **~25-30 min** |

---

## 🎉 Pronto!

Sistema CRMT 100% operacional, capturando leads, enviando alertas, sincronizando dados em tempo real.

**Próximos passos**:
- Monitorar leads vindos do site
- Otimizar CTAs baseado em performance
- Escalar campanhas de marketing

---

## 🆘 Problemas?

**Script Python não funciona**
```bash
# Instale dependências
pip install -r requirements.txt  # (ou só python3 — script não tem dependências)
python3 marketing-system/scripts/gerar-planilha.py
```

**Netlify CLI não funciona**
```bash
npm install -g netlify-cli
netlify login
```

**Apps Script não envia e-mail**
- Verifique se `OPERATOR_EMAIL` está correto (seu email)
- Clique "Consentimento" e autorize acesso

---

**Sistema ready! 🚀**
