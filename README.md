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
app/            Next.js App Router — back-office: imóveis, contratos, faturas (leitura + cadastro)
lib/            helpers de apresentação (formatação de moeda/data) — sem regra de negócio
server/
  financeiro/   juros/multa, pró-rata, split de pagamento, rendimento de caução (funções puras testadas)
  energia/      faturamento de energia com franquia mínima (função pura testada)
  integracao/   liga o schema ao motor financeiro (régua de cobrança), testado contra Postgres real
  asaas/        cliente de cobrança (boleto/PIX) e interpretador de webhook, testado com HTTP mockado
  ai-gateway/   seleção de provedor de IA por tarefa, com bloqueios de LGPD e de credit-scoring
database/       schema.sql (DDL PostgreSQL/Supabase) + README de aplicação
docs/           auditoria, arquitetura, roadmap, riscos/custos, benchmark de mercado
```

## Rodando localmente

```
npm install
cp .env.example .env.local   # preencha DATABASE_URL com um Postgres que já tenha database/schema.sql aplicado
npm run dev                  # Next.js em modo desenvolvimento
npm test                     # testes unitários (financeiro, energia, asaas, ai-gateway) — não precisam de banco
npm run test:integration     # régua de cobrança + cadastros contra Postgres real — precisa de DATABASE_URL
npm run build                # build de produção
```

Sem `DATABASE_URL` configurada, as telas do back-office (`/imoveis`, `/contratos`, `/faturas`) mostram uma mensagem de erro de conexão em vez de quebrar — o build de produção não depende de banco disponível.

## Estado atual (ver `docs/04-roadmap-fases.md` para o roadmap completo)

Fase 0 em andamento: cadastro de imóvel e contrato funcionam de ponta a ponta (formulário → transação no banco → lista atualizada), verificado com testes de integração e submissão real num navegador headless. O cliente Asaas está implementado e testado com HTTP mockado, mas **nunca foi executado contra o sandbox real do Asaas** (sem chave de API neste ambiente) — isso, e a autenticação do portal do inquilino/investidor (precisa de um projeto Supabase real), são os dois itens que só avançam com credenciais que só você pode gerar. 85 testes automatizados no total (70 unitários + 15 de integração), todos passando.
