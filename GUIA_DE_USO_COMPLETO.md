# Guia de Uso - CRMT Histórico Contábil & Financeiro

Bem-vindo! Este guia mostra como usar cada funcionalidade do sistema passo-a-passo.

## Índice

1. [Primeira Vez: Fazer Login](#primeira-vez-fazer-login)
2. [Dashboard Principal](#dashboard-principal)
3. [DRE - Demonstração de Resultado](#dre---demonstração-de-resultado)
4. [Fluxo de Caixa e Previsões](#fluxo-de-caixa-e-previsões)
5. [Margens por Propriedade](#margens-por-propriedade)
6. [Integração Bancária (Pluggy)](#integração-bancária-pluggy)
7. [Cobrança via Asaas](#cobrança-via-asaas)
8. [Reembolsos de Despesas](#reembolsos-de-despesas)
9. [Lembretes de Vencimento](#lembretes-de-vencimento)
10. [Detecção de Anomalias](#detecção-de-anomalias)
11. [FAQ e Troubleshooting](#faq-e-troubleshooting)

---

## Primeira Vez: Fazer Login

### Acessar o Sistema

1. Abra no navegador: `http://localhost:5173` (desenvolvimento) ou `https://seudominio.com` (produção)
2. Tela de login aparece automaticamente

### Criar Usuário Inicial (Apenas uma vez)

Se o sistema está vazio, o primeiro usuário é o **titular** (administrador):

```bash
# Via terminal (backend rodando em localhost:3000)
curl -X POST http://localhost:3000/api/auth/bootstrap \
  -H "Content-Type: application/json" \
  -H "X-API-Key: sua_api_key_aqui" \
  -d '{
    "email": "admin@minhaempresa.com",
    "senha": "SenhaForte123!",
    "nome": "João Silva"
  }'
```

**Resposta esperada:**
```json
{
  "token": "eyJhbGc...",
  "usuario": {
    "id": "user_123",
    "email": "admin@minhaempresa.com",
    "nome": "João Silva",
    "papel": "titular"
  }
}
```

### Fazer Login

1. Digite seu email e senha
2. Clique em **"Entrar"**
3. Se sucesso → Dashboard aparece
4. Se erro → Verifique:
   - Email correto?
   - Senha correta?
   - Servidor backend rodando? (http://localhost:3000/api/health)

---

## Dashboard Principal

Tela inicial com resumo de tudo que importa.

### Componentes do Dashboard

```
┌─────────────────────────────────────────────┐
│  Dashboard - Outubro/2026                   │
├─────────────────────────────────────────────┤
│                                             │
│  [KPI] Receita Mês: R$ 45.320               │
│  [KPI] Despesas: R$ 12.100                  │
│  [KPI] Lucro Líquido: R$ 33.220             │
│  [KPI] Aluguel a Receber: R$ 8.500          │
│                                             │
│  Gráficos:                                  │
│  - Evolução Receita (últimos 12 meses)      │
│  - Composição Despesas (pizza)              │
│  - Fluxo de Caixa Projetado (próximos 30d) │
│  - Rentabilidade por Propriedade (ranking)  │
│                                             │
│  Alertas:                                   │
│  ⚠ Cobrança pendente: 3 aluguéis            │
│  📅 Vencimento próximo: contrato imóvel A   │
│  🔍 Anomalia: transação de R$ 15k em 5min  │
│                                             │
└─────────────────────────────────────────────┘
```

### Navegação Lateral

Clique em cada seção para detalhar:

- **Relatórios** → DRE, Executivo, Análise
- **Integrações** → Pluggy, Asaas, Telegram
- **Cadastros** → Imóveis, Contratos, Prestadores
- **Consultas** → Transações, Contas, Livro Razão
- **Configurações** → Usuários, Permissões, Auditoria

---

## DRE - Demonstração de Resultado

Análise mensal de receitas, deduções, despesas e lucro.

### Acessar DRE

1. Menu lateral → **Relatórios** → **DRE**
2. Tela com seletor de **Mês** e **Ano**

### Estrutura DRE

```
Demonstração de Resultado do Exercício - Outubro/2026

RECEITA
├─ Aluguel de Imóveis ..................... R$ 42.000
├─ Honorários Advocatícios ................ R$ 2.500
├─ Outras Receitas ........................ R$ 820
└─ RECEITA BRUTA .......................... R$ 45.320

DEDUÇÕES (impostos, taxas)
├─ ISS (5% de honorários) ................. R$ 125
├─ Taxa de transferência PIX .............. R$ 45
└─ TOTAL DEDUÇÕES ......................... R$ 170

RECEITA LÍQUIDA ........................... R$ 45.150

DESPESAS
├─ Administração
│  ├─ Condomínio .......................... R$ 4.200
│  ├─ IPTU ................................ R$ 1.800
│  └─ Seguro .............................. R$ 500
├─ Manutenção & Reparos
│  ├─ Encanador ........................... R$ 450
│  ├─ Eletricista ......................... R$ 600
│  └─ Pintura ............................. R$ 2.100
├─ Pessoal
│  ├─ Contador ............................ R$ 800
│  └─ Advogado ............................ R$ 1.200
└─ Financeiras
   ├─ Boleto (taxa) ....................... R$ 50
   └─ Juros .......................... R$ 200
TOTAL DESPESAS ............................ R$ 11.900

RESULTADO DO EXERCÍCIO
├─ LUCRO BRUTO (Receita - Deduções) ....... R$ 45.150
├─ (-) Despesas Operacionais ............. R$ 11.900
└─ LUCRO LÍQUIDO .......................... R$ 33.250
```

### Ações na DRE

**Botões disponíveis:**

| Botão | O que faz |
|-------|-----------|
| **Exportar PDF** | Salva DRE em PDF para auditoria/declaração |
| **Comparar Períodos** | Lado-a-lado: este mês vs. mês passado |
| **Análise de Desvios** | Mostra onde foi gasto mais que o esperado |
| **Histórico** | Últimos 12 meses em tabela |
| **Recarregar** | Recalcula baseado em transações atuais |

### Exemplo: Exportar DRE

1. Selecione **Mês** e **Ano**
2. Clique em **"Exportar PDF"**
3. Arquivo `DRE_outubro_2026.pdf` baixa
4. Abra em qual aplicativo de PDF preferir

---

## Fluxo de Caixa e Previsões

Veja entradas e saídas do mês e previsão para os próximos 30 dias.

### Acessar Fluxo

1. Menu lateral → **Relatórios** → **Fluxo de Caixa**
2. Abas: **Histórico** | **Projeção**

### Aba "Histórico" (Mês Atual)

```
Fluxo de Caixa Histórico - Outubro/2026

Saldo Inicial (01/10): R$ 12.450

ENTRADAS
┌──────────────────────────────────────┐
│ 05/10 Aluguel Apartamento 101 R$ 3.000│
│ 05/10 Aluguel Apartamento 102 R$ 3.000│
│ 10/10 Aluguel Cobertura          R$ 4.000│
│ 15/10 Reembolso Conta Luz        R$ 85 │
├──────────────────────────────────────┤
│ TOTAL ENTRADAS: R$ 10.085            │
└──────────────────────────────────────┘

SAÍDAS
┌──────────────────────────────────────┐
│ 03/10 Condomínio Apt 101       R$ 800 │
│ 05/10 Conta de Água            R$ 120│
│ 08/10 Juros Empréstimo         R$ 200│
│ 20/10 Pagamento Contador       R$ 800│
├──────────────────────────────────────┤
│ TOTAL SAÍDAS: R$ 1.920              │
└──────────────────────────────────────┘

MOVIMENTO LÍQUIDO: +R$ 8.165
Saldo Final (31/10): R$ 20.615
```

### Aba "Projeção" (Próximos 30 dias)

```
Fluxo de Caixa Projetado - Próximos 30 dias

Saldo Início: R$ 20.615

Dia 05/11 ENTRADA Aluguel ..................... +R$ 10.000
Dia 10/11 SAÍDA Condomínio .................... -R$ 2.400
Dia 15/11 ENTRADA Reembolso ................... +R$ 300
Dia 20/11 SAÍDA Contador ...................... -R$ 800
...

Saldo Projetado em 30 dias: R$ 27.115
```

**Análise de Risco:**
- Verde: Saldo positivo previsto
- Amarelo: Saldo abaixo de R$ 5.000
- Vermelho: Risco de negativar

### Ações no Fluxo

| Ação | Como fazer |
|------|-----------|
| **Ajustar Projeção** | Adicionar evento futuro manualmente |
| **Alertar se Negativo** | Sistema notifica via email se saldo < 0 |
| **Comparar com Mês Anterior** | Ver se padrão se repetiu |

---

## Margens por Propriedade

Analise rentabilidade de cada imóvel: quanto cada apartamento/cobertura rendeu vs. despendeu.

### Acessar Margens

1. Menu lateral → **Integrações** → **Margens por Propriedade**
2. Tabela com ranking de rentabilidade

### Exemplo de Tabela

```
ANÁLISE DE MARGENS POR PROPRIEDADE

Imóvel              Receita    Despesas   Margem    Retorno
────────────────────────────────────────────────────────
Apt 101 (Bloco A)   R$ 3.000   R$ 800     R$ 2.200   73%  🟢
Cobertura (10º)     R$ 4.000   R$ 1.500   R$ 2.500   62%  🟢
Apt 102 (Bloco B)   R$ 2.000   R$ 1.200   R$ 800     40%  🟡
Comercial           R$ 2.500   R$ 900     R$ 1.600   64%  🟢

TOTAL              R$ 11.500   R$ 4.400   R$ 7.100   62%
```

**Cores:**
- 🟢 Verde: >60% rentabilidade
- 🟡 Amarelo: 40-60%
- 🔴 Vermelho: <40% (avaliar se vale manter alugado)

### Ações

1. **Clicar em uma propriedade**: detalha todas transações daquele imóvel
2. **Filtrar por período**: Mês, Trimestre, Ano
3. **Exportar**: Tabela em Excel para análise

---

## Integração Bancária (Pluggy)

Sincronize contas e transações de múltiplos bancos automaticamente.

### Pré-requisitos

- Credenciais Pluggy configuradas em `.env` (server)
- Contas bancárias cadastradas em sistema banco

### Conectar Primeira Conta

1. Menu lateral → **Integrações** → **Sincronização Pluggy**
2. Clique em **"+ Conectar Nova Conta"**
3. Widget Pluggy abre:
   - Selecione seu banco
   - Insira login/senha do banco
   - Autorize acesso
4. Sistema traz últimas 3 meses de transações

### Transações Importadas

```
Conta: Itaú 123456-7 - João Silva

Data       Descrição                    Débito    Crédito   Saldo
────────────────────────────────────────────────────────────────
01/10 DOC Transferência Aluguel                  3.000     3.000
02/10 DEBITÓWiFi Metrô                 45                  2.955
05/10 TED Pagamento Contador            800                2.155
10/10 DOC Transferência Aluguel                  3.000     5.155
```

### Ações

| Ação | Como |
|------|------|
| **Sincronizar Agora** | Busca últimas transações (30 seg) |
| **Categorizar Transação** | Aluga → "Receita" / Água → "Utilidades" |
| **Marcar como Pessoal** | Ignora de relatórios contábeis |
| **Desconectar Conta** | Remove integração (histórico fica) |

### Troubleshooting Pluggy

| Problema | Solução |
|----------|---------|
| "Acesso negado ao banco" | Tente novamente; banco pode bloquear de novo |
| "Transações duplicadas" | Sistema detecta; marca uma como "ignorada" |
| "Conta desconectou" | Reconectar no widget Pluggy |

---

## Cobrança via Asaas

Crie boletos e PIX para cobrar aluguéis, reembolsos, honorários.

### Acessar Asaas

1. Menu lateral → **Integrações** → **Cobranças Asaas**
2. Duas abas: **Criar Cobrança** | **Histórico**

### Aba "Criar Cobrança"

```
┌─────────────────────────────────────┐
│ Criar Nova Cobrança                 │
├─────────────────────────────────────┤
│                                     │
│ Tipo de Cobrança:                   │
│ ☑ PIX (instantâneo)                │
│ ☐ Boleto (até 3 dias)              │
│                                     │
│ Pagador:                            │
│ [Selecionar Inquilino ...         ] │
│ Ou nome manual: __________________ │
│                                     │
│ CPF/CNPJ do Pagador: _____________ │
│                                     │
│ Valor: R$ _____________________    │
│                                     │
│ Data de Vencimento:                │
│ [___/___/___]                      │
│                                     │
│ Descrição:                          │
│ Aluguel mês de outubro / 2026 ___   │
│                                     │
│ [Criar Cobrança] [Cancelar]         │
└─────────────────────────────────────┘
```

### Passo 1: Preencher Formulário

1. **Tipo**: Escolha PIX (instantâneo) ou Boleto (3 dias)
2. **Pagador**: Selecione inquilino já cadastrado OU digite nome
3. **CPF/CNPJ**: Identificar pagador
4. **Valor**: Quanto cobrar (ex: 3.000 para aluguel)
5. **Vencimento**: Data esperada de pagamento
6. **Descrição**: Motivo (Aluguel Outubro)

### Passo 2: Criar Cobrança

Clique em **"Criar Cobrança"**

**Se PIX:**
- QR code aparece
- Copie chave PIX de cópia e cola
- Compartilhe com pagador (WhatsApp, email)
- Pagamento é instantâneo

**Se Boleto:**
- Código de barras gerado
- Compartilhe com pagador
- Lembrete automático se não pagar até vencimento

### Aba "Histórico"

```
Cobranças Emitidas - Últimas 30 dias

Status │ Data   │ Pagador         │ Valor    │ Ação
────────────────────────────────────────────────────
✅ Pago │ 05/10 │ João (Apt 101) │ 3.000   │ Recibo
⏳ Pend │ 10/10 │ Maria (Apt 102)│ 3.000   │ Reenviar
✅ Pago │ 15/10 │ Industrial Ltda│ 2.500   │ NF-e
```

### Ações

1. **Recibo**: Baixa comprovante da Asaas (PDF)
2. **Reenviar**: Envia QR/boleto novamente via WhatsApp/email
3. **Cancelar**: Só se boleto ainda não foi pago
4. **Relatório Mensal**: Totalizações por tipo de cobrança

---

## Reembolsos de Despesas

Solicit e receba reembolsos de prestadores: pedreiro, encanador, advogado.

### Acessar Reembolsos

1. Menu lateral → **Integrações** → **Reembolsos**
2. Botão **"+ Registrar Reembolso"**

### Criar Reembolso

```
┌─────────────────────────────────────┐
│ Registrar Reembolso de Despesa      │
├─────────────────────────────────────┤
│                                     │
│ Prestador: [Selecione...         ] │
│  (ex: João Pedreiro)                │
│                                     │
│ Data do Gasto: [___/___/___]        │
│                                     │
│ Categoria:                          │
│ [Manutenção ▼]                     │
│  - Pintura                         │
│  - Encanamento                     │
│  - Eletricidade                    │
│  - Vidraçaria                      │
│                                     │
│ Descrição: Reparo cano cozinha Apt 101
│                                     │
│ Valor: R$ 450                       │
│                                     │
│ Comprovante (NF/recibo):            │
│ [Escolher arquivo...]              │
│                                     │
│ [Registrar] [Cancelar]             │
└─────────────────────────────────────┘
```

### Fluxo do Reembolso

```
1. Você registra despesa de prestador
   ↓
2. Prestador recebe notificação (email/WhatsApp)
   ↓
3. Prestador confirma valor e anexa recibo
   ↓
4. Você gera cobrança (PIX/Boleto)
   ↓
5. Prestador recebe valor + comprovante
```

### Acompanhamento

Clique em **reembolso pendente** para ver:
- Status atual
- Documentos anexados
- Histórico de comunicação

---

## Lembretes de Vencimento

Receba alertas automáticos de datas importantes: vencimento contrato, IPTU, condomínio.

### Acessar Lembretes

1. Menu lateral → **Integrações** → **Lembretes de Vencimento**
2. Lista com calendário visual

### Adicionar Lembrete

```
Novo Lembrete

Descrição: Renovação Seguro Imóvel
Data: 15/11/2026
Categoria: [Seguros ▼]
Notificar: [Dia anterior] vs [2 dias antes]
Repetir: [Anualmente ▼]
  - Uma vez
  - Mensalmente
  - Trimestralmente
  - Anualmente

[Salvar] [Cancelar]
```

### Notificações

Quando lembrete está próximo:

- 📧 Email para seu inbox
- 📱 Notificação no app (se instalado como PWA)
- 📲 WhatsApp (se configurado)
- 🤖 Telegram (se bot conectado)

### Gerenciamento

| Ação | Fazer |
|------|-------|
| Editar | Clique no lembrete → Altere data/descrição |
| Deletar | Ícone 🗑 à direita |
| Marcar como Concluído | ✅ checa-se automaticamente passada data |

---

## Detecção de Anomalias

Sistema analisa transações e avisa quando algo é incomum: valor alto, horário estranho, padrão diferente.

### Acessar Anomalias

1. Menu lateral → **Relatórios** → **Detecção de Anomalias**
2. Dashboard com gráficos e alertas

### Tipos de Anomalia Detectada

```
TRANSACTION ANOMALY DETECTION - Outubro/2026

🔴 CRÍTICA (1 alerta)
├─ 15/10 às 02:47 - Transferência PIX R$ 15.000
│  Motivo: Valor 5x acima da média em qualquer horário
│  Ação Recomendada: Verificar se autorizado
│
🟡 AVISO (3 alertas)
├─ 08/10 - Débito Conta de Água R$ 850
│  Motivo: 3x acima do normal (média: R$ 280)
│  Ação: Verificar vazamento?
│
├─ 22/10 às 11:30 - Saque R$ 5.000
│  Motivo: Horário estranho (padrão: fins de semana)
│  Ação: Confirmada? Sim / Não
│
└─ 30/10 - Depósito R$ 50 de "Pessoa Física"
   Motivo: CPF não cadastrado
   Ação: Você conhece?

🟢 SEM ALERTAS para as demais transações
```

### Investigar Anomalia

1. Clique na transação suspeita
2. Painel detalha:
   - Histórico desta categoria
   - Gráfico de tendência
   - Detalhes da transação
3. Marque como:
   - ✅ "Verificada" (autorizada)
   - 🔍 "Sob Revisão" (aguardando investigação)
   - ⚠️ "Fraude?" (notificar banco)

### Métodos de Detecção

O sistema usa 3 técnicas simultâneas:

1. **2-Sigma**: Valores muito acima da média (2x desvio padrão)
2. **IQR (Quartil)**: Outliers em distribuição de dados
3. **Percentile**: Valores fora do 1º percentil normal

Consenso de 2/3 métodos = alerta

---

## FAQ e Troubleshooting

### Login e Acesso

**P: Esqueci minha senha**
R: Contacte o titular (administrador) do sistema para resetar. Não há auto-reset por segurança.

**P: Preciso criar outro usuário**
R: Apenas titular pode criar. Menu → Gerenciamento → Usuários → Novo Usuário

**P: Qual a diferença entre papéis?**
R: 
- **Titular**: acesso total (criar usuários, editar permissões)
- **Contador**: criar transações, gerar relatórios, mas não deletar
- **Auditor**: só leitura (visualizar dados, gerar relatórios)

### Dados e Sincronização

**P: As transações não aparecem na DRE**
R: Verificar:
1. Transação foi categorizada? (sem categoria = ignorada)
2. Data está dentro do mês/ano selecionado?
3. Não está marcada como "Pessoal"?

**P: Banco desconectou do Pluggy**
R: Acontece quando banco detecta suspensa login. Reconectar no widget.

**P: Quantas contas posso adicionar?**
R: Sem limite, mas lembre: seu banco detectar múltiplas conexões pode bloquear.

### Cobranças Asaas

**P: PIX não foi pago, como cancelar?**
R: Cobranças PIX não podem cancelar (são instantâneas). Para boleto, sim.

**P: Pagador disse que pagou mas não aparece**
R: Asaas pode levar até 5 minutos para confirmar. Tente recarregar página.

**P: Como saber se cobrança foi visualizada?**
R: Para PIX, sim (status "visualizado QR code"). Para boleto, sim (se escaneou).

### Exportação e Relatórios

**P: Não consigo exportar PDF**
R: Verificar:
1. Navegador suporta jsPDF? (Chrome, Firefox, Safari ok)
2. Você tem dados do período selecionado?
3. Tentar em outro navegador

**P: Excel tem números estranhos**
R: Abrir com separador "," (vírgula) em vez de ";" (ponto-vírgula).

### Segurança

**P: Posso usar este sistema em prod com dinheiro real?**
R: Sim, com ressalvas:
- Sempre use HTTPS (nunca HTTP)
- Coloque atrás de firewall/VPN
- Trocar senha raiz regularmente
- Backups automáticos ligados
- Nunca compartilhar API_KEY

**P: Onde meus dados são armazenados?**
R: No servidor Backend (SQLite). Frontend tem cópia offline (sql.js no navegador) para trabalhar sem internet.

**P: Se deletar transação, pode recuperar?**
R: Não há "trash" permanente. Apenas titular + auditor podem recuperar via trilha de auditoria.

### Performance

**P: Sistema fica lento com muitas transações**
R: Normal. Verificar:
1. Filtros: reduzir período (ex: últimos 3 meses em vez de 1 ano)
2. Atualizar navegador à versão mais recente
3. Limpar cache (Ctrl+Shift+Del)
4. Se ainda lento, backend pode estar sobrecarregado

**P: Banco de dados local ficou corrompido**
R: Limpar IndexedDB:
1. F12 → Application → IndexedDB
2. Delete banco "crmt_v1"
3. Recarregar página
4. Sistema sincroniza com backend

### Integração Telegram

**P: Bot Telegram não responde**
R: Verificar:
1. TELEGRAM_BOT_TOKEN está em .env?
2. Bot foi iniciado? (`npm run dev` no server)
3. Você digitou `/start` no Telegram?

**P: Fotos de NF não são reconhecidas (OCR)**
R: Dicas:
- Foto com boa iluminação
- Ângulo reto (não oblíquo)
- Português = mais preciso que inglês
- 50-60% das notas funcionam bem

---

## Contato e Suporte

- 📧 Email: support@crmt.app
- 🐛 Bugs: Abrir issue no GitHub
- 💬 Dúvidas: Consultar CLAUDE.md (arquitetura técnica)
- 📱 Telefone: Não disponível (sistema é self-service)

---

**Última atualização**: Outubro 2026  
**Versão**: 1.0  
**Status**: Produção
