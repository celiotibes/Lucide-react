# Setup - Legal Automation Tool

Guia passo-a-passo para configurar a ferramenta de automação jurídica.

## Pré-requisitos

- Node.js 18+ ([download](https://nodejs.org/))
- npm 9+ ou yarn
- Docker & Docker Compose (opcional, para DB local)
- Git
- Certificado digital OAB (para produção)

## Instalação Rápida

### 1. Clonar Repositório

```bash
git clone https://github.com/seu-usuario/legal-automation.git
cd legal-automation
```

### 2. Instalar Dependências

```bash
npm install
```

### 3. Configurar Variáveis de Ambiente

```bash
cp .env.example .env
```

Editar `.env` com suas configurações:

```env
# Obrigatório
NODE_ENV=development
PORT=3000
JWT_SECRET=sua-chave-secreta-muito-segura-com-32-chars-min

# DataJud API
DATAJUD_API_KEY=sua_chave_publica_datajud

# Projudi
PROJUDI_WSDL_URL=https://tst.tjpr.jus.br/projudi/webservices/...
PROJUDI_USERNAME=seu_usuario
PROJUDI_PASSWORD=sua_senha

# Certificado
CERT_ENCRYPTION_KEY=chave-criptografia-certificados
```

### 4. Iniciar Servidor de Desenvolvimento

```bash
npm run dev
```

Servidor rodando em: `http://localhost:3000`

### 5. Testar Saúde

```bash
curl http://localhost:3000/health
```

Resposta esperada:
```json
{
  "status": "ok",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "uptime": 10.5,
  "environment": "development"
}
```

---

## Setup com Docker

### 1. Build da Imagem

```bash
docker build -t legal-automation:latest .
```

### 2. Rodar com Docker Compose

```bash
docker-compose up -d
```

Isso inicia:
- App (porta 3000)
- PostgreSQL (porta 5432)
- Redis (porta 6379)

### 3. Verificar Logs

```bash
docker-compose logs -f app
```

### 4. Parar Containers

```bash
docker-compose down
```

---

## Configuração Detalhada

### DataJud API

1. Acessar: https://www.cnj.jus.br/sistemas/datajud/
2. Registrar-se e obter chave API pública
3. Adicionar em `.env`:

```env
DATAJUD_API_KEY=sua_chave_aqui
DATAJUD_API_URL=https://apipublica.cnj.jus.br/api/v2
```

### Projudi TJPR

1. Solicitar credenciais ao TJPR: contato@tjpr.jus.br
2. WSDL disponível em: https://www.tjpr.jus.br/acesso-automatizado-por-sistemas-externos
3. Configurar em `.env`:

```env
PROJUDI_WSDL_URL=https://tst.tjpr.jus.br/projudi/webservices/projudiIntercomunicacaoWebService222?wsdl
PROJUDI_USERNAME=seu_usuario_tjpr
PROJUDI_PASSWORD=sua_senha_tjpr
```

### Certificado Digital

#### Obtendo Certificado

1. Requisitar certificado de advogado junto a AC credenciada ICP-Brasil
2. Opções populares:
   - CertSign
   - Valid
   - Serasa
   - Serpro

#### Instalando Certificado

```bash
# Upload via API
curl -X POST http://localhost:3000/api/v1/auth/certificate/upload \
  -H "Authorization: Bearer <token>" \
  -F "file=@certificado.pfx" \
  -F "password=sua_senha"
```

---

## Desenvolvimento

### Estrutura de Pastas

```
src/
├── auth/              # Autenticação
├── datajud/           # Integração CNJ
├── projudi/           # Integração TJPR
├── eproc/             # Integração TJSC
├── api/               # Rotas e controllers
├── services/          # Lógica de negócio
├── types/             # Interfaces TypeScript
└── utils/             # Helpers
```

### Linting

```bash
# Verificar
npm run lint

# Corrigir automaticamente
npm run lint:fix
```

### Formatação

```bash
npm run format
```

### Type Checking

```bash
npm run type-check
```

### Testes

```bash
# Rodar testes
npm test

# Watch mode
npm test --watch

# Coverage
npm test -- --coverage
```

---

## Build & Produção

### Build

```bash
npm run build
```

Gera pasta `dist/` com JavaScript compilado.

### Rodar em Produção

```bash
npm start
```

ou

```bash
NODE_ENV=production node dist/index.js
```

### Variáveis Críticas para Produção

```env
NODE_ENV=production
JWT_SECRET=CHAVE_SUPER_SECRETA_MUITO_LONGA
CERT_ENCRYPTION_KEY=CHAVE_CRIPTOGRAFIA_LONGA
LOG_LEVEL=info
```

---

## Troubleshooting

### Erro: "EADDRINUSE: address already in use :::3000"

```bash
# Matar processo na porta 3000
lsof -ti:3000 | xargs kill -9

# ou usar porta diferente
PORT=3001 npm run dev
```

### Erro: "DataJud API key not found"

```bash
# Verificar .env
cat .env | grep DATAJUD_API_KEY

# Se vazio, gerar em: https://www.cnj.jus.br/sistemas/datajud/
```

### Erro: "WSDL not found"

```bash
# Verificar WSDL URL
curl -I https://tst.tjpr.jus.br/projudi/webservices/...

# Se 404, usar staging ao invés de produção
```

### Erro: "Certificado inválido"

```bash
# Verificar se .pfx é válido
openssl pkcs12 -in certificado.pfx -nodes

# Ou use ferramenta de validação
```

### Erro: "Rate limit exceeded"

```bash
# Aguardar 60 segundos
# Implementar cache ou fila de requisições
```

---

## Testando Endpoints

### 1. Health Check

```bash
curl http://localhost:3000/health
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "teste@example.com",
    "password": "senha123"
  }'
```

### 3. Criar Desafio 2FA

```bash
# Use o token do login anterior
curl -X POST http://localhost:3000/api/v1/auth/2fa/challenge \
  -H "Authorization: Bearer SEU_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"method": "totp"}'
```

### 4. Buscar Processo

```bash
curl -X GET "http://localhost:3000/api/v1/processes/0000001-12.2023.8.26.0100" \
  -H "Authorization: Bearer SEU_TOKEN"
```

---

## Scripts Úteis

### Reiniciar Servidor

```bash
pkill -f "node dist/index.js"
npm start
```

### Limpar Cache

```bash
rm -rf dist/ node_modules/
npm install
npm run build
```

### Reset Banco de Dados

```bash
# Com Docker
docker-compose down -v
docker-compose up -d

# Sem Docker (PostgreSQL local)
psql -U legaluser -d legal_automation -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
```

### Ver Logs em Tempo Real

```bash
npm run dev 2>&1 | tail -f
```

---

## Próximos Passos

1. ✅ Instalar dependências
2. ✅ Configurar `.env`
3. ✅ Obter credenciais DataJud
4. ✅ Obter credenciais Projudi
5. ⬜ Executar testes
6. ⬜ Testar endpoints
7. ⬜ Implementar controllers
8. ⬜ Setup CI/CD
9. ⬜ Deploy em produção

---

## Suporte

Dúvidas? Abra uma issue no GitHub ou entre em contato:
- Email: celiotibes@gmail.com
- Discord: [link]
- Documentação: `/docs`

---

**Última atualização:** 2024-01-15
