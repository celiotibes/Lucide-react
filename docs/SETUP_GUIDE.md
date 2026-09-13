# Guia de Instalação e Configuração - CRMT Lucide

## Requisitos Mínimos

- Node.js 18+
- PostgreSQL 14+
- Supabase CLI
- Docker & Docker Compose (para n8n e serviços)

## 1. Setup Inicial

### Clone o repositório

```bash
git clone https://github.com/celiotibes/lucide-react.git
cd lucide-react
```

### Instale dependências

```bash
npm install
```

### Configure variáveis de ambiente

Crie `.env.local`:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://seu-projeto.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...

# Autenticação
NEXTAUTH_SECRET=$(openssl rand -base64 32)
NEXTAUTH_URL=http://localhost:3000

# APIs Externas
ASAAS_API_KEY=your_asaas_key
ASAAS_SANDBOX=true

# OCR
GOOGLE_VISION_API_KEY=your_vision_key

# Notificações
TWILIO_ACCOUNT_SID=your_twilio_sid
TWILIO_AUTH_TOKEN=your_twilio_token
TWILIO_PHONE_NUMBER=+55...

# n8n
N8N_EDITOR_URL=http://localhost:5678
N8N_API_KEY=n8n_...

# Bluesoft/Omie
BLUESOFT_TOKEN=your_token
OMIE_APP_KEY=your_app_key
OMIE_APP_SECRET=your_app_secret
```

## 2. Banco de Dados

### Inicialize Supabase

```bash
supabase init
supabase link --project-ref seu-projeto
```

### Execute migrações

```bash
supabase migration up
```

### Seed dados iniciais (opcional)

```bash
npx ts-node scripts/seedDatabase.ts
```

## 3. Iniciar Serviços

### Development

```bash
# Terminal 1: Next.js
npm run dev

# Terminal 2: n8n (para integrações ERP)
docker-compose -f docker-compose.n8n.yml up -d

# Terminal 3: PostgreSQL (se não usar Supabase cloud)
docker-compose up -d postgres
```

### Production

```bash
npm run build
npm run start
```

## 4. Importar Dados Históricos

### Prepare arquivo JSON

Crie `dados/apontamentos.json`:

```json
[
  {
    "prestador_id": "uuid-prestador",
    "data": "2023-01-15",
    "horas_trabalhadas": 8,
    "descricao": "Manutenção predial",
    "residenciais": ["uuid-residencial-1"]
  }
]
```

### Execute importação

```bash
# Apontamentos
npx ts-node scripts/importarDadosHistoricos.ts --tipo apontamentos --arquivo dados/apontamentos.json

# Fechamentos
npx ts-node scripts/importarDadosHistoricos.ts --tipo fechamentos --arquivo dados/fechamentos.json

# Ordens de Serviço
npx ts-node scripts/importarDadosHistoricos.ts --tipo ordens_servico --arquivo dados/os.json
```

## 5. Configurar Integrações

### n8n Workflows

Acesse `http://localhost:5678` e configure workflows:

1. **sync-orders**: Sincroniza ordens entre CRMT e Omie/Bluesoft
2. **push-status**: Atualiza status em tempo real
3. **prestador-sync**: Sincroniza dados de prestadores

### Webhooks Asaas

Configure em seu painel Asaas:

```
https://seu-dominio.com/api/webhooks/asaas
```

Eventos:
- Recebimento confirmado
- Cobrança emitida
- NFS-e gerada
- PIX recebido

### Twilio (Notificações SMS/WhatsApp)

1. Obtenha credenciais em `twilio.com`
2. Configure em `.env.local`
3. Valide número de teste no Twilio Console

## 6. Executar Testes

### Testes Unitários

```bash
npm run test
```

### Testes E2E

```bash
npm run test:e2e
```

### Cobertura

```bash
npm run test:coverage
```

## 7. Build e Deploy

### Build Production

```bash
npm run build
```

### Deploy Vercel

```bash
vercel deploy --prod
```

### Deploy Self-hosted

```bash
docker build -t crmt-lucide .
docker run -p 3000:3000 \
  -e DATABASE_URL=... \
  -e SUPABASE_URL=... \
  crmt-lucide
```

## 8. Monitoramento

### Logs

```bash
# Supabase logs
supabase functions list

# Vercel logs
vercel logs
```

### Métricas

- Acesse dashboard Vercel para performance
- Monitore uso de API do Supabase
- Acompanhe fila de sincronização n8n

## Troubleshooting

### Erro: "Supabase connection failed"

1. Verifique `NEXT_PUBLIC_SUPABASE_URL`
2. Teste conexão: `supabase status`
3. Reinicie servidor

### Erro: "OCR service unavailable"

1. Verifique `GOOGLE_VISION_API_KEY`
2. Ative Google Vision API no GCP Console
3. Aumente quota se necessário

### n8n não sincroniza

1. Acesse `http://localhost:5678`
2. Verifique credenciais Omie/Bluesoft
3. Teste webhook em "Test"

## Suporte

- Docs: `docs/` folder
- Issues: GitHub Issues
- Email: suporte@projeto.local

---

**Última atualização**: 2024-07-17
