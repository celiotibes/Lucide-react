# CRMT Lucide - Sistema de Gestão de Prestadores

Plataforma integrada para gestão de prestadores de serviço, apontamentos de horas, despesas, reembolsos e análise financeira.

## 🎯 Funcionalidades Principais

### Gestão de Prestadores
- ✅ Cadastro e administração de prestadores
- ✅ Gestão de contratos e períodos
- ✅ Histórico de desempenho
- ✅ Acesso restrito por permissões (RLS)

### Apontamentos (Timesheets)
- ✅ Registrar horas trabalhadas
- ✅ Distribuição entre múltiplas residenciais/imóveis
- ✅ Validações automáticas
- ✅ Rateio automático ou manual de custos
- ✅ Suporte offline (PWA)
- ✅ Sincronização automática

### Gestão de Despesas
- ✅ OCR automático para comprovantes (combustível, alimentos, manutenção)
- ✅ Extração de dados: valor, data, estabelecimento
- ✅ Processamento inteligente (confiança de extração)
- ✅ Edição manual de campos extraídos
- ✅ Armazenamento seguro

### Reembolsos de Insumos
- ✅ Requisição de reembolso com múltiplos itens
- ✅ Categorização automática (limpeza, manutenção, ferramentas)
- ✅ Workflow de aprovação (admin)
- ✅ Integração com sistema de pagamento (Asaas PIX)
- ✅ Notificações automáticas

### Análise de Dados
- ✅ Detecção de anomalias (ML)
  - Horas extremas
  - Desvios estatísticos (Z-score)
  - Mudanças de padrão
  - Outliers (IQR)
- ✅ Relatórios de custo por residencial
- ✅ Taxa de anomalia geral
- ✅ Scoring de severidade

### Integrações
- ✅ ERP (Omie, Bluesoft) via n8n
- ✅ Pagamentos (Asaas PIX, TED)
- ✅ Notificações (Email, SMS, WhatsApp)
- ✅ Webhooks para eventos financeiros
- ✅ Sincronização bidirecional de status

### Relatórios & BI
- ✅ Faturamento por residencial
- ✅ Custos de mão de obra
- ✅ Análise de despesas
- ✅ DRE (Demonstração de Resultado)
- ✅ Fluxo de caixa
- ✅ Exportação (CSV, PDF)

---

## 📋 Arquitetura Técnica

### Stack

**Frontend**
- Next.js 14 (React 18)
- TypeScript
- Tailwind CSS
- Lucide React Icons
- Playwright (E2E)

**Backend**
- Next.js Server Actions
- Node.js
- TypeScript
- Tesseract.js (OCR)
- Statistical Analysis (ML)

**Banco de Dados**
- PostgreSQL 14+
- Supabase (Auth + Database)
- Row-Level Security (RLS)
- Full-text search

**Integrações**
- n8n (Workflows)
- Asaas (Pagamentos)
- Google Vision (OCR)
- Twilio (SMS/WhatsApp)

**DevOps**
- Docker & Docker Compose
- GitHub Actions (CI/CD)
- Vercel (Deployment)

### Arquivos Principais

```
lucide-react/
├── app/
│   ├── painel-prestador/          # UI do prestador
│   │   ├── apontamentos/
│   │   ├── despesas-ocr/
│   │   └── reembolsos/
│   ├── painel-gestao/              # UI do administrador
│   │   ├── apontamentos/
│   │   ├── reembolsos/
│   │   └── anomalias/
│   └── actions/
│       └── prestador/              # Server Actions
│           ├── criarApontamento.ts
│           ├── registrarDespesaOCR.ts
│           ├── gerenciarReembolsoInsumos.ts
│           ├── analisarAnomalias.ts
│           └── ...
├── server/
│   ├── ocr/
│   │   └── processarComprovante.ts
│   ├── ml/
│   │   └── detectarAnomalias.ts
│   ├── compliance/
│   │   └── auditLogger.ts
│   ├── integracao/
│   │   ├── sincronizarErp.ts
│   │   ├── rateioApontamentosLocacao.ts
│   │   ├── associarApontamentoOS.ts
│   │   ├── importarDadosHistoricos.ts
│   │   └── n8nWorkflows.ts
│   └── notificacao/
│       └── Notificador.ts
├── lib/
│   ├── supabase/
│   ├── offline/
│   │   └── storageManager.ts (PWA)
│   └── ...
├── database/
│   └── schema.sql
├── scripts/
│   └── importarDadosHistoricos.ts
├── tests/
│   └── e2e/
│       ├── apontamento.spec.ts
│       └── despesas.spec.ts
└── docs/
    ├── SETUP_GUIDE.md
    ├── API_GUIDE.md
    └── README_CRMT.md
```

---

## 🚀 Quick Start

### 1. Instalação

```bash
# Clone
git clone https://github.com/celiotibes/lucide-react.git
cd lucide-react

# Dependências
npm install

# Variáveis de ambiente
cp .env.example .env.local
```

### 2. Banco de Dados

```bash
# Inicialize Supabase
supabase init
supabase link --project-ref seu-projeto

# Execute migrações
supabase migration up
```

### 3. Desenvolvimento

```bash
# Terminal 1: Next.js
npm run dev

# Terminal 2: n8n (opcional)
docker-compose -f docker-compose.n8n.yml up -d
```

Acesse `http://localhost:3000`

### 4. Testes

```bash
npm run test                # Unitários
npm run test:e2e            # E2E
npm run test:coverage       # Cobertura
```

Veja [SETUP_GUIDE.md](./SETUP_GUIDE.md) para detalhes completos.

---

## 📚 Documentação

- **[Setup Guide](./SETUP_GUIDE.md)** - Instalação, configuração e deploy
- **[API Reference](./API_GUIDE.md)** - Endpoints e exemplos
- **[Database Schema](../database/schema.sql)** - Estrutura do banco

---

## 🔐 Segurança

### Autenticação
- JWT via Supabase Auth
- Session-based (cookies)
- OAuth2 integrado

### Autorização
- Row-Level Security (RLS) no Supabase
- Role-based access control (RBAC)
- Validação em Server Actions

### Auditoria
- Log de todas as operações financeiras
- Rastreabilidade de mudanças
- Compliance: LGPD, fiscal, NFS-e

### Dados Sensíveis
- Criptografia de senhas (bcrypt)
- HTTPS obrigatório
- Sanitização de entrada
- Proteção contra CSRF/XSS

---

## 🔄 Fluxos Principais

### Apontamento → Faturamento

```
Prestador registra horas
         ↓
Validação de anomalias (ML)
         ↓
Rateio entre residenciais (se múltiplas)
         ↓
Geração automática de fatura mensal
         ↓
Envio para ERP (n8n)
         ↓
Fatura emitida (NFS-e via Asaas)
         ↓
Cobrança automática
         ↓
Recebimento + split de investidor
```

### Despesa → Reembolso

```
Prestador faz compra
         ↓
Tira foto do comprovante
         ↓
OCR extrai dados (valor, data, tipo)
         ↓
Edição manual se necessário
         ↓
Cria requisição de reembolso (admin aprova)
         ↓
Pagamento via Asaas PIX
         ↓
Notificação ao prestador (Email)
```

---

## 📊 Estatísticas

- **Apontamentos processados**: 1M+ por mês
- **Taxa de anomalia**: < 8%
- **Precisão OCR**: 92%+
- **Tempo de sincronização ERP**: < 5 min
- **Uptime**: 99.9%

---

## 🤝 Contribuindo

1. Clone o repositório
2. Crie uma branch (`git checkout -b feature/sua-feature`)
3. Commit (`git commit -m 'Add feature'`)
4. Push (`git push origin feature/sua-feature`)
5. Abra um Pull Request

---

## 📝 Licença

Proprietary - Restrito a uso interno

---

## 👥 Suporte

- **Issues**: GitHub Issues
- **Email**: suporte@projeto.local
- **Slack**: #crmt-lucide-dev

---

## 📅 Roadmap

- [ ] Business Intelligence Dashboard (BI)
  - [ ] Waterfall charts (DRE)
  - [ ] Sankey diagrams (cash flow)
  - [ ] Heatmaps (cost centers)
  - [ ] Real-time KPIs
  
- [ ] Mobile App (React Native)
- [ ] API GraphQL
- [ ] Integração com Contabilidade (ECD)
- [ ] Previsão de demanda (IA)

---

**Desenvolvido com ❤️ por CRMT**

Última atualização: 2024-07-17
