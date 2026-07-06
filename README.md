# CRMT Gestão Imobiliária — Sistema de Gestão

Projeto de sistema de gestão imobiliária para locação por contrato (Lei do Inquilinato) e locação por temporada, com portfólio em Curitiba e Florianópolis.

O design técnico completo — auditoria de escopo, gap analysis, arquitetura, roadmap faseado, riscos/custos e o schema relacional do banco de dados — está em [`docs/00-leia-primeiro.md`](docs/00-leia-primeiro.md) e [`database/schema.sql`](database/schema.sql).

## Stack (ver `docs/03-arquitetura-e-stack.md` e `docs/07-selecao-de-ia-e-custos.md`)

- Frontend/Backend: **Next.js** (App Router, TypeScript), autohospedado junto com n8n numa única VPS via Coolify
- Banco de dados / Auth / Storage: Supabase (PostgreSQL) — o back-office (`app/`) consulta o Postgres diretamente pelo servidor (ver `server/integracao/db.ts`); o portal do inquilino/investidor (ainda não implementado) usará Supabase Auth com RLS
- Pagamentos: Asaas (boleto, PIX, split)
- Orquestração/notificações: n8n
- IA: roteamento fixo por tarefa (Gemini Flash-Lite pago para OCR, Claude Sonnet/Haiku para texto jurídico e classificação) — ver `server/ai-gateway/`; nunca camada gratuita com dado pessoal; *credit scoring* nunca usa IA generativa
- Assinatura eletrônica: Autentique

## Estrutura do repositório

```
app/            Next.js App Router — telas do back-office (imóveis, contratos, faturas)
lib/            helpers de apresentação (formatação de moeda/data) — sem regra de negócio
server/
  financeiro/   juros/multa, pró-rata, split de pagamento, rendimento de caução (funções puras testadas)
  energia/      faturamento de energia com franquia mínima (função pura testada)
  integracao/   liga o schema ao motor financeiro (régua de cobrança), testado contra Postgres real
  ai-gateway/   seleção de provedor de IA por tarefa, com bloqueios de LGPD e de credit-scoring
database/       schema.sql (DDL PostgreSQL/Supabase) + README de aplicação
docs/           auditoria, arquitetura, roadmap, riscos/custos, benchmark de mercado
```

## Rodando localmente

```
npm install
cp .env.example .env.local   # preencha DATABASE_URL com um Postgres que já tenha database/schema.sql aplicado
npm run dev                  # Next.js em modo desenvolvimento
npm test                     # testes unitários (financeiro, energia, ai-gateway) — não precisam de banco
npm run test:integration     # régua de cobrança contra Postgres real — precisa de DATABASE_URL
npm run build                # build de produção
```

Sem `DATABASE_URL` configurada, as telas do back-office (`/imoveis`, `/contratos`, `/faturas`) mostram uma mensagem de erro de conexão em vez de quebrar — o build de produção não depende de banco disponível.

## Estado atual (ver `docs/04-roadmap-fases.md` para o roadmap completo)

Fase 0 em andamento: cadastro/contratos/faturas têm tela de leitura funcionando contra dados reais; ainda faltam formulários de escrita, autenticação (portal do inquilino/investidor) e a integração de cobrança com o Asaas.
