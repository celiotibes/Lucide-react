# 🏛️ Sistema de Automação Jurídica para Tribunais Brasileiros

[![CI/CD Pipeline](https://github.com/celiotibes/Lucide-react/workflows/CI%2FCD%20Pipeline/badge.svg)](https://github.com/celiotibes/Lucide-react/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Version](https://img.shields.io/badge/version-1.0.0-blue.svg)](./package.json)
[![Status](https://img.shields.io/badge/status-Production%20Ready-brightgreen)](./PHASES_SUMMARY.md)

Sistema completo de automação jurídica com integração com 15+ tribunais brasileiros, processamento de pagamentos, backup e disaster recovery.

## 🚀 Características Principais

### Integração com Tribunais
- **15+ Tribunais Suportados**: TJSC, TRF4, JFPR, TJPR, JUST, TJMT, TJRO, JFSC, TJAL, TJPI, TJMA, TJSP, TJRS, TJMG
- **Múltiplos Sistemas**: eProc, PJe, eSAJ, DataJud
- **Sincronização Automática**: Polling configurável com priorização
- **Detecção de Mudanças**: Snapshots para identificar movimentos e documentos

### Assinatura Digital
- **ICP-Brasil Completo**: Certificados A1, A3, A4
- **Formatos**: CMS, XAdES, PAdES
- **RFC 3161**: Carimbos de tempo autenticados
- **Gerenciamento**: Upload, validação, expiração

### Relatórios e Análises
- **10 Tipos de Relatórios**: Casos, financeiro, prazos, performance, tempo
- **4 Formatos**: PDF, Excel, CSV, HTML
- **Visualizações**: Gráficos interativos
- **Agendamento**: Recorrência automática

### Pagamentos Integrados
- **3 Provedores**: Stripe, PayPal, Mercado Pago
- **Métodos**: Cartão crédito, transferência, PIX, débito
- **Webhooks**: Verificação de assinatura
- **Reconciliação**: Automática e auditável

### Backup e Recuperação
- **RTO/RPO < 1 hora**: Garantido
- **Multi-backend**: Local, S3, GCS, Azure, FTP
- **Verificação**: Checksums SHA-256
- **Automático**: Agendamento configurável

### Dashboard Mobile
- **Single API Call**: Otimizado para redes móveis
- **Paginação e Filtros**: Casos com busca avançada
- **Tempo Real**: WebSocket para atualizações
- **Responsivo**: Totalmente adaptado

## 📋 Pré-requisitos

- **Node.js 20+**
- **PostgreSQL 15+** (ou SQLite para desenvolvimento)
- **Redis 7+** (opcional, para cache)
- **Docker** (opcional, para containerização)

## 🔧 Instalação Rápida

### 1. Clone o Repositório
```bash
git clone https://github.com/celiotibes/Lucide-react.git
cd legal-automation
```

### 2. Configuração de Ambiente
```bash
cp .env.example .env
# Edite .env com suas configurações
```

### 3. Instalação de Dependências
```bash
npm install
```

### 4. Executar Migrations
```bash
npm run db:migrate
```

### 5. Iniciar Aplicação
```bash
# Desenvolvimento
npm run dev

# Produção
npm run build
npm start
```

## 🐳 Docker Compose (Recomendado)

```bash
# Iniciar todos os serviços
docker-compose up -d

# Ver logs
docker-compose logs -f app

# Parar
docker-compose down
```

Acesse em `http://localhost:3000`

## 📚 Documentação

- **[PHASES_SUMMARY.md](./PHASES_SUMMARY.md)** - Resumo de todas as 11 fases implementadas
- **[docs/DEPLOYMENT.md](./docs/DEPLOYMENT.md)** - Guia completo de deployment
- **[docs/API.md](./docs/API.md)** - Documentação de endpoints (em desenvolvimento)

## 🧪 Testes

```bash
# Executar testes unitários
npm test

# Modo watch
npm run test:watch

# Coverage
npm run test:coverage

# Testes E2E
npm run test:e2e
```

## 📊 Estrutura do Projeto

```
legal-automation/
├── src/
│   ├── adapters/          # Adaptadores de tribunais
│   ├── api/
│   │   ├── controllers/   # Endpoints REST
│   │   └── routes/        # Definição de rotas
│   ├── services/          # Lógica de negócio
│   ├── types/             # Tipos TypeScript
│   ├── utils/             # Funções utilitárias
│   ├── db/                # Conexão com banco
│   └── middleware/        # Autenticação, logs
├── scripts/               # Migrations e setup
├── docs/                  # Documentação
├── tests/                 # Testes E2E
├── Dockerfile             # Containerização
├── docker-compose.yml     # Orquestração local
└── package.json           # Dependências
```

## 🔐 Segurança

- ✅ **JWT Authentication**: Tokens seguros com expiração
- ✅ **LGPD Compliant**: Audit logging completo
- ✅ **PCI-DSS**: Dados de pagamento criptografados
- ✅ **Webhook Verification**: Assinaturas validadas
- ✅ **Rate Limiting**: Proteção contra abuso
- ✅ **CORS**: Políticas de origem configuradas

## 🎯 Endpoints Principais

### Autenticação
- `POST /auth/login` - Fazer login
- `POST /auth/refresh` - Renovar token
- `POST /auth/logout` - Fazer logout

### Casos
- `GET /cases` - Listar casos
- `GET /cases/:id` - Detalhes do caso
- `POST /cases` - Criar caso
- `PUT /cases/:id` - Atualizar caso

### Tribunais
- `GET /tribunals` - Listar tribunais
- `POST /sync/now/:tribunal` - Sincronizar agora
- `GET /sync/status` - Status de sincronização

### Pagamentos
- `POST /payments/process` - Processar pagamento
- `POST /payments/refund` - Reembolso
- `POST /payments/reconcile` - Reconciliação

### Relatórios
- `POST /reports/generate` - Gerar relatório
- `GET /reports/:id/download` - Download
- `POST /reports/schedule` - Agendar

### Backup
- `POST /backup/configure` - Configurar backup
- `POST /backup/execute` - Executar backup
- `POST /backup/restore` - Restaurar
- `GET /backup/metrics` - Métricas

## 📈 Performance

- **Response Time**: < 200ms (p95)
- **Database Queries**: Otimizadas com índices
- **Cache**: Redis para dados frequentes
- **Compression**: Gzip habilitado
- **Load Balancing**: Suporte para múltiplas replicas

## 🤝 Contribuindo

1. Fork o projeto
2. Crie uma branch para sua feature (`git checkout -b feature/AmazingFeature`)
3. Commit suas mudanças (`git commit -m 'Add some AmazingFeature'`)
4. Push para a branch (`git push origin feature/AmazingFeature`)
5. Abra um Pull Request

## 📝 Licença

Este projeto está sob a Licença MIT. Veja [LICENSE](./LICENSE) para detalhes.

## 👤 Autor

**Celiotibes**
- GitHub: [@celiotibes](https://github.com/celiotibes)
- Email: celiotibes@gmail.com

## 🙏 Agradecimentos

- Comunidade open-source brasileira
- Tribunais que forneceram APIs de integração
- Todos os contribuidores

## 📞 Suporte

- **Issues**: [GitHub Issues](https://github.com/celiotibes/Lucide-react/issues)
- **Email**: celiotibes@gmail.com
- **Documentação**: Veja `/docs` para guias completos

---

**Status**: ✅ Production Ready (v1.0.0)
**Última atualização**: 2026-07-05
